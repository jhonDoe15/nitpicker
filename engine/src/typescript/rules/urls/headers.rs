//! `no-case-mixed-header-merge`: a literal header name next to a caller's headers spread into the same plain object,
//! where the caller's key in another case is kept beside it.
use super::relative::NULLISH_WRAPPERS;
use super::values::{last_name_of, string_value};
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::resolve_constant;
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-case-mixed-header-merge";
const MESSAGE: &str = "Object keys are case-sensitive but header names are not: a caller header spread next to a literal header name in another case is sent twice and the override does not happen. Merge with `new Headers(headers)` and `merged.set(name, value)`, or lowercase every key first.";
const HEADER_NAMES: [&str; 17] = [
    "content-type",
    "authorization",
    "accept",
    "user-agent",
    "content-length",
    "accept-language",
    "accept-encoding",
    "cache-control",
    "cookie",
    "origin",
    "referer",
    "host",
    "x-api-key",
    "x-requested-with",
    "x-csrf-token",
    "if-none-match",
    "range",
];
static HEADER_VALUE_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)headers$").expect("pattern"));
static INCOMING_MESSAGE_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:req|request|incoming)$").expect("pattern"));

fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn property_key(property: Node) -> Option<String> {
    let key = property.node("key")?;
    if !property.flag("computed") && key.is("Identifier") {
        return name(Some(key));
    }
    string_value(Some(key))
}

fn is_headers_target(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    match parent.kind() {
        "Property" => !parent.flag("computed") && name(parent.node("key")).as_deref() == Some("headers") && parent.node("value") == Some(node),
        "VariableDeclarator" => {
            HEADER_VALUE_NAME.is_match(&name(parent.node("id")).unwrap_or_default()) && parent.node("init") == Some(node)
        }
        "AssignmentExpression" => {
            parent.node("right") == Some(node) && HEADER_VALUE_NAME.is_match(&parent.node("left").and_then(last_name_of).unwrap_or_default())
        }
        _ => false,
    }
}

fn is_caller_headers(scopes: &Scopes, spread: Node) -> bool {
    let Some(argument) = spread.node("argument") else { return false };
    let value = unwrap(argument, NULLISH_WRAPPERS);
    if !HEADER_VALUE_NAME.is_match(&last_name_of(value).unwrap_or_default()) {
        return false;
    }
    resolve_constant(scopes, Some(value))
        .is_none_or(|resolved| !["ObjectExpression", "NewExpression", "CallExpression"].contains(&resolved.kind()))
}

fn is_lowercase_source(spread: Node) -> bool {
    let Some(value) = spread.node("argument").map(|argument| unwrap(argument, NULLISH_WRAPPERS)) else { return false };
    value.is("MemberExpression")
        && !value.flag("computed")
        && name(value.node("property")).as_deref() == Some("headers")
        && INCOMING_MESSAGE_NAME.is_match(&name(value.node("object").map(|object| unwrap(object, NULLISH_WRAPPERS))).unwrap_or_default())
}

fn is_mixable(scopes: &Scopes, spread: Node, key: &str) -> bool {
    is_caller_headers(scopes, spread) && (key != key.to_lowercase() || !is_lowercase_source(spread))
}

fn named<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Node<'s>> {
    let properties = node.nodes("properties");
    let spreads: Vec<Node> = properties.iter().copied().filter(|property| property.is("SpreadElement")).collect();
    properties.into_iter().find(|property| {
        let key = property_key(*property);
        property.is("Property")
            && HEADER_NAMES.contains(&key.as_deref().unwrap_or_default().to_lowercase().as_str())
            && spreads.iter().any(|spread| is_mixable(scopes, *spread, key.as_deref().unwrap_or_default()))
    })
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let found: Vec<Node> = view.nodes().filter(|node| node.is("ObjectExpression") && is_headers_target(*node)).filter_map(|node| named(scopes, node)).collect();
    for property in found {
        context.report_range(RULE, property.start(), Some(property.end()), MESSAGE.to_string());
    }
}
