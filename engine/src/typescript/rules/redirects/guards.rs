//! The slash checks of `no-slash-only-redirect-guard`: a target tested with `startsWith('/')`, a bare `^/` regular
//! expression, or a first character compared with `'/'`, and the calls that redirect to a target.
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::{last_name_of, string_value};
use regex::Regex;
use std::sync::LazyLock;

const NULLISH_WRAPPERS: [&str; 3] = ["ChainExpression", "TSNonNullExpression", "TSAsExpression"];
const BARE_SLASH_PATTERNS: [&str; 7] = [r"^\/", r"^\/.*", r"^\/.+", r"^\/\S*", r"^\/\S+", r"^\/.*$", r"^\/\S*$"];
const REDIRECT_CALLS: [&str; 4] = ["redirect", "permanentRedirect", "navigate", "redirectTo"];
const ROUTER_METHODS: [&str; 3] = ["push", "replace", "assign"];
static ROUTER_OWNER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)router|history|navigat|location").expect("pattern"));

fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn is_slash(node: Option<Node>) -> bool {
    string_value(node).as_deref() == Some("/")
}

fn regex_pattern(node: Node) -> Option<String> {
    let Value::Node(at) = node.get("regex") else { return None };
    node.is("Literal").then(|| node.view.at(at).text("pattern").map(|pattern| pattern.into_owned())).flatten()
}

fn tested_target(value: Node) -> Option<Node> {
    let callee = value.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    let method = name_of(callee.node("property"));
    let first = value.list("arguments").first().copied().flatten();
    if method.as_deref() == Some("startsWith") && is_slash(first) {
        return callee.node("object");
    }
    let pattern = callee.node("object").and_then(regex_pattern);
    let bare = pattern.is_some_and(|pattern| BARE_SLASH_PATTERNS.contains(&pattern.as_str()));
    if method.as_deref() == Some("test") && bare { first } else { None }
}

fn slash_operand(value: Node) -> Option<Node> {
    if is_slash(value.node("right")) {
        return value.node("left");
    }
    if is_slash(value.node("left")) { value.node("right") } else { None }
}

fn compared_target(value: Node) -> Option<Node> {
    let inner = unwrap(slash_operand(value)?, &NULLISH_WRAPPERS);
    if inner.is("MemberExpression") && inner.flag("computed") {
        let property = inner.node("property");
        return (string_value(property).is_none() && name_of(property).is_none()).then(|| inner.node("object")).flatten();
    }
    let callee = inner.node("callee").filter(|callee| inner.is("CallExpression") && callee.is("MemberExpression"))?;
    (name_of(callee.node("property")).as_deref() == Some("charAt")).then(|| callee.node("object")).flatten()
}

/// `slashGuardTarget`: the value a part of a condition checks for a leading slash.
pub fn slash_guard_target(node: Node) -> Option<Node> {
    let value = unwrap(node, &NULLISH_WRAPPERS);
    if value.is("CallExpression") {
        return tested_target(value);
    }
    let equality = matches!(value.text("operator").as_deref(), Some("===" | "=="));
    if value.is("BinaryExpression") && equality { compared_target(value) } else { None }
}

/// `isSink`: a call that redirects or navigates to its arguments.
pub fn is_sink(node: Node) -> bool {
    let Some(callee) = node.node("callee") else { return false };
    if callee.is("Identifier") {
        return name_of(Some(callee)).is_some_and(|name| REDIRECT_CALLS.contains(&name.as_str()));
    }
    if !callee.is("MemberExpression") || callee.flag("computed") {
        return false;
    }
    let method = name_of(callee.node("property")).unwrap_or_default();
    let owner = callee.node("object").and_then(last_name_of).unwrap_or_default();
    REDIRECT_CALLS.contains(&method.as_str()) || (ROUTER_METHODS.contains(&method.as_str()) && ROUTER_OWNER.is_match(&owner))
}
