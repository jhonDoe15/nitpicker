//! `operand-terms.mts`: the terms an operand slip compares, and whether a chain is read only for its truth.
use crate::typescript::rules::logic_terms::estree::to_term;
use crate::typescript::rules::logic_terms::normalize::normalize;
use crate::typescript::rules::logic_terms::purity::is_side_effect_free;
use crate::typescript::rules::logic_terms::{any_node, Term};
use crate::typescript::rules::support::view::Node;

const TESTED: [&str; 4] = ["IfStatement", "WhileStatement", "DoWhileStatement", "ForStatement"];
const TRANSPARENT: [&str; 4] = ["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion"];

/// Whether evaluating the term twice gives the same value: no writes and no impure calls.
pub fn is_effect_free(term: &Term) -> bool {
    is_side_effect_free(term, true)
}

pub fn is_stable(term: &Term) -> bool {
    is_effect_free(term) && any_node(term, &|node| node.kind == "name" || node.kind == "this")
}

pub fn normal_term(node: Node, source: &str, boolean_context: bool) -> Term {
    normalize(&to_term(node, source), boolean_context)
}

fn enclosing<'v>(node: Node<'v>) -> Option<Node<'v>> {
    let parent = node.parent()?;
    if TRANSPARENT.contains(&parent.kind()) {
        return Some(parent);
    }
    (parent.is("LogicalExpression") && parent.text("operator").as_deref() != Some("??")).then_some(parent)
}

pub fn in_boolean_context(node: Node) -> bool {
    let outer = std::iter::successors(Some(node), |current| enclosing(*current)).last().unwrap_or(node);
    let Some(parent) = outer.parent() else { return false };
    if TESTED.contains(&parent.kind()) || parent.is("ConditionalExpression") {
        return parent.node("test") == Some(outer);
    }
    parent.is("UnaryExpression") && parent.text("operator").as_deref() == Some("!")
}
