//! The lines on which SpotBugs reports no dead store: the line where the compiled handler of a `finally` or a
//! `synchronized` block starts, when code of another line follows that handler.
use super::super::super::Context;
use super::super::report::emits;
use super::super::slots::completes;
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use std::collections::HashSet;
use tree_sitter::Node;

pub fn handler_lines(context: &Context, bodies: &[Node]) -> HashSet<usize> {
    let mut lines = HashSet::new();
    for (index, body) in bodies.iter().enumerate() {
        walk(*body, |part| {
            let nested = ancestor(part, &["lambda_expression", "class_body"]).is_some_and(|around| around.start_byte() >= body.start_byte());
            let Some(line) = handler(context, part).filter(|_| !nested) else { return };
            if index + 1 < bodies.len() || followed(context, part, *body, line) {
                lines.insert(line);
            }
        });
    }
    lines
}

/// The line javac gives the handler: the closing brace of a `synchronized` block, the first statement of a
/// `finally` block, or its closing brace when it is empty but the `try` has a `catch` too.
fn handler(context: &Context, node: Node) -> Option<usize> {
    let closing = |block: Node| context.line_at(block.end_byte().saturating_sub(1));
    match node.kind() {
        "synchronized_statement" => node.child_by_field_name("body").or_else(|| children(node).into_iter().find(|part| part.kind() == "block")).map(closing),
        "try_statement" | "try_with_resources_statement" => {
            let finally = children(node).into_iter().find(|part| part.kind() == "finally_clause")?;
            let block = children(finally).into_iter().find(|part| part.kind() == "block")?;
            match named_children(block).into_iter().find(|part| emits(*part)) {
                Some(first) => Some(context.line(first)),
                None => children(node).into_iter().any(|part| part.kind() == "catch_clause").then(|| closing(block)),
            }
        }
        _ => None,
    }
}

fn code(node: Node) -> bool {
    match node.kind() {
        "finally_clause" => children(node).into_iter().any(|part| part.kind() == "block" && emits(part)),
        _ => emits(node),
    }
}

/// Whether code of a line other than the handler's comes after it in the compiled method.
fn followed(context: &Context, statement: Node, body: Node, line: usize) -> bool {
    let elsewhere = |node: Node| context.line(node) != line || context.line_at(node.end_byte().saturating_sub(1)) != line;
    let mut node = statement;
    while node.id() != body.id() {
        let Some(holder) = parent(node) else { return false };
        let mut after = std::iter::successors(node.next_named_sibling(), |next| next.next_named_sibling());
        if after.any(|next| code(next) && elsewhere(next)) {
            return true;
        }
        if holder.kind() == "for_statement" && holder.child_by_field_name("body").is_some_and(|loop_body| loop_body.id() == node.id()) {
            let mut cursor = holder.walk();
            if holder.children_by_field_name("update", &mut cursor).any(elsewhere) {
                return true;
            }
        }
        node = holder;
    }
    completes(body) && context.line_at(body.end_byte().saturating_sub(1)) != line
}
