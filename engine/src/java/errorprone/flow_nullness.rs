//! A small stand-in for Error Prone's nullness dataflow: a local variable is known non-null where an earlier dereference,
//! a null check or a `requireNonNull` call on every path says so.
use super::Context;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::types::expr::{Binding, unwrap};
use tree_sitter::Node;

const BLOCKS: [&str; 4] = ["block", "constructor_body", "switch_block_statement_group", "switch_rule"];

fn is_name(context: &Context, node: Node, name: &str) -> bool {
    let node = unwrap(node);
    node.kind() == "identifier" && context.text(node) == name
}

fn assigned(context: &Context, root: Node, name: &str) -> bool {
    let mut found = false;
    walk(root, |node| {
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => node.named_child(0),
            _ => None,
        };
        found |= target.is_some_and(|target| is_name(context, target, name));
    });
    found
}

fn lazy_step(child: Node, above: Node, context: &Context) -> bool {
    match above.kind() {
        "ternary_expression" => above.child_by_field_name("condition").is_none_or(|condition| condition.id() != child.id()),
        "binary_expression" => {
            let lazy = above.child_by_field_name("operator").is_some_and(|op| matches!(context.text(op), "&&" | "||"));
            lazy && above.child_by_field_name("right").is_some_and(|right| right.id() == child.id())
        }
        "lambda_expression" | "class_body" => true,
        _ => false,
    }
}

fn dereferences(context: &Context, root: Node, name: &str, before: usize) -> bool {
    let mut found = false;
    walk(root, |node| {
        if found || node.start_byte() >= before {
            return;
        }
        let object = match node.kind() {
            "method_invocation" => node.child_by_field_name("object"),
            "field_access" => node.child_by_field_name("object"),
            "array_access" => node.child_by_field_name("array"),
            _ => None,
        };
        if !object.is_some_and(|object| is_name(context, object, name)) {
            return;
        }
        let mut child = node;
        while child.id() != root.id() {
            let Some(above) = parent(child) else { return };
            if lazy_step(child, above, context) {
                return;
            }
            child = above;
        }
        found = true;
    });
    found
}

fn null_test(context: &Context, test: Node, name: &str, operator: &str) -> bool {
    let test = unwrap(test);
    if test.kind() != "binary_expression" {
        return false;
    }
    let Some(op) = test.child_by_field_name("operator") else { return false };
    let (Some(left), Some(right)) = (test.child_by_field_name("left"), test.child_by_field_name("right")) else { return false };
    match context.text(op) {
        "&&" if operator == "!=" => null_test(context, left, name, operator) || null_test(context, right, name, operator),
        "||" if operator == "==" => null_test(context, left, name, operator) || null_test(context, right, name, operator),
        found if found == operator => (is_name(context, left, name) && unwrap(right).kind() == "null_literal") || (is_name(context, right, name) && unwrap(left).kind() == "null_literal"),
        _ => false,
    }
}

fn ends_abruptly(statement: Node) -> bool {
    match statement.kind() {
        "return_statement" | "throw_statement" | "continue_statement" | "break_statement" => true,
        "block" => named_children(statement).last().is_some_and(|last| ends_abruptly(*last)),
        _ => false,
    }
}

fn requires_non_null(context: &Context, statement: Node, name: &str) -> bool {
    let Some(call) = children(statement).into_iter().find(|part| part.kind() == "method_invocation") else { return false };
    let method = super::parts::name_text(context, call);
    matches!(method, "requireNonNull" | "checkNotNull" | "verifyNotNull") && super::parts::arguments(call).first().is_some_and(|first| is_name(context, *first, name))
}

/// What an earlier statement in the block tells about the variable, when it is evaluated on every path.
fn statement_makes_non_null(context: &Context, statement: Node, name: &str) -> bool {
    match statement.kind() {
        "if_statement" => {
            let Some(condition) = statement.child_by_field_name("condition") else { return false };
            if dereferences(context, condition, name, usize::MAX) {
                return true;
            }
            let rejects = null_test(context, condition, name, "==");
            rejects && statement.child_by_field_name("consequence").is_some_and(ends_abruptly) && statement.child_by_field_name("alternative").is_none()
        }
        "while_statement" | "switch_expression" => statement.child_by_field_name("condition").is_some_and(|condition| dereferences(context, condition, name, usize::MAX)),
        "for_statement" => children(statement).into_iter().any(|part| part.kind() != "block" && dereferences(context, part, name, usize::MAX)) && statement.child_by_field_name("body").is_some_and(|body| !assigned(context, body, name)),
        "expression_statement" => dereferences(context, statement, name, usize::MAX) || requires_non_null(context, statement, name),
        "local_variable_declaration" | "return_statement" | "throw_statement" | "yield_statement" => dereferences(context, statement, name, usize::MAX),
        _ => false,
    }
}

/// Whether the variable read at `usage` is known to be non-null there.
pub fn non_null_variable(context: &Context, usage: Node) -> bool {
    let name = context.text(usage);
    if !matches!(context.resolver.binding(usage, name), Some(Binding::Local(_))) {
        return false;
    }
    let mut child = usage;
    while let Some(above) = parent(child) {
        match above.kind() {
            "binary_expression" => {
                let op = above.child_by_field_name("operator").map(|op| context.text(op));
                if op == Some("&&") && above.child_by_field_name("right").is_some_and(|right| right.id() == child.id()) && above.child_by_field_name("left").is_some_and(|left| null_test(context, left, name, "!=")) {
                    return true;
                }
                if op == Some("||") && above.child_by_field_name("right").is_some_and(|right| right.id() == child.id()) && above.child_by_field_name("left").is_some_and(|left| null_test(context, left, name, "==")) {
                    return true;
                }
            }
            "ternary_expression" => {
                let (condition, consequence) = (above.child_by_field_name("condition"), above.child_by_field_name("consequence"));
                if condition.zip(consequence).is_some_and(|(condition, consequence)| consequence.id() == child.id() && null_test(context, condition, name, "!=")) {
                    return true;
                }
            }
            "if_statement" => {
                if above.child_by_field_name("consequence").is_some_and(|body| body.id() == child.id()) && above.child_by_field_name("condition").is_some_and(|test| null_test(context, test, name, "!=")) {
                    return true;
                }
                if above.child_by_field_name("alternative").is_some_and(|body| body.id() == child.id()) && above.child_by_field_name("condition").is_some_and(|test| null_test(context, test, name, "==")) {
                    return true;
                }
            }
            "lambda_expression" | "method_declaration" | "constructor_declaration" | "class_body" => return false,
            _ => {}
        }
        if BLOCKS.contains(&above.kind()) || above.kind() == "program" {
            let earlier: Vec<Node> = named_children(above).into_iter().filter(|part| part.end_byte() <= child.start_byte() && !part.kind().ends_with("comment")).collect();
            if earlier.iter().any(|statement| assigned(context, *statement, name)) {
                return false;
            }
            if earlier.iter().any(|statement| statement_makes_non_null(context, *statement, name)) {
                return true;
            }
        }
        if matches!(above.kind(), "expression_statement" | "local_variable_declaration" | "return_statement") && dereferences(context, above, name, usage.start_byte()) {
            return !assigned(context, above, name);
        }
        child = above;
    }
    false
}
