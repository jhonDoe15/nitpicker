//! Finally: a `return`, `throw`, `break` or `continue` that leaves a `finally` block.
use super::Context;
use crate::engine::source::{children, named_children, parent};
use tree_sitter::Node;

const FINALLY: &str = "If you return or throw from a finally, then values returned or thrown from the try-catch block will be ignored. Consider using try-with-resources instead.";

const STOPS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression", "class_declaration", "class_body"];
const LOOPS: &[&str] = &["while_statement", "do_statement", "for_statement", "enhanced_for_statement"];

enum Found {
    Keep,
    No,
    Error,
}

fn label_of<'t>(node: Node<'t>) -> Option<Node<'t>> {
    named_children(node).into_iter().find(|part| part.kind() == "identifier")
}

fn ancestor_result(context: &Context, statement: Node, leaf: Node, previous: Option<Node>) -> Found {
    let jump = matches!(statement.kind(), "break_statement" | "continue_statement");
    if jump {
        let label = label_of(statement);
        if label.is_none() && LOOPS.contains(&leaf.kind()) {
            return Found::No;
        }
        if let (Some(label), "labeled_statement") = (label, leaf.kind()) {
            if named_children(leaf).first().is_some_and(|name| context.text(*name) == context.text(label)) {
                return Found::No;
            }
        }
        if statement.kind() == "break_statement" && leaf.kind() == "switch_expression" {
            return Found::No;
        }
    }
    if statement.kind() == "throw_statement" && matches!(leaf.kind(), "try_statement" | "try_with_resources_statement") {
        let body = leaf.child_by_field_name("body");
        let caught = children(leaf).into_iter().any(|part| part.kind() == "catch_clause");
        if previous.is_some_and(|prev| Some(prev) == body) && caught {
            return Found::No;
        }
    }
    if matches!(leaf.kind(), "try_statement" | "try_with_resources_statement") && previous.is_some_and(|prev| prev.kind() == "finally_clause") {
        return Found::Error;
    }
    Found::Keep
}

pub fn finally(context: &Context, node: Node) {
    if !matches!(node.kind(), "return_statement" | "throw_statement" | "break_statement" | "continue_statement") {
        return;
    }
    let mut previous: Option<Node> = None;
    let mut leaf = Some(node);
    while let Some(at) = leaf {
        if STOPS.contains(&at.kind()) {
            return;
        }
        match ancestor_result(context, node, at, previous) {
            Found::Keep => {}
            Found::No => return,
            Found::Error => {
                if context.suppressed("finally", node) {
                    return;
                }
                context.report_fixed("Finally", node, node.start_byte(), FINALLY, &[]);
                return;
            }
        }
        previous = Some(at);
        leaf = parent(at);
    }
}
