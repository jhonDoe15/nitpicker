//! Where javac jumps back to the start of a loop, and what a `break` or `continue` leaves: a loop whose body can
//! never reach its end or a `continue` has no back branch, and its code runs once like any other.
use crate::engine::source::{named_children, parent};
use crate::java::types::expr::unwrap;
use tree_sitter::Node;

const LOOPS: [&str; 4] = ["while_statement", "do_statement", "for_statement", "enhanced_for_statement"];

fn label(context: &super::super::super::Context, jump: Node) -> Option<String> {
    named_children(jump).into_iter().find(|part| part.kind() == "identifier").map(|part| context.text(part).to_string())
}

/// The statement a `break` or `continue` leaves or goes back to.
pub fn target<'a>(context: &super::super::super::Context, jump: Node<'a>) -> Option<Node<'a>> {
    let named = label(context, jump);
    let breaks = jump.kind() == "break_statement";
    let mut at = parent(jump);
    while let Some(node) = at {
        let kind = node.kind();
        if kind == "lambda_expression" || kind == "class_body" {
            return None;
        }
        let found = match &named {
            Some(name) => kind == "labeled_statement" && named_children(node).first().is_some_and(|first| context.text(*first) == name),
            None => LOOPS.contains(&kind) || (breaks && kind == "switch_expression"),
        };
        if found {
            return Some(if named.is_some() { named_children(node).into_iter().rev().find(|part| part.kind() != "identifier").unwrap_or(node) } else { node });
        }
        at = parent(node);
    }
    None
}

fn jumps_to(context: &super::super::super::Context, within: Node, kind: &str, to: Node) -> bool {
    let mut found = false;
    crate::engine::source::walk(within, |node| {
        if !found && node.kind() == kind && target(context, node).is_some_and(|target| target.id() == to.id()) {
            found = true;
        }
    });
    found
}

fn constant(condition: Option<Node>, value: &str) -> bool {
    condition.is_none_or(|condition| unwrap(condition).kind() == value)
}

/// Whether javac's code can run past the end of a statement.
pub fn alive(context: &super::super::super::Context, node: Node) -> bool {
    let body = || node.child_by_field_name("body");
    let left = || jumps_to(context, node, "break_statement", node);
    match node.kind() {
        "return_statement" | "throw_statement" | "break_statement" | "continue_statement" | "yield_statement" => false,
        "block" => named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).last().is_none_or(|last| alive(context, last)),
        "if_statement" => match (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) {
            (Some(then), Some(other)) => alive(context, then) || alive(context, other),
            _ => true,
        },
        "while_statement" | "for_statement" => !constant(node.child_by_field_name("condition"), "true") || left(),
        "do_statement" => left() || (!constant(node.child_by_field_name("condition"), "true") && body().is_some_and(|body| alive(context, body) || jumps_to(context, body, "continue_statement", node))),
        "labeled_statement" => named_children(node).last().is_none_or(|inner| alive(context, *inner) || jumps_to(context, *inner, "break_statement", *inner)),
        "synchronized_statement" => body().is_none_or(|body| alive(context, body)),
        "try_statement" | "try_with_resources_statement" => {
            let parts = named_children(node);
            let finally = parts.iter().find(|part| part.kind() == "finally_clause").and_then(|part| named_children(*part).last().copied());
            let ends = body().is_none_or(|body| alive(context, body)) || parts.iter().filter(|part| part.kind() == "catch_clause").any(|part| part.child_by_field_name("body").is_none_or(|body| alive(context, body)));
            ends && finally.is_none_or(|finally| alive(context, finally))
        }
        _ => true,
    }
}

/// Whether javac ends a loop with a jump back to its start.
pub fn back_edge(context: &super::super::super::Context, node: Node) -> bool {
    if node.kind() == "do_statement" && node.child_by_field_name("condition").is_some_and(|condition| unwrap(condition).kind() == "false") {
        return false;
    }
    node.child_by_field_name("body").is_none_or(|body| alive(context, body) || jumps_to(context, body, "continue_statement", node))
}
