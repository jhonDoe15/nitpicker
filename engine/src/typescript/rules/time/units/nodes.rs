//! `unit-nodes.mts`: wrappers, property names and the dotted text of a callee.
use super::names::is_js_space;
use crate::typescript::rules::support::view::Node;
use std::borrow::Cow;

const WRAPPERS: [&str; 5] =
    ["TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion", "TSNonNullExpression", "ChainExpression"];
const MAX_TEXT: usize = 40;
const ELLIPSIS: &str = "...";

pub fn unwrap(mut node: Node) -> Node {
    while WRAPPERS.contains(&node.kind()) {
        let Some(inner) = node.node("expression") else { break };
        node = inner;
    }
    node
}

/// `typeof node.value === 'string'` on a `Literal`.
pub fn string_literal<'v>(node: Node<'v>) -> Option<Cow<'v, str>> {
    if node.is("Literal") && !node.has("bigint") && !node.has("regex") { node.text("value") } else { None }
}

pub fn property_name<'v>(node: Node<'v>) -> Option<Cow<'v, str>> {
    if !node.is("MemberExpression") {
        return None;
    }
    let property = node.node("property")?;
    if !node.flag("computed") && property.is("Identifier") {
        return property.name();
    }
    string_literal(property)
}

pub fn callee_text(callee: Node) -> Option<String> {
    let mut names = Vec::new();
    let mut link = Some(unwrap(callee));
    while let Some(current) = link {
        if current.is("Identifier") {
            names.extend(current.name());
        } else {
            names.extend(property_name(current));
        }
        let named_member = current.is("MemberExpression") && property_name(current).is_some();
        link = if named_member { current.node("object").map(unwrap) } else { None };
    }
    if names.is_empty() {
        return None;
    }
    names.reverse();
    Some(names.join("."))
}

/// The source of a node with its white space collapsed, cut to 40 UTF-16 units.
pub fn shown(source: &str, node: Node) -> String {
    let raw = &source[node.start() as usize..node.end() as usize];
    let mut collapsed = String::with_capacity(raw.len());
    let mut in_space = false;
    for c in raw.chars() {
        if is_js_space(c) {
            if !in_space {
                collapsed.push(' ');
            }
            in_space = true;
        } else {
            collapsed.push(c);
            in_space = false;
        }
    }
    if collapsed.encode_utf16().count() <= MAX_TEXT {
        return collapsed;
    }
    let mut kept = String::new();
    let mut units = 0;
    for c in collapsed.chars() {
        units += c.len_utf16();
        if units > MAX_TEXT - ELLIPSIS.len() {
            break;
        }
        kept.push(c);
    }
    kept.push_str(ELLIPSIS);
    kept
}
