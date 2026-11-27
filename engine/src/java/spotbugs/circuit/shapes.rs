//! Shapes of code whose bytecode FindNonShortCircuit reads in a particular way.
use super::super::Context;
use crate::engine::source::named_children;
use crate::java::types::expr::unwrap;
use tree_sitter::Node;

const COMPARISONS: &[&str] = &["==", "!=", "<", ">", "<=", ">="];
const LOGICAL: &[&str] = &["&&", "||"];

fn operator<'a>(context: &'a Context, node: Node) -> &'a str {
    node.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default()
}

/// Whether a statement can end other than by running into the next: its last statement returns or throws.
pub fn ends_abruptly(node: Node) -> bool {
    match node.kind() {
        "return_statement" | "throw_statement" | "break_statement" | "continue_statement" => true,
        "block" => named_children(node).into_iter().rev().find(|part| !part.kind().ends_with("comment")).is_some_and(ends_abruptly),
        _ => false,
    }
}

/// Whether javac writes a value of `0` or `1` right before the jump over a ternary's alternative.
pub fn constant_branch(context: &Context, node: Node) -> bool {
    let node = unwrap(node);
    match node.kind() {
        "true" | "false" => true,
        "decimal_integer_literal" => matches!(context.text(node), "0" | "1"),
        "binary_expression" => COMPARISONS.contains(&operator(context, node)) || LOGICAL.contains(&operator(context, node)),
        "unary_expression" => operator(context, node) == "!",
        _ => false,
    }
}

/// Whether a condition compares a value with `null`.
pub fn null_test(context: &Context, condition: Option<Node>) -> bool {
    let Some(condition) = condition.map(unwrap) else { return false };
    let compares = condition.kind() == "binary_expression" && matches!(operator(context, condition), "==" | "!=");
    compares && ["left", "right"].iter().any(|side| condition.child_by_field_name(side).is_some_and(|side| unwrap(side).kind() == "null_literal"))
}

/// Whether every branch of a switch expression is `true` or `false`.
pub fn constant_switch(context: &Context, switch: Node) -> bool {
    let rules: Vec<Node> = switch.child_by_field_name("body").map(named_children).unwrap_or_default().into_iter().filter(|rule| rule.kind() == "switch_rule").collect();
    let constant = |rule: &Node| {
        let value = named_children(*rule).into_iter().last().filter(|value| value.kind() == "expression_statement").and_then(|value| value.named_child(0));
        value.is_some_and(|value| matches!(context.text(unwrap(value)), "true" | "false"))
    };
    !rules.is_empty() && rules.iter().all(constant)
}
