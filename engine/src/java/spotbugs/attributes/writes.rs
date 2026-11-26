//! Where and in what order SpotBugs meets the stores into a field. It reads a class's constructors and static
//! initializer before its other methods, those in the order javac writes them, and the methods javac makes of
//! lambdas last. Field initializers and initializer blocks run inside every constructor that does not start with
//! `this(...)`, so they count from the first of those.
use super::super::Context;
use super::super::classes::lines;
use crate::engine::source::{children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

const BODIES: &[&str] = &["class_body", "interface_body", "enum_body", "enum_body_declarations", "annotation_type_body"];

/// What part of its class a store sits in.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Phase {
    Construct,
    StaticInit,
    Method,
    Lambda,
}

/// How SpotBugs orders the stores of one class: phase, constructor, initializer before body, place in the file.
pub type Order = (Phase, usize, u8, usize);

/// The member of a class body that holds a node, and whether a lambda lies in between.
fn member_of(node: Node) -> Option<(Node, bool)> {
    let mut lambda = false;
    let mut current = node;
    loop {
        let above = parent(current)?;
        if BODIES.contains(&above.kind()) {
            return Some((current, lambda));
        }
        lambda |= current.kind() == "lambda_expression";
        current = above;
    }
}

fn delegating(constructor: Node) -> bool {
    constructor.kind() == "constructor_declaration" && lines::delegates(constructor)
}

/// The order of a store in its class.
pub fn order(node: Node) -> Option<Order> {
    let (member, lambda) = member_of(node)?;
    let at = node.start_byte();
    if lambda {
        return Some((Phase::Lambda, 0, 0, at));
    }
    let body = parent(member)?;
    let body = if body.kind() == "enum_body_declarations" { parent(body)? } else { body };
    let constructors: Vec<Node> = super::super::place::members(body)
        .into_iter()
        .filter(|part| matches!(part.kind(), "constructor_declaration" | "compact_constructor_declaration"))
        .collect();
    let in_interface = body.kind() == "interface_body";
    Some(match member.kind() {
        "constructor_declaration" | "compact_constructor_declaration" => {
            let place = constructors.iter().position(|constructor| constructor.id() == member.id()).unwrap_or(0);
            (Phase::Construct, place, 1, at)
        }
        "field_declaration" | "constant_declaration" if in_interface || has_modifier(member, "static") || member.kind() == "constant_declaration" => (Phase::StaticInit, 0, 0, at),
        "static_initializer" | "enum_constant" => (Phase::StaticInit, 0, 0, at),
        "field_declaration" | "block" => {
            let first = constructors.iter().position(|constructor| !delegating(*constructor)).unwrap_or(0);
            (Phase::Construct, first, 0, at)
        }
        _ => (Phase::Method, 0, 0, at),
    })
}

/// Whether a store sits, outside any lambda, in a method named `init` or `initialize`.
pub fn setup(context: &Context, node: Node) -> bool {
    member_of(node).is_some_and(|(member, lambda)| {
        let name = member.child_by_field_name("name").map(|name| context.text(name));
        !lambda && member.kind() == "method_declaration" && matches!(name, Some("init" | "initialize"))
    })
}

/// The class a store is written in.
pub fn writer(context: &Context, node: Node) -> Option<String> {
    enclosing_types(context.resolver.scope, node).into_iter().next()
}

/// The code that holds a field access and starts a line entry of its own: a statement, a lambda's body or a field
/// initializer.
fn scope_of(node: Node) -> Node {
    let mut current = node;
    while let Some(above) = parent(current) {
        let lambda_body = above.kind() == "lambda_expression" && above.child_by_field_name("body").is_some_and(|body| body.id() == current.id());
        if lambda_body || current.kind() == "variable_declarator" || current.kind().ends_with("_statement") || current.kind() == "local_variable_declaration" {
            return current;
        }
        current = above;
    }
    current
}

/// The call of `scope` javac invokes last before the byte `upto`: its line entry is the one code there gets.
fn last_call(scope: Node, upto: usize) -> Option<Node> {
    let mut found: Option<Node> = None;
    let mut stack = vec![scope];
    while let Some(node) = stack.pop() {
        if node.start_byte() >= upto || (node.id() != scope.id() && matches!(node.kind(), "lambda_expression" | "class_body")) {
            continue;
        }
        if node.kind() == "method_invocation" && node.end_byte() <= upto && found.is_none_or(|best| node.end_byte() > best.end_byte()) {
            found = Some(node);
        }
        stack.extend(children(node));
    }
    found
}

/// The line javac gives the instruction that loads or stores a field: the last call made before it in the
/// statement, else where the statement starts. A store comes after its value, a load where it is written.
pub fn line(context: &Context, access: Node, store: bool) -> usize {
    let scope = scope_of(access);
    let upto = if store { access.end_byte() } else { access.start_byte() };
    if let Some(arguments) = last_call(scope, upto).and_then(|call| call.child_by_field_name("arguments")) {
        return context.line(arguments);
    }
    match scope.kind() {
        "variable_declarator" if parent(scope).is_some_and(|holder| holder.kind() != "local_variable_declaration") => {
            scope.child_by_field_name("name").map_or_else(|| context.line(scope), |name| context.line(name))
        }
        "expression_statement" | "local_variable_declaration" => lines::statement_start(context, scope).unwrap_or_else(|| context.line(scope)),
        _ => context.line(scope),
    }
}

/// Whether a stored value is an array known to have no elements: `{}`, `new T[0]` or `new T[] {}`.
pub fn empty_array(context: &Context, value: Node) -> bool {
    let value = crate::java::types::expr::unwrap(value);
    match value.kind() {
        "array_initializer" => children(value).iter().all(|part| !part.is_named() || part.kind().ends_with("comment")),
        "array_creation_expression" => {
            let sized: Vec<Node> = children(value).into_iter().filter(|part| part.kind() == "dimensions_expr").collect();
            match value.child_by_field_name("value") {
                Some(initializer) => empty_array(context, initializer),
                None => sized.first().and_then(|first| first.named_child(0)).is_some_and(|size| context.text(size) == "0"),
            }
        }
        _ => false,
    }
}
