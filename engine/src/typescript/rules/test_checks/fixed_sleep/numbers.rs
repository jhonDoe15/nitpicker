//! `constantNumber` of `constant-resolution.mts`: the number an expression of numeric literals, `const` names and
//! `+ - * /` folds to.
use crate::typescript::rules::security_values::resolve_constant;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};

const MAX_RESOLVE_DEPTH: usize = 8;
const NUMBER_OPERATORS: [&str; 4] = ["*", "+", "-", "/"];

struct Entry<'s> {
    node: Option<Node<'s>>,
    depth: usize,
    parent: Option<usize>,
}

fn operator(node: Node) -> Option<String> {
    node.text("operator").map(|operator| operator.into_owned())
}

fn operand_nodes(node: Option<Node>) -> Vec<Option<Node>> {
    let Some(node) = node else { return Vec::new() };
    let operator = operator(node);
    if node.is("UnaryExpression") && matches!(operator.as_deref(), Some("-" | "+")) {
        return vec![node.node("argument")];
    }
    if node.is("BinaryExpression") && operator.is_some_and(|operator| NUMBER_OPERATORS.contains(&operator.as_str())) {
        return vec![node.node("left"), node.node("right")];
    }
    Vec::new()
}

fn entry<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>, depth: usize, parent: Option<usize>) -> Entry<'s> {
    let node = if depth > MAX_RESOLVE_DEPTH { None } else { resolve_constant(scopes, node) };
    Entry { node, depth, parent }
}

fn numeric_value(node: Option<Node>, operands: &[Option<f64>]) -> Option<f64> {
    if let Some(node) = node.filter(|node| node.is("Literal"))
        && let Value::Number(value) = node.get("value")
        && node.get("bigint") == Value::Null
    {
        return Some(value);
    }
    let numbers: Vec<f64> = operands.iter().flatten().copied().collect();
    let left = *numbers.first()?;
    if numbers.len() < operands.len() {
        return None;
    }
    let node = node?;
    if node.is("UnaryExpression") {
        return Some(if operator(node).as_deref() == Some("-") { -left } else { left });
    }
    let right = *numbers.get(1)?;
    if !node.is("BinaryExpression") {
        return None;
    }
    match operator(node).as_deref() {
        Some("*") => Some(left * right),
        Some("+") => Some(left + right),
        Some("-") => Some(left - right),
        Some("/") => Some(left / right),
        _ => None,
    }
}

/// `constantNumber(context, node)`.
pub fn constant_number<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<f64> {
    let mut entries = vec![entry(scopes, node, 0, None)];
    let mut index = 0;
    while index < entries.len() {
        let operands = operand_nodes(entries[index].node);
        let depth = entries[index].depth + 1;
        for operand in operands {
            let next = entry(scopes, operand, depth, Some(index));
            entries.push(next);
        }
        index += 1;
    }
    let mut values: Vec<Option<f64>> = vec![None; entries.len()];
    for at in (0..entries.len()).rev() {
        let operands: Vec<Option<f64>> = (0..entries.len()).filter(|other| entries[*other].parent == Some(at)).map(|other| values[other]).collect();
        values[at] = numeric_value(entries[at].node, &operands);
    }
    values[0]
}
