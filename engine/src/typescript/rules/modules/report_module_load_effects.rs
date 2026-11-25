use crate::typescript::rules::Context;
use crate::typescript::rules::support::estree::{parent, string_value, symbol_of};
use oxc_ast::AstKind;
use oxc_ast::ast::{
    Argument, AssignmentOperator, AssignmentTarget, BinaryOperator, BindingPattern, CallExpression,
    Expression, IfStatement, ImportDeclaration, ImportDeclarationSpecifier, LogicalOperator,
    ModuleExportName, NewExpression, ObjectProperty, ObjectPropertyKind, PropertyKey, Statement,
};
use oxc_semantic::NodeId;
use oxc_span::{GetSpan, Span};
use std::collections::{HashMap, HashSet};

const RULE: &str = "report-module-load-effects";

const ENTRY_HINT: &str = " Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx, and the NestJS entry in nest-cli.json) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.";

const STYLESHEET_EXTENSIONS: &[&str] = &[".css", ".scss", ".sass", ".less", ".styl", ".pcss"];

const SYNC_API_MODULES: &[&str] = &[
    "fs",
    "node:fs",
    "graceful-fs",
    "fs-extra",
    "child_process",
    "node:child_process",
    "crypto",
    "node:crypto",
    "zlib",
    "node:zlib",
    "execa",
];

const EFFECT_CALLEES: &[&str] = &[
    "fetch",
    "setTimeout",
    "setInterval",
    "setImmediate",
    "queueMicrotask",
    "randomUUID",
    "randomBytes",
    "randomInt",
    "getRandomValues",
    "addEventListener",
];

const GLOBAL_OBJECTS: &[&str] = &["globalThis", "window", "self", "crypto"];
const EFFECT_MEMBER_CALLS: &[&str] = &["Date.now", "performance.now", "Math.random"];
const EFFECT_CONSTRUCTORS: &[&str] = &["Worker", "WebSocket", "XMLHttpRequest", "EventSource"];
const DESCRIPTOR_CALLS: &[&str] = &["assign", "defineProperty", "defineProperties"];

struct ModuleBindings {
    named: HashMap<String, String>,
    namespaces: HashSet<String>,
}

fn exported_name<'a>(name: &ModuleExportName<'a>) -> Option<&'a str> {
    match name {
        ModuleExportName::IdentifierName(id) => Some(id.name.as_str()),
        ModuleExportName::IdentifierReference(id) => Some(id.name.as_str()),
        ModuleExportName::StringLiteral(lit) => lit.value.as_str(),
    }
}

fn is_stylesheet_specifier(specifier: &str) -> bool {
    let base = specifier.split_once('?').map_or(specifier, |(head, _)| head);
    STYLESHEET_EXTENSIONS.iter().any(|ext| base.ends_with(ext))
}

fn collect_sync_bindings(context: &Context) -> ModuleBindings {
    let mut bindings = ModuleBindings { named: HashMap::new(), namespaces: HashSet::new() };
    for statement in &context.file.program.body {
        match statement {
            Statement::ImportDeclaration(import) => {
                if import.import_kind.is_type() {
                    continue;
                }
                let Some(source) = import.source.value.as_str() else { continue };
                if !SYNC_API_MODULES.contains(&source) {
                    continue;
                }
                for specifier in import.specifiers.iter().flatten() {
                    match specifier {
                        ImportDeclarationSpecifier::ImportSpecifier(named) => {
                            if let Some(imported) = exported_name(&named.imported) {
                                bindings.named.insert(named.local.name.to_string(), imported.to_string());
                            }
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(default_spec) => {
                            bindings.namespaces.insert(default_spec.local.name.to_string());
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(ns) => {
                            bindings.namespaces.insert(ns.local.name.to_string());
                        }
                    }
                }
            }
            Statement::VariableDeclaration(decl) => {
                for declarator in &decl.declarations {
                    let Some(init) = declarator.init.as_ref().map(Expression::without_parentheses) else {
                        continue;
                    };
                    let Expression::CallExpression(call) = init else { continue };
                    let is_require = matches!(call.callee.without_parentheses(), Expression::Identifier(id) if id.name == "require");
                    if !is_require {
                        continue;
                    }
                    let source = call
                        .arguments
                        .first()
                        .and_then(Argument::as_expression)
                        .and_then(|arg| string_value(arg.without_parentheses()));
                    let Some(source) = source else { continue };
                    if !SYNC_API_MODULES.contains(&source.as_str()) {
                        continue;
                    }
                    match &declarator.id {
                        BindingPattern::BindingIdentifier(id) => {
                            bindings.namespaces.insert(id.name.to_string());
                        }
                        BindingPattern::ObjectPattern(pattern) => {
                            for prop in &pattern.properties {
                                if !prop.computed
                                    && let PropertyKey::StaticIdentifier(key) = &prop.key
                                    && let BindingPattern::BindingIdentifier(value) = &prop.value
                                {
                                    bindings.named.insert(value.name.to_string(), key.name.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    bindings
}

fn imported_callee_name<'a>(callee: &'a Expression<'a>, bindings: &'a ModuleBindings) -> Option<&'a str> {
    match callee.without_parentheses() {
        Expression::Identifier(id) => bindings.named.get(id.name.as_str()).map(String::as_str),
        Expression::StaticMemberExpression(member) => {
            if let Expression::Identifier(obj) = member.object.without_parentheses()
                && bindings.namespaces.contains(obj.name.as_str())
            {
                Some(member.property.name.as_str())
            } else {
                None
            }
        }
        _ => None,
    }
}

fn callee_name_of<'a>(expr: &'a Expression<'a>) -> Option<&'a str> {
    match expr.without_parentheses() {
        Expression::Identifier(id) => Some(id.name.as_str()),
        Expression::StaticMemberExpression(member) => Some(member.property.name.as_str()),
        _ => None,
    }
}

fn member_path_expr<'a>(start: &'a Expression<'a>) -> Vec<Option<&'a str>> {
    let mut parts = Vec::new();
    let mut current = start.without_parentheses();
    loop {
        parts.push(callee_name_of(current));
        match current {
            Expression::StaticMemberExpression(member) => current = member.object.without_parentheses(),
            Expression::ComputedMemberExpression(member) => current = member.object.without_parentheses(),
            Expression::PrivateFieldExpression(member) => current = member.object.without_parentheses(),
            _ => break,
        }
    }
    parts.reverse();
    parts
}

fn member_path_target<'a>(target: &'a AssignmentTarget<'a>) -> Vec<Option<&'a str>> {
    match target {
        AssignmentTarget::AssignmentTargetIdentifier(id) => vec![Some(id.name.as_str())],
        AssignmentTarget::StaticMemberExpression(member) => {
            let mut parts = member_path_expr(&member.object);
            parts.push(Some(member.property.name.as_str()));
            parts
        }
        AssignmentTarget::ComputedMemberExpression(member) => {
            let mut parts = member_path_expr(&member.object);
            parts.push(None);
            parts
        }
        AssignmentTarget::PrivateFieldExpression(member) => {
            let mut parts = member_path_expr(&member.object);
            parts.push(None);
            parts
        }
        _ => vec![None],
    }
}

fn callee_text(callee: &Expression) -> Option<String> {
    let path = member_path_expr(callee);
    if path.iter().all(Option::is_some) {
        Some(path.into_iter().flatten().collect::<Vec<_>>().join("."))
    } else {
        None
    }
}

// --- Main guard detection (mirrors rules/modules/entry/main-guard.mts) ---

fn is_process_import_node(context: &Context, decl_id: NodeId) -> bool {
    let nodes = context.semantic.nodes();
    if !matches!(nodes.kind(decl_id), AstKind::ImportDefaultSpecifier(_) | AstKind::ImportNamespaceSpecifier(_)) {
        return false;
    }
    matches!(
        nodes.parent_kind(decl_id),
        AstKind::ImportDeclaration(import)
            if matches!(import.source.value.as_str(), Some("process" | "node:process"))
    )
}

fn is_global(context: &Context, expr: &Expression, name: &str) -> bool {
    let Expression::Identifier(id) = expr.without_parentheses() else {
        return false;
    };
    if id.name.as_str() != name {
        return false;
    }
    let Some(symbol) = symbol_of(context, expr.without_parentheses()) else {
        return true;
    };
    if name != "process" {
        return false;
    }
    let scoping = context.semantic.scoping();
    if !is_process_import_node(context, scoping.symbol_declaration(symbol)) {
        return false;
    }
    scoping.symbol_redeclarations(symbol).is_empty()
}

fn is_imported_helper(context: &Context, expr: &Expression, name: &str, allowed_modules: &[&str]) -> bool {
    let Expression::Identifier(id) = expr.without_parentheses() else {
        return false;
    };
    if id.name.as_str() != name {
        return false;
    }
    let Some(symbol) = symbol_of(context, expr.without_parentheses()) else {
        return false;
    };
    let scoping = context.semantic.scoping();
    if !scoping.symbol_redeclarations(symbol).is_empty() {
        return false;
    }
    let decl_id = scoping.symbol_declaration(symbol);
    let nodes = context.semantic.nodes();
    let AstKind::ImportSpecifier(spec) = nodes.kind(decl_id) else {
        return false;
    };
    if exported_name(&spec.imported) != Some(name) {
        return false;
    }
    matches!(
        nodes.parent_kind(decl_id),
        AstKind::ImportDeclaration(import)
            if import.source.value.as_str().is_some_and(|src| allowed_modules.contains(&src))
    )
}

fn static_member_object<'a>(expr: &'a Expression<'a>, property: &str) -> Option<&'a Expression<'a>> {
    match expr.without_parentheses() {
        Expression::StaticMemberExpression(member) if !member.optional && member.property.name == property => {
            Some(&member.object)
        }
        _ => None,
    }
}

fn is_import_meta(expr: &Expression, property: &str) -> bool {
    let Some(obj) = static_member_object(expr, property) else {
        return false;
    };
    matches!(obj.without_parentheses(), Expression::ImportMeta(_))
}

fn is_script_path(context: &Context, expr: &Expression) -> bool {
    let Expression::ComputedMemberExpression(member) = expr.without_parentheses() else {
        return false;
    };
    if member.optional {
        return false;
    }
    let is_one = matches!(member.expression.without_parentheses(), Expression::NumericLiteral(lit) if lit.value == 1.0);
    if !is_one {
        return false;
    }
    static_member_object(&member.object, "argv").is_some_and(|obj| is_global(context, obj, "process"))
}

fn is_helper_call(
    context: &Context,
    expr: &Expression,
    name: &str,
    modules: &[&str],
    arg_pred: impl Fn(&Expression) -> bool,
) -> bool {
    let Expression::CallExpression(call) = expr.without_parentheses() else {
        return false;
    };
    if call.optional || call.arguments.len() != 1 {
        return false;
    }
    is_imported_helper(context, &call.callee, name, modules)
        && call.arguments[0].as_expression().is_some_and(arg_pred)
}

fn is_file_path(context: &Context, expr: &Expression) -> bool {
    is_script_path(context, expr)
        || is_helper_call(context, expr, "realpathSync", &["fs", "node:fs"], |arg| is_script_path(context, arg))
}

fn is_script_url(context: &Context, expr: &Expression) -> bool {
    if is_script_path(context, expr) {
        return true;
    }
    if let Some(obj) = static_member_object(expr, "href")
        && is_helper_call(context, obj, "pathToFileURL", &["url", "node:url"], |arg| is_file_path(context, arg))
    {
        return true;
    }
    if let Expression::TemplateLiteral(tpl) = expr.without_parentheses()
        && tpl.quasis.len() == 2
        && tpl.quasis[0].value.cooked.as_ref().and_then(|s| s.as_str()) == Some("file://")
        && tpl.quasis[1].value.cooked.as_ref().and_then(|s| s.as_str()) == Some("")
        && tpl.expressions.first().is_some_and(|first| is_script_path(context, first))
    {
        return true;
    }
    false
}

fn is_comparison(
    expr: &Expression,
    operators: &[BinaryOperator],
    left_pred: impl Fn(&Expression) -> bool,
    right_pred: impl Fn(&Expression) -> bool,
) -> bool {
    let Expression::BinaryExpression(bin) = expr.without_parentheses() else {
        return false;
    };
    operators.contains(&bin.operator)
        && ((left_pred(&bin.left) && right_pred(&bin.right))
            || (left_pred(&bin.right) && right_pred(&bin.left)))
}

fn is_entry_comparison(context: &Context, expr: &Expression) -> bool {
    let eq = &[BinaryOperator::StrictEquality, BinaryOperator::Equality];
    is_import_meta(expr, "main")
        || is_comparison(expr, eq, |s| is_import_meta(s, "url"), |s| is_script_url(context, s))
        || is_comparison(
            expr,
            eq,
            |s| static_member_object(s, "main").is_some_and(|obj| is_global(context, obj, "require")),
            |s| is_global(context, s, "module"),
        )
}

fn is_script_path_check(context: &Context, expr: &Expression) -> bool {
    is_script_path(context, expr)
        || is_comparison(
            expr,
            &[BinaryOperator::StrictInequality],
            |s| is_script_path(context, s),
            |s| is_global(context, s, "undefined"),
        )
}

fn and_operands<'a>(root: &'a Expression<'a>) -> Vec<&'a Expression<'a>> {
    let mut stack = vec![root.without_parentheses()];
    let mut operands = Vec::new();
    while let Some(node) = stack.pop() {
        if let Expression::LogicalExpression(logical) = node
            && logical.operator == LogicalOperator::And
        {
            stack.push(logical.right.without_parentheses());
            stack.push(logical.left.without_parentheses());
        } else {
            operands.push(node);
        }
    }
    operands
}

fn is_main_guard(context: &Context, if_stmt: &IfStatement) -> bool {
    if if_stmt.alternate.is_some() {
        return false;
    }
    let operands = and_operands(&if_stmt.test);
    operands.iter().any(|op| is_entry_comparison(context, op))
        && operands.iter().all(|op| is_entry_comparison(context, op) || is_script_path_check(context, op))
}

fn guarded_by_main(context: &Context, kind: AstKind, node_span: Span) -> bool {
    let AstKind::IfStatement(if_stmt) = kind else {
        return false;
    };
    if !is_main_guard(context, if_stmt) {
        return false;
    }
    let span = if_stmt.consequent.span();
    span.start <= node_span.start && node_span.end <= span.end
}

fn executes_at_module_load(context: &Context, id: NodeId, node_span: Span) -> bool {
    let nodes = context.semantic.nodes();
    let mut current = nodes.parent_node(id);
    loop {
        match current.kind() {
            AstKind::ArrowFunctionExpression(_) | AstKind::Function(_) => return false,
            kind if guarded_by_main(context, kind, node_span) => return false,
            AstKind::Program(_) => return true,
            _ => {
                let next = nodes.parent_node(current.id());
                if next.id() == current.id() {
                    return false;
                }
                current = next;
            }
        }
    }
}

fn has_module_level_var_decl_ancestor(context: &Context, id: NodeId) -> bool {
    let nodes = context.semantic.nodes();
    let mut current = nodes.parent_node(id);
    loop {
        if matches!(current.kind(), AstKind::VariableDeclaration(_)) {
            let parent_node = nodes.parent_node(current.id());
            match parent_node.kind() {
                AstKind::Program(_) => return true,
                AstKind::ExportDeclaration(_) | AstKind::ExportNamedDeclaration(_) => {
                    if matches!(nodes.parent_node(parent_node.id()).kind(), AstKind::Program(_)) {
                        return true;
                    }
                }
                _ => {}
            }
        }
        if matches!(current.kind(), AstKind::Program(_)) {
            return false;
        }
        let next = nodes.parent_node(current.id());
        if next.id() == current.id() {
            return false;
        }
        current = next;
    }
}

// --- Member definitions (mirrors rules/modules/definitions/member-definitions.mts) ---

fn is_literal_expr(expr: &Expression) -> bool {
    matches!(
        expr.without_parentheses(),
        Expression::StringLiteral(_)
            | Expression::NumericLiteral(_)
            | Expression::BooleanLiteral(_)
            | Expression::NullLiteral(_)
            | Expression::BigIntLiteral(_)
            | Expression::RegExpLiteral(_)
    )
}

fn is_static_chain(expr: &Expression) -> bool {
    let mut current = expr.without_parentheses();
    while let Expression::StaticMemberExpression(member) = current {
        current = member.object.without_parentheses();
    }
    matches!(current, Expression::Identifier(_))
}

fn is_plain_computed_key(expr: &Expression) -> bool {
    let expr = expr.without_parentheses();
    is_literal_expr(expr) || matches!(expr, Expression::Identifier(_)) || is_static_chain(expr)
}

fn is_plain_property_key(prop: &ObjectProperty) -> bool {
    if !prop.computed {
        return true;
    }
    prop.key.as_expression().is_some_and(is_plain_computed_key)
}

fn member_root_expr<'a>(start: &'a Expression<'a>) -> Option<&'a Expression<'a>> {
    let mut current = start.without_parentheses();
    loop {
        match current {
            Expression::StaticMemberExpression(member) => current = member.object.without_parentheses(),
            Expression::ComputedMemberExpression(member) if is_plain_computed_key(&member.expression) => {
                current = member.object.without_parentheses();
            }
            Expression::Identifier(_) => return Some(current),
            _ => return None,
        }
    }
}

fn member_root_target<'a>(target: &'a AssignmentTarget<'a>) -> Option<&'a Expression<'a>> {
    match target {
        AssignmentTarget::StaticMemberExpression(member) => member_root_expr(&member.object),
        AssignmentTarget::ComputedMemberExpression(member) if is_plain_computed_key(&member.expression) => {
            member_root_expr(&member.object)
        }
        _ => None,
    }
}

fn is_fresh_object(init: &Expression) -> bool {
    let mut value = init.without_parentheses();
    while let Expression::AssignmentExpression(assign) = value {
        value = assign.right.without_parentheses();
    }
    match value {
        Expression::ObjectExpression(_)
        | Expression::FunctionExpression(_)
        | Expression::ArrowFunctionExpression(_)
        | Expression::ClassExpression(_) => true,
        Expression::CallExpression(call) => {
            let Expression::StaticMemberExpression(callee) = call.callee.without_parentheses() else {
                return false;
            };
            callee.property.name == "create"
                && matches!(member_root_expr(&callee.object), Some(Expression::Identifier(id)) if id.name == "Object")
        }
        _ => false,
    }
}

fn is_local_definition(context: &Context, ident: &Expression) -> bool {
    let Some(symbol) = symbol_of(context, ident) else {
        return false;
    };
    let scoping = context.semantic.scoping();
    if scoping.symbol_scope_id(symbol) != scoping.root_scope_id() {
        return false;
    }
    let decl_id = scoping.symbol_declaration(symbol);
    match context.semantic.nodes().kind(decl_id) {
        AstKind::Function(_) | AstKind::Class(_) => true,
        AstKind::VariableDeclarator(decl) => decl.init.as_ref().is_some_and(|init| is_fresh_object(init)),
        _ => false,
    }
}

fn is_local_member_expr(context: &Context, expr: &Expression) -> bool {
    member_root_expr(expr).is_some_and(|root| is_local_definition(context, root))
}

fn is_local_member_target(context: &Context, target: &AssignmentTarget) -> bool {
    member_root_target(target).is_some_and(|root| is_local_definition(context, root))
}

fn is_definition_value(context: &Context, start: &Expression) -> bool {
    let mut stack = vec![start.without_parentheses()];
    while let Some(node) = stack.pop() {
        match node {
            Expression::ObjectExpression(obj) => {
                for prop_kind in &obj.properties {
                    let ObjectPropertyKind::ObjectProperty(prop) = prop_kind else {
                        return false;
                    };
                    if !is_plain_property_key(prop) {
                        return false;
                    }
                    stack.push(prop.value.without_parentheses());
                }
            }
            Expression::Identifier(_)
            | Expression::StaticMemberExpression(_)
            | Expression::ComputedMemberExpression(_) => {
                if !is_local_member_expr(context, node) {
                    return false;
                }
            }
            Expression::FunctionExpression(_)
            | Expression::ArrowFunctionExpression(_)
            | Expression::ClassExpression(_) => {}
            other if is_literal_expr(other) => {}
            _ => return false,
        }
    }
    true
}

fn is_descriptor_call(context: &Context, call: &CallExpression) -> bool {
    let Expression::StaticMemberExpression(callee) = call.callee.without_parentheses() else {
        return false;
    };
    let Expression::Identifier(obj) = callee.object.without_parentheses() else {
        return false;
    };
    if obj.name != "Object" || symbol_of(context, callee.object.without_parentheses()).is_some() {
        return false;
    }
    if !DESCRIPTOR_CALLS.contains(&callee.property.name.as_str()) {
        return false;
    }
    let Some(target) = call.arguments.first().and_then(Argument::as_expression) else {
        return false;
    };
    if !is_local_member_expr(context, target) {
        return false;
    }
    call.arguments[1..]
        .iter()
        .all(|arg| arg.as_expression().is_some_and(|expr| is_definition_value(context, expr)))
}

fn is_member_definition(context: &Context, expr: &Expression) -> bool {
    let expr = expr.without_parentheses();
    if let Expression::CallExpression(call) = expr {
        return is_descriptor_call(context, call);
    }
    let mut current = expr;
    let mut link_count = 0usize;
    while let Expression::AssignmentExpression(assign) = current {
        if assign.operator != AssignmentOperator::Assign {
            return false;
        }
        let is_member_target = matches!(
            assign.left,
            AssignmentTarget::StaticMemberExpression(_) | AssignmentTarget::ComputedMemberExpression(_)
        );
        if !is_member_target || !is_local_member_target(context, &assign.left) {
            return false;
        }
        link_count += 1;
        current = assign.right.without_parentheses();
    }
    link_count > 0 && is_definition_value(context, current)
}

fn is_common_js_export(expr: &Expression) -> bool {
    let Expression::AssignmentExpression(assign) = expr.without_parentheses() else {
        return false;
    };
    if assign.operator != AssignmentOperator::Assign {
        return false;
    }
    let path = member_path_target(&assign.left);
    (path.first().copied().flatten() == Some("module") && path.get(1).copied().flatten() == Some("exports"))
        || (path.first().copied().flatten() == Some("exports") && path.len() > 1)
}

fn import_time_effect_new(new_expr: &NewExpression) -> Option<String> {
    let name = callee_text(&new_expr.callee)?;
    let is_clock = name == "Date" && new_expr.arguments.is_empty();
    if is_clock || EFFECT_CONSTRUCTORS.contains(&name.as_str()) {
        Some(format!("new {name}()"))
    } else {
        None
    }
}

fn import_time_effect_call(call: &CallExpression, sync_bindings: &ModuleBindings) -> Option<String> {
    let text = callee_text(&call.callee)?;
    let name = text.rsplit('.').next();
    let root = text.split('.').next();
    let is_sync = imported_callee_name(&call.callee, sync_bindings).is_some_and(|n| n.ends_with("Sync"));
    let is_effect = name.is_some_and(|n| {
        EFFECT_CALLEES.contains(&n) && (text == n || root.is_some_and(|r| GLOBAL_OBJECTS.contains(&r)))
    }) || EFFECT_MEMBER_CALLS.contains(&text.as_str())
        || is_sync
        || text.starts_with("process.");
    if is_effect { Some(format!("{text}()")) } else { None }
}

fn top_level_control_kind(context: &Context, kind: AstKind) -> Option<&'static str> {
    match kind {
        AstKind::BlockStatement(_) => Some("BlockStatement"),
        AstKind::DoWhileStatement(_) => Some("DoWhileStatement"),
        AstKind::ForInStatement(_) => Some("ForInStatement"),
        AstKind::ForOfStatement(_) => Some("ForOfStatement"),
        AstKind::ForStatement(_) => Some("ForStatement"),
        AstKind::IfStatement(if_stmt) if !is_main_guard(context, if_stmt) => Some("IfStatement"),
        AstKind::SwitchStatement(_) => Some("SwitchStatement"),
        AstKind::TryStatement(_) => Some("TryStatement"),
        AstKind::WhileStatement(_) => Some("WhileStatement"),
        AstKind::WithStatement(_) => Some("WithStatement"),
        _ => None,
    }
}

fn is_side_effect_import(import: &ImportDeclaration) -> bool {
    import.specifiers.as_ref().is_none_or(|s| s.is_empty())
        && import.source.value.as_str().is_some_and(|src| !is_stylesheet_specifier(src))
}

pub fn check(context: &mut Context) {
    let common_js_exports = context
        .rule_options(RULE)
        .and_then(|opts| opts.get("commonJsExports"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let sync_bindings = collect_sync_bindings(context);
    let mut reports: Vec<(Span, String)> = Vec::new();

    for node in context.semantic.nodes().iter() {
        let id = node.id();
        let kind = node.kind();
        match kind {
            AstKind::ImportDeclaration(import) => {
                if is_side_effect_import(import) {
                    reports.push((
                        import.span,
                        format!("Side-effect-only import executes code during module loading.{ENTRY_HINT}"),
                    ));
                }
            }
            AstKind::AwaitExpression(awaited) => {
                if executes_at_module_load(context, id, awaited.span) {
                    reports.push((
                        awaited.span,
                        format!("Top-level await delays and executes work during module loading.{ENTRY_HINT}"),
                    ));
                }
            }
            AstKind::NewExpression(new_expr) => {
                if let Some(call) = import_time_effect_new(new_expr)
                    && executes_at_module_load(context, id, new_expr.span)
                    && has_module_level_var_decl_ancestor(context, id)
                {
                    reports.push((
                        new_expr.span,
                        format!("`{call}` runs when the module is imported. Move it into a function and call that from the composition root, passing the result in. An exception fits only when it must run at import."),
                    ));
                }
            }
            AstKind::CallExpression(call_expr) => {
                if let Some(call) = import_time_effect_call(call_expr, &sync_bindings)
                    && executes_at_module_load(context, id, call_expr.span)
                    && has_module_level_var_decl_ancestor(context, id)
                {
                    reports.push((
                        call_expr.span,
                        format!("`{call}` runs when the module is imported. Move it into a function and call that from the composition root, passing the result in. An exception fits only when it must run at import."),
                    ));
                }
            }
            AstKind::ExpressionStatement(stmt) => {
                if matches!(parent(context, id).kind(), AstKind::Program(_)) {
                    let expr = stmt.expression.without_parentheses();
                    if !matches!(expr, Expression::AwaitExpression(_))
                        && !(common_js_exports && is_common_js_export(expr))
                        && !is_member_definition(context, expr)
                    {
                        reports.push((
                            stmt.span,
                            format!("Top-level expression executes work during module loading.{ENTRY_HINT}"),
                        ));
                    }
                }
            }
            AstKind::StaticBlock(block) => {
                if executes_at_module_load(context, id, block.span) {
                    reports.push((
                        block.span,
                        "Static initialization block executes during module loading.".to_string(),
                    ));
                }
            }
            other => {
                if matches!(parent(context, id).kind(), AstKind::Program(_))
                    && let Some(control_kind) = top_level_control_kind(context, other)
                {
                    reports.push((
                        other.span(),
                        format!("Top-level {control_kind} executes control flow during module loading.{ENTRY_HINT}"),
                    ));
                }
            }
        }
    }

    for (span, message) in reports {
        context.report_range(RULE, span.start, Some(span.end), message);
    }
}
