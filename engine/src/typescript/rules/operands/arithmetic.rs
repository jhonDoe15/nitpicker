//! `operand-arithmetic.mts`: `* 0` and `& 0` that erase an operand, and compound assignments whose right side
//! applies the target again.
use super::terms::{is_effect_free, is_stable};
use crate::typescript::rules::logic_terms::estree::{text_of, to_term};
use crate::typescript::rules::logic_terms::{key, Term};
use crate::typescript::rules::support::view::Node;

const REASSOCIATED: [&str; 12] = ["+", "-", "*", "/", "%", "&", "|", "^", "**", "<<", ">>", ">>>"];
const COMMUTATIVE: [&str; 8] = ["+", "*", "&", "|", "^", "&&", "||", "??"];
const LOGICAL: [&str; 3] = ["&&", "||", "??"];
const PLAIN: [&str; 3] = ["Identifier", "MemberExpression", "ThisExpression"];

fn is_zero(term: &Term) -> bool {
    term.is_literal("0") || term.is_literal("0n")
}

fn is_constant(term: &Term) -> bool {
    let inner = if term.kind == "unary" { term.children.first() } else { Some(term) };
    inner.is_some_and(|inner| inner.kind == "literal")
}

/// The erased operand as the message shows it, and the operator.
pub fn erasing(node: Node, source: &str) -> Option<(String, String)> {
    let operator = node.text("operator").filter(|operator| matches!(operator.as_ref(), "*" | "&"))?;
    let sides: Vec<(Node, Term)> = [node.node("left"), node.node("right")].into_iter().flatten().map(|side| (side, to_term(side, source))).collect();
    let erased = sides.iter().any(|(_, term)| is_zero(term));
    let (side, term) = sides.iter().find(|(_, term)| !is_zero(term))?;
    if !erased || is_constant(term) || !is_effect_free(term) {
        return None;
    }
    let text = text_of(source, *side);
    let shown = if PLAIN.contains(&side.kind()) { text.to_string() } else { format!("({text})") };
    Some((shown, operator.into_owned()))
}

fn is_chain_of(node: Node, operator: &str) -> bool {
    let kind = if LOGICAL.contains(&operator) { "LogicalExpression" } else { "BinaryExpression" };
    node.is(kind) && node.text("operator").as_deref() == Some(operator)
}

fn chain_operands<'v>(right: Node<'v>, operator: &str) -> Vec<Node<'v>> {
    let lefts: Vec<Node> = std::iter::successors(Some(right), |node| if is_chain_of(*node, operator) { node.node("left") } else { None }).collect();
    let leftmost = lefts.last().copied().unwrap_or(right);
    if !COMMUTATIVE.contains(&operator) {
        return vec![leftmost];
    }
    let rights = lefts.iter().filter(|node| is_chain_of(**node, operator)).filter_map(|node| node.node("right"));
    std::iter::once(leftmost).chain(rights).collect()
}

/// The assignment's target as written, and the operator it repeats.
pub fn misrefactored(node: Node, source: &str) -> Option<(String, String)> {
    let assignment = node.text("operator")?;
    let operator = assignment.get(..assignment.len().saturating_sub(1)).unwrap_or_default();
    let is_compound = REASSOCIATED.contains(&operator) || LOGICAL.contains(&operator);
    let (target, right) = (node.node("left")?, node.node("right")?);
    if !(is_compound && is_chain_of(right, operator)) {
        return None;
    }
    let target_term = to_term(target, source);
    if !is_stable(&target_term) {
        return None;
    }
    let target_key = key(&target_term);
    chain_operands(right, operator)
        .into_iter()
        .any(|side| key(&to_term(side, source)) == target_key)
        .then(|| (text_of(source, target).to_string(), operator.to_string()))
}
