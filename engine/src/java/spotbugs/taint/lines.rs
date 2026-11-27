//! The line javac gives a sink call's instruction. javac starts a line at each statement (a declaration or a
//! `try` resource at the name it declares, a `do` loop's condition at the condition) and at each method call,
//! just before the call, at the line of its `(`. A call keeps its own line; a `new` takes the line started last
//! before it: by its statement, or by a call made before it.
use crate::engine::source::{ancestor, children, parent};
use crate::java::spotbugs::Context;
use tree_sitter::Node;

const STATEMENTS: &[&str] = &[
    "expression_statement",
    "local_variable_declaration",
    "field_declaration",
    "return_statement",
    "throw_statement",
    "if_statement",
    "while_statement",
    "do_statement",
    "for_statement",
    "enhanced_for_statement",
    "switch_expression",
    "yield_statement",
    "assert_statement",
    "synchronized_statement",
    "explicit_constructor_invocation",
    "lambda_expression",
    "resource",
];

/// Where javac starts the line of the statement around a node, and that line.
fn statement(context: &Context, node: Node) -> (usize, usize) {
    let Some(around) = ancestor(node, STATEMENTS) else { return (node.start_byte(), context.line(node)) };
    match around.kind() {
        "lambda_expression" => {
            let body = around.child_by_field_name("body").unwrap_or(node);
            (body.start_byte(), context.line(body))
        }
        "resource" => {
            let name = around.child_by_field_name("name").unwrap_or(around);
            (around.start_byte(), context.line(name))
        }
        "do_statement" => match around.child_by_field_name("condition").filter(|condition| contains(*condition, node)) {
            Some(condition) => (condition.start_byte(), context.line(condition)),
            None => (around.start_byte(), context.line(around)),
        },
        "local_variable_declaration" | "field_declaration" => {
            let declarator = children(around).into_iter().find(|part| part.kind() == "variable_declarator" && part.start_byte() <= node.start_byte() && node.end_byte() <= part.end_byte());
            let name = declarator.and_then(|declarator| declarator.child_by_field_name("name")).unwrap_or(around);
            (around.start_byte(), context.line(name))
        }
        _ => (around.start_byte(), context.line(around)),
    }
}

fn contains(outer: Node, inner: Node) -> bool {
    outer.start_byte() <= inner.start_byte() && inner.end_byte() <= outer.end_byte()
}

/// The line of a sink's instruction.
pub fn line(context: &Context, sink: Node) -> usize {
    if sink.kind() != "object_creation_expression" {
        return sink.child_by_field_name("arguments").map_or_else(|| context.line(sink), |arguments| context.line(arguments));
    }
    let (start, mut found) = statement(context, sink);
    let mut last = start;
    let Some(around) = ancestor(sink, STATEMENTS).or_else(|| parent(sink)) else { return found };
    let mut pending = vec![around];
    while let Some(node) = pending.pop() {
        if node != around && matches!(node.kind(), "class_body" | "lambda_expression") {
            continue;
        }
        let entry = match node.kind() {
            "method_invocation" => node.child_by_field_name("arguments").map(|arguments| context.line(arguments)),
            "object_creation_expression" if node != sink && contains(sink, node) => Some(context.line(node)),
            _ => None,
        };
        if let Some(at) = entry
            && node.end_byte() <= sink.end_byte()
            && !contains(node, sink)
            && node.end_byte() > last
        {
            last = node.end_byte();
            found = at;
        }
        pending.extend(children(node));
    }
    found
}
