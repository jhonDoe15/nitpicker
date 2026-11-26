//! Where javac reports a tree: its preferred position, and small helpers over argument lists and receivers.
use super::Context;
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

/// The named children of an argument list, without comments.
pub fn arguments<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    call.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// The first child of a node that is the token with this text.
fn token(node: Node, text: &str) -> Option<usize> {
    children(node).into_iter().find(|part| !part.is_named() && part.kind() == text).map(|part| part.start_byte())
}

/// javac's preferred position of an expression: the operator of a binary, the `(` of a call, the `.` of a field access.
pub fn preferred(context: &Context, node: Node) -> usize {
    let found = match node.kind() {
        "method_invocation" => node.child_by_field_name("arguments").map(|list| list.start_byte()),
        "field_access" => token(node, "."),
        "binary_expression" => node.child_by_field_name("operator").map(|operator| operator.start_byte()),
        "assignment_expression" => node.child_by_field_name("operator").map(|operator| operator.start_byte()),
        "array_access" => token(node, "["),
        "ternary_expression" => token(node, "?"),
        "lambda_expression" => token(node, "->"),
        "instanceof_expression" => token(node, "instanceof"),
        "unary_expression" => node.child_by_field_name("operator").map(|operator| operator.start_byte()),
        "update_expression" => children(node).into_iter().find(|part| matches!(context.text(*part), "++" | "--")).map(|part| part.start_byte()),
        _ => None,
    };
    found.unwrap_or(node.start_byte())
}

/// The receiver written before the method name of a call.
pub fn receiver<'t>(call: Node<'t>) -> Option<Node<'t>> {
    call.child_by_field_name("object")
}

const STATEMENTS: [&str; 17] = [
    "expression_statement", "return_statement", "if_statement", "local_variable_declaration", "throw_statement", "while_statement", "do_statement",
    "for_statement", "enhanced_for_statement", "switch_expression", "yield_statement", "assert_statement", "synchronized_statement", "try_statement",
    "try_with_resources_statement", "labeled_statement", "block",
];

/// The nearest statement around a node, the node itself when it is one.
pub fn enclosing_statement(node: Node, include_self: bool) -> Option<Node> {
    let mut current = if include_self { Some(node) } else { crate::engine::source::parent(node) };
    while let Some(at) = current {
        if STATEMENTS.contains(&at.kind()) && !(at.kind() == "switch_expression" && crate::engine::source::parent(at).is_some_and(|up| up.kind() != "expression_statement")) {
            return Some(at);
        }
        current = crate::engine::source::parent(at);
    }
    None
}
