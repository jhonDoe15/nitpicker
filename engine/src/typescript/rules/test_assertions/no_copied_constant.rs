use crate::typescript::resolve::Modules;
use crate::typescript::rules::Context;
use crate::typescript::rules::config::to_posix;
use crate::typescript::rules::support::estree::{parent, string_value, symbol_of};
use oxc_ast::AstKind;
use oxc_ast::ast::{
    Argument, BindingPattern, Class, ClassElement, Declaration, ExportDefaultDeclarationKind,
    ExportSpecifier, Expression, ImportDeclaration, ImportDeclarationSpecifier, ModuleExportName,
    PropertyKey, Statement, TSAccessibility, TSModuleReference, UnaryOperator, VariableDeclaration,
    VariableDeclarationKind,
};
use oxc_semantic::NodeId;
use oxc_span::{GetSpan, Span};
use std::collections::{BTreeSet, HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::UNIX_EPOCH;

const RULE: &str = "no-copied-constant";
const DEFAULT_EXPORT: &str = "default";
const MAX_REEXPORT_DEPTH: usize = 4;

const TEST_FUNCTIONS: &[&str] = &["it", "test", "describe", "suite", "context", "specify", "bench"];
const PATH_CALLS: &[&str] = &["mock", "doMock", "unmock", "importActual", "requireActual"];
const ACTUAL_LOADS: &[&str] = &["requireActual", "importActual"];

#[derive(Clone, Debug)]
enum ConstantValue {
    String(String),
    Number(f64),
}

impl ConstantValue {
    fn is_trivial(&self) -> bool {
        match self {
            ConstantValue::Number(v) => !v.is_finite() || matches!(*v, -1.0 | 0.0 | 1.0 | 2.0),
            ConstantValue::String(s) => s.encode_utf16().count() < 3 || s.trim().is_empty(),
        }
    }

    fn key(&self) -> String {
        match self {
            ConstantValue::Number(v) => format!("number:{}", js_number_string(*v)),
            ConstantValue::String(s) => format!("string:{s}"),
        }
    }

    fn shown(&self) -> String {
        match self {
            ConstantValue::Number(v) => js_number_string(*v),
            ConstantValue::String(s) => serde_json::to_string(s).unwrap_or_else(|_| format!("\"{s}\"")),
        }
    }
}

fn js_number_string(v: f64) -> String {
    let v = if v == 0.0 { 0.0 } else { v };
    if v.fract() == 0.0 && v.abs() < 1e21 {
        format!("{}", v as i128)
    } else {
        v.to_string()
    }
}

fn is_constant_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.len() < 2 || !bytes[0].is_ascii_uppercase() {
        return false;
    }
    let mut prev_underscore = false;
    for &b in &bytes[1..] {
        if b == b'_' {
            if prev_underscore {
                return false;
            }
            prev_underscore = true;
        } else if b.is_ascii_uppercase() || b.is_ascii_digit() {
            prev_underscore = false;
        } else {
            return false;
        }
    }
    !prev_underscore
}

fn is_constant_path(name: &str) -> bool {
    name.rsplit('.').next().is_some_and(is_constant_name)
}

fn exported_name<'a>(name: &ModuleExportName<'a>) -> Option<&'a str> {
    match name {
        ModuleExportName::IdentifierName(id) => Some(id.name.as_str()),
        ModuleExportName::IdentifierReference(id) => Some(id.name.as_str()),
        ModuleExportName::StringLiteral(lit) => lit.value.as_str(),
    }
}

fn unwrap_ts_wrappers<'a>(mut expr: &'a Expression<'a>) -> &'a Expression<'a> {
    loop {
        expr = expr.without_parentheses();
        match expr {
            Expression::TSAsExpression(w) => expr = &w.expression,
            Expression::TSSatisfiesExpression(w) => expr = &w.expression,
            Expression::TSTypeAssertion(w) => expr = &w.expression,
            _ => return expr,
        }
    }
}

fn literal_value_of(expr: &Expression) -> Option<ConstantValue> {
    let node = unwrap_ts_wrappers(expr);
    match node {
        Expression::StringLiteral(lit) => lit.value.as_str().map(|s| ConstantValue::String(s.to_string())),
        Expression::TemplateLiteral(tpl) if tpl.expressions.is_empty() => tpl
            .quasis
            .first()
            .and_then(|q| q.value.cooked.as_ref())
            .and_then(|s| s.as_str())
            .map(|s| ConstantValue::String(s.to_string())),
        Expression::NumericLiteral(lit) => Some(ConstantValue::Number(lit.value)),
        Expression::UnaryExpression(unary) if unary.operator == UnaryOperator::UnaryNegation => {
            match unwrap_ts_wrappers(&unary.argument) {
                Expression::NumericLiteral(lit) => Some(ConstantValue::Number(-lit.value)),
                _ => None,
            }
        }
        _ => None,
    }
}

#[derive(Clone)]
struct ExportedName {
    exported: String,
    local: String,
}

#[derive(Clone)]
struct Reexport {
    specifier: String,
    names: Option<Vec<ExportedName>>,
}

#[derive(Clone)]
struct ParsedModule {
    constants: Vec<(String, ConstantValue)>,
    reexports: Vec<Reexport>,
    defined: HashSet<String>,
}

#[derive(Clone, PartialEq, Eq)]
struct FileStamp {
    len: u64,
    modified_nanos: u128,
}

fn file_stamp(path: &Path) -> Option<FileStamp> {
    let meta = std::fs::metadata(path).ok()?;
    let modified_nanos = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos());
    Some(FileStamp { len: meta.len(), modified_nanos })
}

fn class_constants(cls: &Class, javascript: bool) -> Vec<(String, ConstantValue)> {
    let Some(id) = &cls.id else {
        return Vec::new();
    };
    let owner = id.name.as_str();
    let mut out = Vec::new();
    for element in &cls.body.body {
        let ClassElement::PropertyDefinition(prop) = element else {
            continue;
        };
        if !prop.r#static || prop.computed {
            continue;
        }
        if !(javascript || prop.readonly) {
            continue;
        }
        if matches!(prop.accessibility, Some(TSAccessibility::Private | TSAccessibility::Protected)) {
            continue;
        }
        let PropertyKey::StaticIdentifier(key) = &prop.key else {
            continue;
        };
        if !is_constant_name(key.name.as_str()) {
            continue;
        }
        if let Some(init) = &prop.value
            && let Some(value) = literal_value_of(init)
        {
            out.push((format!("{owner}.{}", key.name), value));
        }
    }
    out
}

fn var_constants(decl: &VariableDeclaration) -> Vec<(String, ConstantValue)> {
    if decl.kind != VariableDeclarationKind::Const {
        return Vec::new();
    }
    let mut out = Vec::new();
    for declarator in &decl.declarations {
        if let BindingPattern::BindingIdentifier(id) = &declarator.id
            && let Some(init) = &declarator.init
            && let Some(value) = literal_value_of(init)
        {
            out.push((id.name.to_string(), value));
        }
    }
    out
}

fn collect_binding_names(pattern: &BindingPattern, out: &mut Vec<String>) {
    let mut stack = vec![pattern];
    while let Some(pat) = stack.pop() {
        match pat {
            BindingPattern::BindingIdentifier(id) => out.push(id.name.to_string()),
            BindingPattern::AssignmentPattern(assign) => stack.push(&assign.left),
            BindingPattern::ObjectPattern(obj) => {
                for prop in &obj.properties {
                    stack.push(&prop.value);
                }
                if let Some(rest) = &obj.rest {
                    stack.push(&rest.argument);
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for elem in arr.elements.iter().flatten() {
                    stack.push(elem);
                }
                if let Some(rest) = &arr.rest {
                    stack.push(&rest.argument);
                }
            }
        }
    }
}

fn declaration_names(decl: &Declaration) -> Vec<String> {
    match decl {
        Declaration::VariableDeclaration(var) => {
            let mut names = Vec::new();
            for declarator in &var.declarations {
                collect_binding_names(&declarator.id, &mut names);
            }
            names
        }
        Declaration::FunctionDeclaration(func) => func.id.iter().map(|id| id.name.to_string()).collect(),
        Declaration::ClassDeclaration(cls) => cls.id.iter().map(|id| id.name.to_string()).collect(),
        Declaration::TSEnumDeclaration(en) => vec![en.id.name.to_string()],
        _ => Vec::new(),
    }
}

fn extract_export_specifiers(specifiers: &[ExportSpecifier]) -> Vec<ExportedName> {
    specifiers
        .iter()
        .filter(|s| !s.export_kind.is_type())
        .filter_map(|s| {
            let exported = exported_name(&s.exported)?.to_string();
            let local = exported_name(&s.local)?.to_string();
            Some(ExportedName { exported, local })
        })
        .collect()
}

fn read_module(file: &Path) -> ParsedModule {
    let Ok(text) = std::fs::read_to_string(file) else {
        return ParsedModule { constants: Vec::new(), reexports: Vec::new(), defined: HashSet::new() };
    };
    let path_str = file.to_string_lossy();
    let javascript = [".js", ".jsx", ".mjs", ".cjs"].iter().any(|ext| path_str.ends_with(ext));

    crate::typescript::with_parsed(&path_str, &text, |parsed| {
        if parsed.panicked {
            return ParsedModule { constants: Vec::new(), reexports: Vec::new(), defined: HashSet::new() };
        }
        let mut locals: HashMap<String, ConstantValue> = HashMap::new();
        let mut exported_constants_map: Vec<(String, ConstantValue)> = Vec::new();
        let mut seen_exported: HashSet<String> = HashSet::new();
        let mut local_export_lists: Vec<ExportedName> = Vec::new();
        let mut reexports: Vec<Reexport> = Vec::new();
        let mut defined: HashSet<String> = HashSet::new();

        for statement in &parsed.program.body {
            match statement {
                Statement::VariableDeclaration(decl) => {
                    for (name, value) in var_constants(decl) {
                        locals.insert(name, value);
                    }
                }
                Statement::ClassDeclaration(cls) => {
                    for (name, value) in class_constants(cls, javascript) {
                        locals.insert(name, value);
                    }
                }
                Statement::ExportDeclaration(export) => {
                    for name in declaration_names(&export.declaration) {
                        defined.insert(name);
                    }
                    let entries = match &export.declaration {
                        Declaration::VariableDeclaration(var) => var_constants(var),
                        Declaration::ClassDeclaration(cls) => class_constants(cls, javascript),
                        _ => Vec::new(),
                    };
                    for (name, value) in entries {
                        locals.insert(name.clone(), value.clone());
                        if is_constant_path(&name) && seen_exported.insert(name.clone()) {
                            exported_constants_map.push((name, value));
                        }
                    }
                }
                Statement::ExportFromDeclaration(export) if !export.export_kind.is_type() => {
                    if let Some(specifier) = export.source.value.as_str() {
                        reexports.push(Reexport {
                            specifier: specifier.to_string(),
                            names: Some(extract_export_specifiers(&export.specifiers)),
                        });
                    }
                }
                Statement::ExportNamedDeclaration(export) if !export.export_kind.is_type() => {
                    let listed = extract_export_specifiers(&export.specifiers);
                    for item in &listed {
                        defined.insert(item.exported.clone());
                    }
                    local_export_lists.extend(listed);
                }
                Statement::ExportDefaultDeclaration(export) => {
                    defined.insert(DEFAULT_EXPORT.to_string());
                    if let ExportDefaultDeclarationKind::ClassDeclaration(cls) = &export.declaration {
                        for (name, value) in class_constants(cls, javascript) {
                            locals.insert(name.clone(), value.clone());
                            if is_constant_path(&name) && seen_exported.insert(name.clone()) {
                                exported_constants_map.push((name, value));
                            }
                        }
                    }
                }
                Statement::ExportAllDeclaration(export) if !export.export_kind.is_type() => {
                    if export.exported.is_none()
                        && let Some(specifier) = export.source.value.as_str()
                    {
                        reexports.push(Reexport { specifier: specifier.to_string(), names: None });
                    }
                }
                Statement::TSExportAssignment(_) => {
                    defined.insert(DEFAULT_EXPORT.to_string());
                }
                _ => {}
            }
        }

        for (name, value) in &locals {
            for ExportedName { exported, local } in &local_export_lists {
                let shown = if exported == DEFAULT_EXPORT && name.contains('.') {
                    local.as_str()
                } else {
                    exported.as_str()
                };
                let (head, rest) = match name.split_once('.') {
                    Some((h, r)) => (h, Some(r)),
                    None => (name.as_str(), None),
                };
                if head == local {
                    let renamed = match rest {
                        Some(r) => format!("{shown}.{r}"),
                        None => shown.to_string(),
                    };
                    if is_constant_path(&renamed) && seen_exported.insert(renamed.clone()) {
                        exported_constants_map.push((renamed, value.clone()));
                    }
                }
            }
        }

        ParsedModule { constants: exported_constants_map, reexports, defined }
    })
}

fn parsed_module(file: &Path) -> Arc<ParsedModule> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, (FileStamp, Arc<ParsedModule>)>>> = OnceLock::new();
    let Some(stamp) = file_stamp(file) else {
        return Arc::new(ParsedModule {
            constants: Vec::new(),
            reexports: Vec::new(),
            defined: HashSet::new(),
        });
    };
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some((cached_stamp, module)) = cache.lock().expect("lock").get(file)
        && *cached_stamp == stamp
    {
        return module.clone();
    }
    let module = Arc::new(read_module(file));
    cache.lock().expect("lock").insert(file.to_path_buf(), (stamp, module.clone()));
    module
}

fn is_declaration_file(file: &Path) -> bool {
    let s = file.to_string_lossy();
    s.ends_with(".d.ts") || s.ends_with(".d.mts") || s.ends_with(".d.cts")
}

fn relative_posix(root: &str, file: &str) -> Option<String> {
    let root_norm = to_posix(root);
    let root_trimmed = root_norm.trim_end_matches('/');
    let file_norm = to_posix(file);
    file_norm.strip_prefix(&format!("{root_trimmed}/")).map(String::from)
}

fn is_production_module(context: &Context, file: &Path) -> bool {
    if is_declaration_file(file) {
        return false;
    }
    let file_str = to_posix(&file.to_string_lossy());
    let root = context.config.project_root.clone().or_else(|| {
        std::env::current_dir().ok().map(|p| to_posix(&p.to_string_lossy()))
    });
    let Some(rel) = root.as_deref().and_then(|r| relative_posix(r, &file_str)) else {
        return true;
    };
    if rel.starts_with("..") || Path::new(&rel).is_absolute() {
        return true;
    }
    let layout = context.layout();
    !(layout.is_test_path(&rel)
        || layout.is_test_file(&rel)
        || layout.is_fixture_path(&rel)
        || layout.is_generated_path(&rel))
}

fn defining_modules(
    context: &Context,
    start_file: &Path,
    names: impl Iterator<Item = String>,
) -> HashSet<PathBuf> {
    let mut found = HashSet::new();
    for name in names {
        let mut queue: VecDeque<(PathBuf, String, usize)> =
            VecDeque::from([(start_file.to_path_buf(), name, 0)]);
        let mut visited: HashSet<(PathBuf, String)> = HashSet::new();
        while let Some((file, current_name, depth)) = queue.pop_front() {
            if depth > MAX_REEXPORT_DEPTH || !is_production_module(context, &file) {
                continue;
            }
            if !visited.insert((file.clone(), current_name.clone())) {
                continue;
            }
            let module = parsed_module(&file);
            if module.defined.contains(&current_name) {
                found.insert(file);
                continue;
            }
            for reexport in &module.reexports {
                let local = match &reexport.names {
                    None => {
                        if current_name == DEFAULT_EXPORT {
                            None
                        } else {
                            Some(current_name.clone())
                        }
                    }
                    Some(list) => list
                        .iter()
                        .find(|entry| entry.exported == current_name)
                        .map(|entry| entry.local.clone()),
                };
                if let Some(local_name) = local
                    && let Some(target) = Modules::shared().followed(&reexport.specifier, &file)
                {
                    queue.push_back((target, local_name, depth + 1));
                }
            }
        }
    }
    found
}

fn apply_rename_chain(name: &str, chain: &[Option<Vec<ExportedName>>]) -> Option<String> {
    let (head, rest) = match name.split_once('.') {
        Some((h, r)) => (h, Some(r)),
        None => (name, None),
    };
    let mut current = head.to_string();
    for map in chain.iter().rev() {
        if let Some(list) = map {
            let entry = list.iter().find(|e| e.local == current)?;
            current = entry.exported.clone();
        }
    }
    Some(match rest {
        Some(r) => format!("{current}.{r}"),
        None => current,
    })
}

fn exported_constants(
    context: &Context,
    start_file: &Path,
    only: Option<&HashSet<PathBuf>>,
) -> Vec<(String, ConstantValue)> {
    let mut found: Vec<(String, ConstantValue)> = Vec::new();
    let mut seen_names: HashSet<String> = HashSet::new();
    let mut visited: HashSet<PathBuf> = HashSet::new();
    let mut queue: VecDeque<(PathBuf, usize, Vec<Option<Vec<ExportedName>>>)> =
        VecDeque::from([(start_file.to_path_buf(), 0, Vec::new())]);

    while let Some((file, depth, renames)) = queue.pop_front() {
        if visited.contains(&file) || !is_production_module(context, &file) {
            continue;
        }
        visited.insert(file.clone());
        let module = parsed_module(&file);
        let wanted = only.is_none() || depth == 0 || only.is_some_and(|set| set.contains(&file));
        if wanted {
            for (name, value) in &module.constants {
                if let Some(renamed) = apply_rename_chain(name, &renames)
                    && is_constant_path(&renamed)
                    && seen_names.insert(renamed.clone())
                {
                    found.push((renamed, value.clone()));
                }
            }
        }
        if depth < MAX_REEXPORT_DEPTH {
            for reexport in &module.reexports {
                if let Some(target) = Modules::shared().followed(&reexport.specifier, &file) {
                    let mut next_renames = renames.clone();
                    next_renames.push(reexport.names.clone());
                    queue.push_back((target, depth + 1, next_renames));
                }
            }
        }
    }
    found
}

// --- Test-file analysis (mirrors no-copied-constant.mts & module-loads.mts) ---

struct ModuleLoad {
    specifier: String,
    names: HashMap<String, Vec<String>>,
    whole: bool,
}

struct FoundLiteral {
    id: NodeId,
    span: Span,
    value: ConstantValue,
}

struct SeenConstant {
    name: String,
    owner: String,
    mentions: Vec<String>,
}

fn chain_root_name<'a>(start: &'a Expression<'a>) -> Option<&'a str> {
    let mut current = start.without_parentheses();
    loop {
        match current {
            Expression::StaticMemberExpression(m) => current = m.object.without_parentheses(),
            Expression::ComputedMemberExpression(m) => current = m.object.without_parentheses(),
            Expression::PrivateFieldExpression(m) => current = m.object.without_parentheses(),
            Expression::CallExpression(c) => current = c.callee.without_parentheses(),
            Expression::Identifier(id) => return Some(id.name.as_str()),
            _ => return None,
        }
    }
}

fn is_test_name(context: &Context, id: NodeId, span: Span) -> bool {
    let AstKind::CallExpression(call) = parent(context, id).kind() else {
        return false;
    };
    if !call.arguments.first().is_some_and(|arg| arg.span() == span) {
        return false;
    }
    chain_root_name(&call.callee).is_some_and(|root| TEST_FUNCTIONS.contains(&root))
}

fn is_path_argument(context: &Context, id: NodeId, span: Span) -> bool {
    let above = parent(context, id).kind();
    let AstKind::CallExpression(call) = above else {
        return matches!(above, AstKind::ImportExpression(_));
    };
    if !call.arguments.first().is_some_and(|arg| arg.span() == span) {
        return false;
    }
    match call.callee.without_parentheses() {
        Expression::Identifier(ident) => ident.name == "require",
        Expression::StaticMemberExpression(member) => PATH_CALLS.contains(&member.property.name.as_str()),
        _ => false,
    }
}

fn is_skipped_position(context: &Context, id: NodeId, span: Span) -> bool {
    let above = parent(context, id).kind();
    match above {
        AstKind::ImportDeclaration(_)
        | AstKind::ExportNamedDeclaration(_)
        | AstKind::ExportFromDeclaration(_)
        | AstKind::ExportAllDeclaration(_)
        | AstKind::ImportExpression(_)
        | AstKind::ImportAttribute(_)
        | AstKind::TSLiteralType(_)
        | AstKind::TSEnumMember(_)
        | AstKind::TSExternalModuleReference(_)
        | AstKind::Directive(_) => true,
        AstKind::ObjectProperty(prop) if !prop.computed && prop.key.span() == span => true,
        AstKind::PropertyDefinition(prop) if !prop.computed && prop.key.span() == span => true,
        AstKind::MethodDefinition(method) if !method.computed && method.key.span() == span => true,
        _ => is_test_name(context, id, span) || is_path_argument(context, id, span),
    }
}

fn is_load_call(callee: &Expression) -> bool {
    match callee.without_parentheses() {
        Expression::Identifier(id) => id.name == "require",
        Expression::StaticMemberExpression(member) => {
            ACTUAL_LOADS.contains(&member.property.name.as_str())
        }
        _ => false,
    }
}

fn is_own_require(context: &Context, callee: &Expression) -> bool {
    matches!(callee.without_parentheses(), Expression::Identifier(_))
        && symbol_of(context, callee.without_parentheses()).is_some()
}

fn property_key_text(key: &PropertyKey) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(id) => Some(id.name.to_string()),
        PropertyKey::StringLiteral(lit) => lit.value.as_str().map(String::from),
        PropertyKey::NumericLiteral(lit) => Some(js_number_string(lit.value)),
        _ => None,
    }
}

fn bound_names(context: &Context, load_id: NodeId) -> HashMap<String, Vec<String>> {
    let mut names: HashMap<String, Vec<String>> = HashMap::new();
    let first_parent = parent(context, load_id);
    let holder_id = if matches!(first_parent.kind(), AstKind::AwaitExpression(_)) {
        first_parent.id()
    } else {
        load_id
    };
    let holder_span = context.semantic.nodes().kind(holder_id).span();
    let AstKind::VariableDeclarator(decl) = parent(context, holder_id).kind() else {
        return names;
    };
    if !decl.init.as_ref().is_some_and(|init| init.without_parentheses().span() == holder_span) {
        return names;
    }
    let BindingPattern::ObjectPattern(pattern) = &decl.id else {
        return names;
    };
    for prop in &pattern.properties {
        if prop.computed {
            continue;
        }
        let bound = match &prop.value {
            BindingPattern::AssignmentPattern(assign) => &assign.left,
            other => other,
        };
        if let BindingPattern::BindingIdentifier(ident) = bound
            && let Some(key) = property_key_text(&prop.key)
        {
            names.entry(key).or_default().push(ident.name.to_string());
        }
    }
    names
}

fn imported_module(import: &ImportDeclaration) -> Option<ModuleLoad> {
    let specifier = import.source.value.as_str()?.to_string();
    let mut names: HashMap<String, Vec<String>> = HashMap::new();
    let mut whole = import.specifiers.as_ref().is_none_or(|s| s.is_empty());
    for spec in import.specifiers.iter().flatten() {
        match spec {
            ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => {
                whole = true;
            }
            ImportDeclarationSpecifier::ImportDefaultSpecifier(default_spec) => {
                names.insert(DEFAULT_EXPORT.to_string(), vec![default_spec.local.name.to_string()]);
            }
            ImportDeclarationSpecifier::ImportSpecifier(named) if !named.import_kind.is_type() => {
                if let Some(imported) = exported_name(&named.imported) {
                    names.entry(imported.to_string()).or_default().push(named.local.name.to_string());
                }
            }
            _ => {}
        }
    }
    Some(ModuleLoad { specifier, names, whole })
}

fn is_statement_kind(kind: AstKind) -> bool {
    matches!(
        kind,
        AstKind::BlockStatement(_)
            | AstKind::BreakStatement(_)
            | AstKind::ContinueStatement(_)
            | AstKind::DebuggerStatement(_)
            | AstKind::DoWhileStatement(_)
            | AstKind::EmptyStatement(_)
            | AstKind::ExpressionStatement(_)
            | AstKind::ForInStatement(_)
            | AstKind::ForOfStatement(_)
            | AstKind::ForStatement(_)
            | AstKind::IfStatement(_)
            | AstKind::LabeledStatement(_)
            | AstKind::ReturnStatement(_)
            | AstKind::SwitchStatement(_)
            | AstKind::ThrowStatement(_)
            | AstKind::TryStatement(_)
            | AstKind::WhileStatement(_)
            | AstKind::WithStatement(_)
            | AstKind::VariableDeclaration(_)
            | AstKind::ImportDeclaration(_)
            | AstKind::ExportDeclaration(_)
            | AstKind::ExportNamedDeclaration(_)
            | AstKind::ExportDefaultDeclaration(_)
            | AstKind::ExportAllDeclaration(_)
            | AstKind::ExportFromDeclaration(_)
            | AstKind::TSEnumDeclaration(_)
            | AstKind::TSInterfaceDeclaration(_)
            | AstKind::TSTypeAliasDeclaration(_)
            | AstKind::TSImportEqualsDeclaration(_)
            | AstKind::TSExportAssignment(_)
    ) || matches!(kind, AstKind::Function(f) if f.is_function_declaration())
        || matches!(kind, AstKind::Class(c) if c.is_declaration())
}

fn statement_span_of(context: &Context, id: NodeId) -> Span {
    let nodes = context.semantic.nodes();
    let mut current = nodes.get_node(id);
    loop {
        if is_statement_kind(current.kind()) {
            return current.kind().span();
        }
        let next = nodes.parent_node(current.id());
        if next.id() == current.id() || matches!(next.kind(), AstKind::Program(_)) {
            return current.kind().span();
        }
        current = next;
    }
}

fn names_constant(context: &Context, id: NodeId, entries: &[SeenConstant]) -> bool {
    let mentioned: HashSet<&str> = entries
        .iter()
        .flat_map(|entry| entry.mentions.iter().map(String::as_str))
        .collect();
    let stmt_span = statement_span_of(context, id);
    for node in context.semantic.nodes().iter() {
        let span = node.kind().span();
        if span.start < stmt_span.start || span.end > stmt_span.end {
            continue;
        }
        let hit = match node.kind() {
            AstKind::IdentifierReference(ident) => mentioned.contains(ident.name.as_str()),
            AstKind::IdentifierName(ident) => mentioned.contains(ident.name.as_str()),
            AstKind::BindingIdentifier(ident) => mentioned.contains(ident.name.as_str()),
            AstKind::StaticMemberExpression(member) => mentioned.contains(member.property.name.as_str()),
            _ => false,
        };
        if hit {
            return true;
        }
    }
    false
}

fn format_message(names: &[String], owners: &[String], value: &ConstantValue) -> String {
    let name = &names[0];
    let also = if names.len() <= 1 {
        String::new()
    } else {
        format!(" (and {}, which hold the same value)", names[1..].join(", "))
    };
    let owner = owners.join(" and ");
    let shown = value.shown();
    let guidance = match value {
        ConstantValue::Number(_) => format!("Use {name} (or an expression on it, such as {name} + 1)."),
        ConstantValue::String(_) => format!("Use {name} (or build the text from it)."),
    };
    format!(
        "This literal copies {name}{also} from {owner}: when {name} changes, the test keeps checking the old value or stops testing the case it was written for. {guidance} If the value is a contract the test pins on purpose, assert it next to the constant: expect({name}).toBe({shown})."
    )
}

pub fn check(context: &mut Context) {
    let mut literals: Vec<FoundLiteral> = Vec::new();
    let mut loads: Vec<ModuleLoad> = Vec::new();

    for statement in &context.file.program.body {
        if let Statement::ImportDeclaration(import) = statement
            && !import.import_kind.is_type()
            && let Some(loaded) = imported_module(import)
        {
            loads.push(loaded);
        }
    }

    for node in context.semantic.nodes().iter() {
        let id = node.id();
        match node.kind() {
            AstKind::StringLiteral(lit) => {
                if let Some(text) = lit.value.as_str() {
                    let value = ConstantValue::String(text.to_string());
                    if !value.is_trivial() && !is_skipped_position(context, id, lit.span) {
                        literals.push(FoundLiteral { id, span: lit.span, value });
                    }
                }
            }
            AstKind::TemplateLiteral(tpl) if tpl.expressions.is_empty() => {
                let text = tpl
                    .quasis
                    .first()
                    .and_then(|q| q.value.cooked.as_ref())
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                let value = ConstantValue::String(text.to_string());
                if !value.is_trivial() && !is_skipped_position(context, id, tpl.span) {
                    literals.push(FoundLiteral { id, span: tpl.span, value });
                }
            }
            AstKind::NumericLiteral(lit) => {
                let above = parent(context, id);
                let (target_id, target_span, value) = match above.kind() {
                    AstKind::UnaryExpression(unary) if unary.operator == UnaryOperator::UnaryNegation => {
                        (above.id(), unary.span, ConstantValue::Number(-lit.value))
                    }
                    _ => (id, lit.span, ConstantValue::Number(lit.value)),
                };
                if !value.is_trivial() && !is_skipped_position(context, target_id, target_span) {
                    literals.push(FoundLiteral { id: target_id, span: target_span, value });
                }
            }
            AstKind::ImportExpression(import) => {
                if let Some(specifier) = string_value(import.source.without_parentheses()) {
                    let names = bound_names(context, id);
                    let whole = names.is_empty();
                    loads.push(ModuleLoad { specifier, names, whole });
                }
            }
            AstKind::TSImportEqualsDeclaration(decl) if !decl.import_kind.is_type() => {
                if let TSModuleReference::ExternalModuleReference(ext) = &decl.module_reference
                    && let Some(specifier) = ext.expression.value.as_str()
                {
                    loads.push(ModuleLoad {
                        specifier: specifier.to_string(),
                        names: HashMap::new(),
                        whole: true,
                    });
                }
            }
            AstKind::CallExpression(call) => {
                if !is_own_require(context, &call.callee)
                    && is_load_call(&call.callee)
                    && let Some(specifier) = call
                        .arguments
                        .first()
                        .and_then(Argument::as_expression)
                        .and_then(|arg| string_value(arg.without_parentheses()))
                {
                    let names = bound_names(context, id);
                    let whole = names.is_empty();
                    loads.push(ModuleLoad { specifier, names, whole });
                }
            }
            _ => {}
        }
    }

    if literals.is_empty() {
        return;
    }

    let mut seen: HashMap<String, Vec<SeenConstant>> = HashMap::new();
    let containing = Path::new(context.file.path);

    for load in &loads {
        let Some(target) = Modules::shared().followed(&load.specifier, containing) else {
            continue;
        };
        let only = if load.whole {
            None
        } else {
            Some(defining_modules(context, &target, load.names.keys().cloned()))
        };
        let constants = exported_constants(context, &target, only.as_ref());
        for (name, value) in constants {
            let member = name.rsplit('.').next().unwrap_or(&name);
            let mut mentions = vec![member.to_string()];
            if member == name
                && let Some(locals) = load.names.get(&name)
            {
                mentions.extend(locals.iter().cloned());
            }
            seen.entry(value.key()).or_default().push(SeenConstant {
                name,
                owner: load.specifier.clone(),
                mentions,
            });
        }
    }

    let mut reports: Vec<(Span, String)> = Vec::new();
    for literal in &literals {
        let Some(entries) = seen.get(&literal.value.key()) else {
            continue;
        };
        if names_constant(context, literal.id, entries) {
            continue;
        }
        let names: Vec<String> = entries
            .iter()
            .map(|e| e.name.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let owners: Vec<String> = entries
            .iter()
            .map(|e| e.owner.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        reports.push((literal.span, format_message(&names, &owners, &literal.value)));
    }

    for (span, message) in reports {
        context.report_range(RULE, span.start, Some(span.end), message);
    }
}
