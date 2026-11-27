//! `no-operand-slip`: the same operand on both sides of an operator, repeated or contradicting operands of one
//! `&&`/`||` chain, `* 0` that erases an operand, and compound assignments that apply their target twice.
mod arithmetic;
mod chains;
mod comparisons;
mod terms;

use self::chains::{chain_slips, Slip};
use self::terms::{in_boolean_context, is_stable, normal_term};
use crate::typescript::rules::logic_terms::key;
use crate::typescript::rules::logic_terms::print::print;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::Context;

const RULE: &str = "no-operand-slip";
const FIX_COPY: &str = " One side was probably copied: fix the operand that was meant to differ.";
const SELF_OPERATORS: [&str; 10] = ["<", "<=", ">", ">=", "-", "/", "%", "&", "|", "^"];
const NAN_TESTS: [&str; 4] = ["===", "!==", "==", "!="];

fn same_operand(node: Node, operator: &str, source: &str) -> Option<String> {
    let left = normal_term(node.node("left")?, source, false);
    let right = normal_term(node.node("right")?, source, false);
    if !is_stable(&left) || key(&left) != key(&right) {
        return None;
    }
    let operand = print(&left);
    if NAN_TESTS.contains(&operator) && matches!(left.kind, "name" | "member" | "index") {
        return Some(format!("`{operand}` is compared with itself. To test for NaN, write `Number.isNaN({operand})`.{FIX_COPY}"));
    }
    Some(format!("`{operand}` is on both sides of `{operator}`.{FIX_COPY}"))
}

fn binary_message(node: Node, source: &str) -> Option<String> {
    let operator = node.text("operator")?;
    let is_self_operator = SELF_OPERATORS.contains(&operator.as_ref()) || NAN_TESTS.contains(&operator.as_ref());
    let same = if is_self_operator { same_operand(node, &operator, source) } else { None };
    same.or_else(|| {
        arithmetic::erasing(node, source).map(|(operand, operator)| {
            format!("`{operator} 0` erases `{operand}`: the result is 0 whatever it holds (or -0 or NaN with `*`). Write the value meant, or fix the operand.")
        })
    })
}

fn assignment_message(node: Node, source: &str) -> Option<String> {
    arithmetic::misrefactored(node, source).map(|(target, operator)| {
        format!("`{target} {operator}=` already applies `{target}`, and the right side uses it again. Drop `{target}` from the right side, or write `{target} = ...` with the whole expression.")
    })
}

fn slip_message(slip: Slip, operator: &str) -> String {
    match slip {
        Slip::Repeated { operand } => format!("`{operand}` appears twice in this `{operator}` chain.{FIX_COPY}"),
        Slip::Impossible => "These comparisons of one value cannot both hold, so this `&&` is always false. Fix the constant or operator that was copied.".to_string(),
        Slip::Always => "Together these comparisons of one value always hold, so this `||` is always true. Fix the constant or operator that was copied.".to_string(),
        Slip::Implied { redundant, deciding } => {
            format!("`{redundant}` already follows from `{deciding}`, so it checks nothing. Remove it, or fix its constant or operator.")
        }
        Slip::Covered { redundant, deciding } => format!("`{redundant}` adds nothing: `{deciding}` holds whenever it does. Remove it, or fix its constant or operator."),
    }
}

fn is_chain_head(node: Node, operator: &str) -> bool {
    !node.parent().is_some_and(|parent| parent.is("LogicalExpression") && parent.text("operator").as_deref() == Some(operator))
}

fn chain_messages(node: Node, source: &str) -> Vec<String> {
    let Some(operator) = node.text("operator").filter(|operator| operator != "??") else { return Vec::new() };
    if !is_chain_head(node, &operator) {
        return Vec::new();
    }
    chain_slips(node, &operator, source, in_boolean_context(node)).into_iter().map(|slip| slip_message(slip, &operator)).collect()
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let source = context.file.text;
    let mut found = Vec::new();
    for node in view.nodes() {
        let messages = match node.kind() {
            "BinaryExpression" => binary_message(node, source).into_iter().collect(),
            "AssignmentExpression" => assignment_message(node, source).into_iter().collect(),
            "LogicalExpression" => chain_messages(node, source),
            _ => Vec::new(),
        };
        found.extend(messages.into_iter().map(|message| (node.start(), node.end(), message)));
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
