//! TreeToString: `Tree#toString` used inside a `BugChecker`.
use super::fixes::Fix;
use super::hierarchy::{closure, formals};
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, preferred};
use super::shape::is_class;
use super::Context;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "Tree#toString shouldn't be used.";
const TREE: &str = "com.sun.source.tree.Tree";
const VISITOR_STATE: &str = "com.google.errorprone.VisitorState";

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Implicit,
    Explicit,
    None,
}

fn is_tree(context: &Context, kind: &Type) -> bool {
    matches!(kind.erased(), Type::Class(name, _) if context.resolver.index.is_subtype(&name, TREE))
}

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

/// What decides whether a field in scope can be named from the place of the match.
struct FieldFacts {
    owner: String,
    is_static: bool,
    is_private: bool,
    reachable: bool,
    same_package: bool,
}

fn is_static_class(node: Node) -> bool {
    has_modifier(node, "static")
        || (is_class(node) && (node.kind() != "class_declaration" || in_interface_body(node)) && parent(node).is_some_and(|up| up.kind() != "program"))
}

fn in_interface_body(node: Node) -> bool {
    parent(node).is_some_and(|up| matches!(up.kind(), "interface_body" | "annotation_type_body"))
}

/// JLS 8.3.1: the code at the node is in a static context.
fn in_static_context(node: Node) -> bool {
    let mut prev = node;
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" => return has_modifier(at, "static"),
            "static_initializer" => return true,
            "field_declaration" => {
                return has_modifier(at, "static") && declarators(at).into_iter().any(|declarator| declarator.child_by_field_name("value").is_some_and(|value| value.id() == prev.id()));
            }
            "explicit_constructor_invocation" => return true,
            _ => {}
        }
        prev = at;
        current = parent(at);
    }
    false
}

fn static_symbol(context: &Context, node: Node) -> bool {
    match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node).is_some_and(|resolved| resolved.method.is_static),
        "method_declaration" | "field_declaration" => has_modifier(node, "static"),
        kind if is_class(node) || kind == "object_creation_expression" => is_class(node) && is_static_class(node),
        _ => false,
    }
}

fn field_visible(context: &Context, node: Node, field: &FieldFacts) -> bool {
    if !field.is_static {
        if in_static_context(node) {
            return false;
        }
        let mut current = parent(node);
        while let Some(at) = current {
            if is_class(at) && context.resolver.scope.names.get(&at.id()).is_some_and(|name| *name == field.owner) {
                break;
            }
            if static_symbol(context, at) {
                if ancestors_have_owner(context, at, &field.owner) {
                    return false;
                }
                break;
            }
            current = parent(at);
        }
    }
    field.reachable || (field.same_package && !field.is_private) || !field.is_private
}

fn ancestors_have_owner(context: &Context, from: Node, owner: &str) -> bool {
    std::iter::successors(parent(from), |at| parent(*at)).any(|at| is_class(at) && context.resolver.scope.names.get(&at.id()).is_some_and(|name| name == owner))
}

fn is_final_local(context: &Context, declaration: Node, name: &str, scope: Node) -> bool {
    if has_modifier(declaration, "final") {
        return true;
    }
    let initialized = declaration.kind() == "formal_parameter" || declaration.child_by_field_name("value").is_some();
    let mut assigned = 0;
    walk(scope, |node| {
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => node.named_child(0),
            _ => None,
        };
        if target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name) {
            assigned += 1;
        }
    });
    assigned == 0 || (!initialized && assigned == 1)
}

fn captured(node: Node, scope: Node) -> bool {
    std::iter::successors(parent(node), |at| parent(*at)).take_while(|at| at.id() != scope.id()).any(|at| {
        at.kind() == "lambda_expression" || (at.kind() == "object_creation_expression" && children(at).iter().any(|part| part.kind() == "class_body")) || (is_class(at) && parent(at).is_some_and(|up| up.kind() == "block"))
    })
}

type Found<'t> = Vec<(String, Option<(Node<'t>, Node<'t>)>, Option<FieldFacts>)>;

fn local<'t>(context: &Context, wanted: &dyn Fn(Option<Type>) -> bool, found: &mut Found<'t>, declaration: Node<'t>, declarator: Option<Node<'t>>, scope: Node<'t>) {
    if wanted(context.resolver.declared_type(declaration, declarator)) {
        if let Some(name) = declarator.unwrap_or(declaration).child_by_field_name("name") {
            found.push((context.text(name).to_string(), Some((declaration, scope)), None));
        }
    }
}

/// The first variable in scope of a `VisitorState` type, in the order of `FindIdentifiers.findAllIdents`.
fn visitor_state(context: &Context, node: Node) -> Option<String> {
    let wanted = |kind: Option<Type>| kind.is_some_and(|kind| matches!(kind.erased(), Type::Class(name, _) if context.resolver.index.is_subtype(&name, VISITOR_STATE)));
    let mut found: Found<'_> = Vec::new();
    let mut prev = node;
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "block" | "constructor_body" => {
                for statement in children(at).into_iter().take_while(|statement| statement.id() != prev.id()).filter(|statement| statement.kind() == "local_variable_declaration") {
                    for declarator in declarators(statement) {
                        local(context, &wanted, &mut found, statement, Some(declarator), at);
                    }
                }
            }
            "method_declaration" | "constructor_declaration" => for parameter in formals(at) {
                    local(context, &wanted, &mut found, parameter, None, at);
                },
            "lambda_expression" => {
                let parameters = at.child_by_field_name("parameters").map(named_children).unwrap_or_default();
                for parameter in parameters.into_iter().filter(|parameter| parameter.kind() == "formal_parameter") {
                    local(context, &wanted, &mut found, parameter, None, at);
                }
            }
            "catch_clause" => {
                if let Some(parameter) = children(at).into_iter().find(|part| part.kind() == "catch_formal_parameter") {
                    local(context, &wanted, &mut found, parameter, None, at);
                }
            }
            "enhanced_for_statement" => local(context, &wanted, &mut found, at, None, at),
            "for_statement" => {
                for statement in children(at).into_iter().filter(|part| part.kind() == "local_variable_declaration") {
                    for declarator in declarators(statement) {
                        local(context, &wanted, &mut found, statement, Some(declarator), at);
                    }
                }
            }
            kind if is_class(at) || (kind == "object_creation_expression" && children(at).iter().any(|part| part.kind() == "class_body")) => {
                fields_of(context, at, prev, &wanted, &mut found);
            }
            _ => {}
        }
        prev = at;
        current = parent(at);
    }
    for (name, local, field) in found {
        let visible = match (&local, &field) {
            (Some((declaration, scope)), _) => !captured(node, *scope) || is_final_local(context, *declaration, &name, *scope),
            (None, Some(field)) => field_visible(context, node, field),
            _ => true,
        };
        if visible {
            return Some(name);
        }
    }
    None
}

fn fields_of<'t>(context: &Context, class: Node<'t>, prev: Node<'t>, wanted: &dyn Fn(Option<Type>) -> bool, found: &mut Found<'t>) {
    let Some(owner) = context.resolver.scope.names.get(&class.id()) else { return };
    let Some(body) = children(class).into_iter().find(|part| part.kind().ends_with("_body")) else { return };
    let package = &context.resolver.scope.package;
    for member in children(body).into_iter().take_while(|member| member.id() != prev.id()).filter(|member| matches!(member.kind(), "field_declaration" | "constant_declaration")) {
        for declarator in declarators(member) {
            if let (true, Some(name)) = (wanted(context.resolver.declared_type(member, Some(declarator))), declarator.child_by_field_name("name")) {
                let is_static = has_modifier(member, "static") || member.kind() == "constant_declaration" || in_interface_body(member);
                found.push((context.text(name).to_string(), None, Some(FieldFacts { owner: owner.clone(), is_static, is_private: has_modifier(member, "private"), reachable: true, same_package: true })));
            }
        }
    }
    let index = context.resolver.index;
    for parent_class in closure(index, owner) {
        let Some(info) = index.get(&parent_class) else { continue };
        for field in info.fields.iter().filter(|field| wanted(Some(field.generic.clone()))) {
            let flags = field.flags;
            let facts = FieldFacts {
                owner: parent_class.clone(),
                is_static: flags & crate::java::types::model::flag::STATIC != 0,
                is_private: field.is_private,
                reachable: false,
                same_package: info.package == *package,
            };
            let public_or_protected = flags & (crate::java::types::model::flag::PUBLIC | crate::java::types::model::flag::PROTECTED) != 0;
            if facts.same_package || public_or_protected {
                found.push((field.name.clone(), None, Some(facts)));
            }
        }
    }
}

fn replacement(context: &Context, state: &str, expression: Node) -> String {
    if expression.kind() == "method_invocation" && name_of(context, expression) == "Literal" {
        let treemaker = receiver_name(context, expression, false).is_some_and(|owner| is_descendant(context, &owner, &["com.sun.tools.javac.tree.TreeMaker"]));
        if let (true, [only]) = (treemaker, arguments(expression).as_slice()) {
            return format!("{state}.getConstantExpression({})", context.text(*only));
        }
    }
    format!("{state}.getSourceForNode({})", context.text(expression))
}

fn implicit_fix(context: &Context, at: Node, expression: Node) -> Vec<Fix> {
    match visitor_state(context, at) {
        Some(state) => vec![Fix::replace(expression.start_byte(), expression.end_byte(), replacement(context, &state, expression))],
        None => Vec::new(),
    }
}

fn explicit_fix(context: &Context, at: Node, call: Node, expression: Node) -> Vec<Fix> {
    let Some(receiver) = call.child_by_field_name("object") else { return Vec::new() };
    let from = if receiver.id() == expression.id() { at } else { expression };
    match visitor_state(context, from) {
        Some(state) => vec![Fix::replace(call.start_byte(), call.end_byte(), replacement(context, &state, receiver))],
        None => Vec::new(),
    }
}

fn handle(context: &Context, visited: Node, kind: &Type, call: Node, expression: Node, how: Kind) {
    if !is_tree(context, kind) {
        return;
    }
    let fixes = match how {
        Kind::Implicit => implicit_fix(context, visited, expression),
        Kind::Explicit => explicit_fix(context, visited, call, expression),
        Kind::None => Vec::new(),
    };
    context.report_fixed("TreeToString", visited, preferred(expression), MESSAGE, &fixes);
}

fn handle_expression(context: &Context, visited: Node, expression: Node, how: Kind) {
    if let Some(kind) = context.resolver.type_of(expression) {
        handle(context, visited, &kind, expression, expression, how);
    }
}

/// Whether the argument is one of the elements given for a varargs parameter.
fn element_of_varargs(context: &Context, call: Node, argument: Node, formal: &[Type], varargs: bool) -> bool {
    if !varargs {
        return false;
    }
    let args = arguments(call);
    let Some(index) = args.iter().position(|each| each.id() == argument.id()) else { return false };
    if index + 1 < formal.len() {
        return false;
    }
    if args.len() > formal.len() {
        return true;
    }
    match context.resolver.type_of(argument) {
        Some(kind @ Type::Array(_)) => formal.last().is_none_or(|last| kind.erased() != last.erased() && !is_array_subtype(context, &kind, last)),
        _ => true,
    }
}

fn is_array_subtype(context: &Context, kind: &Type, of: &Type) -> bool {
    match (kind, of) {
        (Type::Array(a), Type::Array(b)) => match (&**a, &**b) {
            (Type::Class(x, _), Type::Class(y, _)) => context.resolver.index.is_subtype(x, y),
            (x, y) => x == y,
        },
        _ => false,
    }
}

fn method_call(context: &Context, node: Node) {
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let name = name_of(context, node);
    let method = &resolved.method;
    let owner = if node.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring.clone() };
    let object = Type::class("java.lang.Object");
    let args = arguments(node);
    let one_object = method.parameters == [object.clone()];
    if !method.is_static
        && matches!(name, "print" | "println") && one_object && is_descendant(context, &owner, &["java.io.PrintStream"])
        || !method.is_static && name == "append" && one_object && owner == "java.lang.StringBuilder"
    {
        args.iter().for_each(|argument| handle_expression(context, node, *argument, Kind::Implicit));
    }
    if method.is_static && name == "valueOf" && owner == "java.lang.String" && one_object {
        for argument in &args {
            if let Some(kind) = context.resolver.type_of(*argument) {
                handle(context, node, &kind, node, *argument, Kind::Explicit);
            }
        }
    }
    if !method.is_static && name == "toString" && method.parameters.is_empty() {
        if let Some(receiver) = node.child_by_field_name("object") {
            if let Some(kind) = context.resolver.type_of(receiver) {
                handle(context, node, &kind, node, receiver, Kind::Explicit);
            }
        }
    }
    let formal = &method.parameters;
    if method.detail.annotations.iter().any(|each| each == "com.google.errorprone.annotations.FormatMethod") {
        for argument in &args {
            if element_of_varargs(context, node, *argument, formal, method.varargs) {
                handle_expression(context, node, *argument, Kind::Implicit);
            }
        }
    }
    let string_format = (method.is_static && name == "format" && owner == "java.lang.String") || (!method.is_static && name == "formatted" && owner == "java.lang.String");
    if string_format {
        for argument in &args {
            if element_of_varargs(context, node, *argument, formal, method.varargs) {
                handle_expression(context, node, *argument, Kind::Implicit);
            }
        }
    }
    if !method.is_static && name == "log" && is_descendant(context, &owner, &["com.google.common.flogger.LoggingApi"]) {
        args.iter().for_each(|argument| handle_expression(context, node, *argument, Kind::Implicit));
    }
    if !method.is_static && name == "join" && is_descendant(context, &owner, &["com.google.common.base.Joiner"]) {
        joiner(context, node, &args, formal, method.varargs);
    }
}

fn joiner(context: &Context, node: Node, args: &[Node], formal: &[Type], varargs: bool) {
    if varargs {
        for argument in args {
            let kind = context.resolver.type_of(*argument);
            let last_array = args.len() == formal.len() && args.last().is_some_and(|last| last.id() == argument.id());
            match kind {
                Some(Type::Array(component)) if last_array => handle(context, node, &component, *argument, *argument, Kind::Implicit),
                Some(kind) => handle(context, node, &kind, *argument, *argument, Kind::Implicit),
                None => {}
            }
        }
    } else if formal == [Type::class("java.lang.Iterable")] {
        let Some(argument) = args.first() else { return };
        let Some(kind) = context.resolver.type_of(*argument) else { return };
        let given = context.resolver.index.arguments_as(&kind, "java.lang.Iterable").unwrap_or_default();
        if let Some(element) = given.first() {
            handle(context, node, element, *argument, *argument, Kind::None);
        }
    }
}

fn member_reference(context: &Context, node: Node) {
    let Some(target) = context.resolver.type_of(node) else { return };
    let Some((parameters, _)) = context.resolver.function_type(&target) else { return };
    let Some(first) = parameters.first() else { return };
    let Some((_, class, method, _)) = context.resolver.reference_method(node, std::slice::from_ref(first)) else { return };
    let to_string = method.name == "toString" && method.parameters.is_empty();
    let value_of = method.name == "valueOf" && method.is_static && class.name == "java.lang.String" && method.parameters == [Type::class("java.lang.Object")];
    if (to_string || value_of) && is_tree(context, first) {
        context.report_fixed("TreeToString", node, node.start_byte(), MESSAGE, &[]);
    }
}

fn check(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => method_call(context, node),
        "method_reference" => member_reference(context, node),
        "binary_expression" => {
            if node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "+") && matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if name == "java.lang.String") {
                for side in ["left", "right"] {
                    if let Some(operand) = node.child_by_field_name(side) {
                        handle_expression(context, node, operand, Kind::Implicit);
                    }
                }
            }
        }
        "assignment_expression" => {
            let plus = node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "+=");
            let variable = node.child_by_field_name("left").and_then(|variable| context.resolver.type_of(variable));
            if plus && matches!(variable, Some(Type::Class(name, _)) if name == "java.lang.String") {
                if let Some(value) = node.child_by_field_name("right") {
                    handle_expression(context, node, value, Kind::Implicit);
                }
            }
        }
        _ => {}
    }
}

pub fn tree_to_string(context: &Context, root: Node) {
    let index = context.resolver.index;
    if !index.has("com.google.errorprone.bugpatterns.BugChecker") {
        return;
    }
    let mut checkers: Vec<Node> = Vec::new();
    walk(root, |node| {
        if is_class(node) && context.resolver.scope.names.get(&node.id()).is_some_and(|name| index.is_subtype(name, "com.google.errorprone.bugpatterns.BugChecker")) {
            checkers.push(node);
        }
    });
    for class in &checkers {
        if checkers.iter().any(|outer| outer.id() != class.id() && outer.start_byte() <= class.start_byte() && class.end_byte() <= outer.end_byte()) {
            continue;
        }
        walk(*class, |node| {
            if node.is_named() {
                check(context, node);
            }
        });
    }
}
