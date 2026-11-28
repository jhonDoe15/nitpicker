//! Whether javac follows a field read with `ifnonnull`, which SpotBugs does not take as an uninitialized read.
use super::super::super::Context;
use crate::engine::source::parent;
use tree_sitter::Node;

/// Whether `value == null` or `value != null` compiles to a jump taken when the value is not null. javac jumps on
/// the false side of a condition in an `if`, a loop, a `?:` and a boolean value, on the true side in an `assert`;
/// the left side of `&&` always jumps when false, that of `||` when true, the right side keeps the side of the
/// whole, and `!` swaps it.
pub fn tested_not_null(context: &Context, read: Node) -> bool {
    let mut value = read;
    while let Some(holder) = parent(value).filter(|holder| holder.kind() == "parenthesized_expression") {
        value = holder;
    }
    let Some(compare) = parent(value).filter(|holder| holder.kind() == "binary_expression") else { return false };
    let left = compare.child_by_field_name("left").is_some_and(|left| left.id() == value.id());
    let null = compare.child_by_field_name("right").is_some_and(|right| crate::java::types::expr::unwrap(right).kind() == "null_literal");
    let operator = compare.child_by_field_name("operator").map(|operator| context.text(operator));
    if !left || !null || !matches!(operator, Some("==" | "!=")) {
        return false;
    }
    let jumps_when_true = side(context, compare);
    (operator == Some("==")) != jumps_when_true
}

/// Whether javac jumps when a condition is true, from what holds it.
fn side(context: &Context, condition: Node) -> bool {
    let Some(holder) = parent(condition) else { return false };
    match holder.kind() {
        "parenthesized_expression" => side(context, holder),
        "unary_expression" if holder.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!") => !side(context, holder),
        "binary_expression" => {
            let operator = holder.child_by_field_name("operator").map(|operator| context.text(operator));
            let left = holder.child_by_field_name("left").is_some_and(|left| left.id() == condition.id());
            match operator {
                Some("&&") if left => false,
                Some("||") if left => true,
                Some("&&" | "||") => side(context, holder),
                _ => false,
            }
        }
        "assert_statement" => true,
        _ => false,
    }
}
