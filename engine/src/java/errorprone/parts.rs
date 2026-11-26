//! Small pieces of tree shape that checks on calls and declarations share.
use super::Context;
use crate::engine::source::{ancestor, named_children};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

/// The arguments of a call or class creation, without comments.
pub fn arguments<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let list = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
    list.into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// javac puts a method call at its opening parenthesis.
pub fn open_paren(call: Node) -> usize {
    call.child_by_field_name("arguments").map_or(call.start_byte(), |list| list.start_byte())
}

pub fn new_keyword(creation: Node) -> usize {
    crate::engine::source::children(creation).into_iter().find(|part| part.kind() == "new").map_or(creation.start_byte(), |new| new.start_byte())
}

pub fn name_text<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

/// The method or constructor around a node, crossing class bodies.
pub fn enclosing_method(node: Node) -> Option<Node> {
    ancestor(node, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"])
}

pub fn enclosing_class(context: &Context, node: Node) -> Option<String> {
    enclosing_type(context.file, context.resolver.scope, node)
}

pub fn class_of(context: &Context, creation: Node) -> Option<String> {
    match context.resolver.type_node(creation.child_by_field_name("type")?)? {
        Type::Class(name, _) => Some(name),
        _ => None,
    }
}

/// Whether the expression has the class as its type, ignoring type arguments.
pub fn is_exactly(context: &Context, expression: Node, class: &str) -> Option<bool> {
    match context.resolver.type_of(expression)? {
        Type::Class(name, _) => Some(name == class),
        _ => Some(false),
    }
}

pub fn only_argument<'t>(call: Node<'t>) -> Option<Node<'t>> {
    match arguments(call).as_slice() {
        [only] => Some(*only),
        _ => None,
    }
}

fn token_of(node: Node, kind: &str) -> Option<usize> {
    crate::engine::source::children(node).into_iter().find(|part| part.kind() == kind).map(|part| part.start_byte())
}

/// javac's preferred position of an expression: where its diagnostic points.
pub fn preferred(node: Node) -> usize {
    let at = match node.kind() {
        "binary_expression" | "assignment_expression" | "unary_expression" => node.child_by_field_name("operator").map(|operator| operator.start_byte()),
        "update_expression" => token_of(node, "++").or_else(|| token_of(node, "--")),
        "ternary_expression" => token_of(node, "?"),
        "method_invocation" => Some(open_paren(node)),
        "field_access" => token_of(node, "."),
        "array_access" => token_of(node, "["),
        "instanceof_expression" => token_of(node, "instanceof"),
        "lambda_expression" => token_of(node, "->"),
        "object_creation_expression" | "array_creation_expression" => Some(new_keyword(node)),
        _ => None,
    };
    at.unwrap_or(node.start_byte())
}
