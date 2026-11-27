//! `filter-values.mts`: the first part of a filter value, in source order, that is a name or member no escape call,
//! escaping `replace` or escaped-looking name has gone through.
use crate::typescript::rules::patterns::syntax::operands_of;
use crate::typescript::rules::security_values::{resolve_constant, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::wildcards::chains::{is_escape_call, is_escaping_call, replace_receiver, text_receiver_of};
use regex::Regex;
use std::sync::LazyLock;

static ESCAPED_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)escap|quot|sanitiz").expect("pattern"));
const TEXT_PRESERVING: [&str; 7] = ["trim", "trimStart", "trimEnd", "toLowerCase", "toUpperCase", "toString", "normalize"];
const MAX_DEPTH: usize = 6;

struct Step<'v> {
    node: Node<'v>,
    depth: usize,
    path: Vec<usize>,
}

fn parts(node: Node) -> Vec<Node> {
    match node.kind() {
        "TemplateLiteral" => node.nodes("expressions"),
        "BinaryExpression" if node.text("operator").as_deref() == Some("+") => operands_of(node, "+"),
        "ConditionalExpression" => node.node("consequent").into_iter().chain(node.node("alternate")).collect(),
        _ => Vec::new(),
    }
}

fn is_escaped(target: Node) -> bool {
    let named = target.is("Identifier") && target.name().is_some_and(|name| ESCAPED_NAME.is_match(&name));
    is_escape_call(target) || replace_receiver(target).is_some_and(is_escaping_call) || named
}

fn text_receiver(node: Node) -> Option<Node> {
    if node.is("CallExpression") { text_receiver_of(node, &TEXT_PRESERVING) } else { None }
}

fn child<'v>(step: &Step, node: Node<'v>, index: usize, depth: usize) -> Step<'v> {
    let mut path = step.path.clone();
    path.push(index);
    Step { node, depth, path }
}

fn expand<'v>(scopes: &Scopes<'_, 'v>, step: &Step<'v>) -> (Option<Node<'v>>, Vec<Step<'v>>) {
    let target = unwrapped(step.node);
    let inner = parts(target);
    if !inner.is_empty() {
        return (None, inner.into_iter().enumerate().map(|(index, part)| child(step, part, index, step.depth)).collect());
    }
    if is_escaped(target) {
        return (None, Vec::new());
    }
    if let Some(receiver) = text_receiver(target) {
        return (None, vec![child(step, receiver, 0, step.depth)]);
    }
    let resolved = if target.is("Identifier") && step.depth < MAX_DEPTH { resolve_constant(scopes, Some(target)) } else { None };
    if let Some(resolved) = resolved.filter(|resolved| *resolved != target) {
        return (None, vec![child(step, resolved, 0, step.depth + 1)]);
    }
    let leaf = target.is("Identifier") || target.is("MemberExpression");
    (leaf.then_some(target), Vec::new())
}

fn earlier(left: &[usize], right: &[usize]) -> bool {
    for (index, value) in left.iter().enumerate() {
        let other = right.get(index).copied().unwrap_or(0);
        if *value != other {
            return *value < other;
        }
    }
    false
}

/// `unescapedLeaf`.
pub fn unescaped_leaf<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>) -> Option<Node<'v>> {
    let mut pending = vec![Step { node, depth: 0, path: Vec::new() }];
    let mut best: Option<(Node, Vec<usize>)> = None;
    let mut index = 0;
    while index < pending.len() {
        let (leaf, next) = expand(scopes, &pending[index]);
        if let Some(leaf) = leaf {
            let path = pending[index].path.clone();
            if best.as_ref().is_none_or(|(_, known)| earlier(&path, known)) {
                best = Some((leaf, path));
            }
        }
        pending.extend(next);
        index += 1;
    }
    best.map(|(leaf, _)| leaf)
}
