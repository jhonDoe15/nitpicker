//! `input-dependence.mts`: whether a value can come from a caller, followed through local variables, loop
//! sources and the receivers of callbacks.
use super::syntax::string_value;
use crate::typescript::rules::support::scope::{DefKind, ScopeKind, Scopes};
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const MAX_DEPTH: usize = 8;

static ESCAPE_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)escape").expect("pattern"));
static PATTERN_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)reg|pattern").expect("pattern"));

#[derive(Default)]
struct Next<'v> {
    input: bool,
    value: Option<Node<'v>>,
}

fn is_named_escape(node: Node) -> bool {
    if !(node.is("Identifier") || node.is("PrivateIdentifier")) {
        return false;
    }
    node.name().is_some_and(|name| ESCAPE_NAME.is_match(&name) && PATTERN_NAME.is_match(&name))
}

fn is_regexp_escape(node: Node) -> bool {
    node.is("MemberExpression")
        && node.node("object").is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("RegExp"))
        && node.node("property").and_then(|property| property.name()).as_deref() == Some("escape")
}

fn is_inline_escape(node: Node) -> bool {
    if !node.is("CallExpression") {
        return false;
    }
    let Some(callee) = node.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    let method = callee.node("property").and_then(|property| property.name());
    matches!(method.as_deref(), Some("replace" | "replaceAll"))
        && string_value(node.nodes("arguments").get(1).copied()).as_deref() == Some("\\$&")
}

fn is_escape(node: Node) -> bool {
    is_named_escape(node) || is_regexp_escape(node) || is_inline_escape(node)
}

fn value_children(node: Node) -> Vec<Node> {
    if node.is("ConditionalExpression") {
        return node.node("consequent").into_iter().chain(node.node("alternate")).collect();
    }
    node.children()
}

fn is_name_only(parent: Option<Node>, node: Node) -> bool {
    let Some(parent) = parent else { return false };
    let plain = !parent.flag("computed");
    (parent.is("MemberExpression") && parent.node("property") == Some(node) && plain)
        || (parent.is("Property") && parent.node("key") == Some(node) && plain)
}

fn referenced_identifiers(root: Node) -> Option<Vec<Node>> {
    let mut pending = vec![(root, None)];
    let mut identifiers = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        let (node, parent) = pending[index];
        index += 1;
        if is_escape(node) {
            return None;
        }
        if node.is("Identifier") && !is_name_only(parent, node) {
            identifiers.push(node);
        }
        pending.extend(value_children(node).into_iter().map(|child| (child, Some(node))));
    }
    Some(identifiers)
}

fn callback_receiver(function: Node) -> Option<Node> {
    let call = function.parent().filter(|call| call.is("CallExpression"))?;
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    call.nodes("arguments").contains(&function).then(|| callee.node("object")).flatten()
}

fn bound_value(definition: Node) -> Option<Node> {
    if let Some(init) = definition.node("init") {
        return Some(init);
    }
    let holder = definition.parent()?.parent()?;
    (holder.is("ForOfStatement") || holder.is("ForInStatement")).then(|| holder.node("right")).flatten()
}

fn next_value<'v>(scopes: &Scopes<'_, 'v>, identifier: Node<'v>) -> Next<'v> {
    let Some(symbol) = scopes.variable_named(identifier) else { return Next::default() };
    let definitions = scopes.defs(symbol);
    let [definition] = definitions.as_slice() else { return Next::default() };
    if definition.kind == DefKind::Parameter {
        return match callback_receiver(definition.node) {
            Some(receiver) => Next { input: false, value: Some(receiver) },
            None => Next { input: true, value: None },
        };
    }
    let module_level = scopes.scope_of(symbol).is_some_and(|(kind, _)| matches!(kind, ScopeKind::Module | ScopeKind::Global));
    if definition.kind != DefKind::Variable || module_level {
        return Next::default();
    }
    Next { input: false, value: bound_value(definition.node) }
}

pub fn depends_on_input<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>) -> bool {
    let mut pending = vec![(node, 0)];
    let mut index = 0;
    while index < pending.len() {
        let (current, depth) = pending[index];
        index += 1;
        let identifiers = if depth > MAX_DEPTH { None } else { referenced_identifiers(current) };
        let next: Vec<Next> = identifiers.unwrap_or_default().into_iter().map(|identifier| next_value(scopes, identifier)).collect();
        if next.iter().any(|next| next.input) {
            return true;
        }
        pending.extend(next.into_iter().filter_map(|next| next.value).map(|value| (value, depth + 1)));
    }
    false
}
