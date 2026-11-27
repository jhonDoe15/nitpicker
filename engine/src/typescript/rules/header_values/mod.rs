//! `no-non-latin1-header-value`: a header value built from a path, a user name, request data or serialized data,
//! which throws for a character above U+00FF. Without types every value counts as possibly such text.
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::{member_name, static_key, unwrapped};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-non-latin1-header-value";
const MESSAGE: &str = "Header values throw for a character above U+00FF, so a file path, route, user name or JSON with non-English text fails. Encode the value (`encodeURIComponent`, `encodeURI` or base64) and decode it on the other side.";
const SET_METHODS: [&str; 5] = ["setHeader", "header", "set", "append", "appendHeader"];
const RISKY_NAMES: [&str; 12] = ["path", "pathname", "filepath", "filename", "relative", "relativepath", "route", "routepath", "username", "displayname", "fullname", "originalname"];
const REQUEST_ROOTS: [&str; 2] = ["req", "request"];
const REQUEST_PARTS: [&str; 4] = ["params", "query", "body", "cookies"];
const PATH_FUNCTIONS: [&str; 5] = ["relative", "resolve", "join", "dirname", "basename"];
const BRANCHES: [&str; 2] = ["ConditionalExpression", "LogicalExpression"];

static RECEIVER: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)^(?:res|resp|response|reply|rep)$").expect("receiver"));
static HEADERS_RECEIVER: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)headers?$").expect("headers"));
static DATA_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)^(?:data|payload|serialized|json|state)$").expect("data name"));
static DATA_HEADER: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)data|payload|path|state|file").expect("data header"));

/// `plainName`: `calleeNameOf` of the unwrapped node.
fn plain_name(node: Node) -> Option<String> {
    let target = unwrapped(node);
    if target.is("Identifier") {
        return target.name().map(|name| name.into_owned());
    }
    (target.is("MemberExpression") && !target.flag("computed")).then(|| target.node("property").and_then(|property| property.name()).map(|name| name.into_owned())).flatten()
}

fn is_request_data(node: Node) -> bool {
    let mut chain = vec![unwrapped(node)];
    while let Some(object) = chain.last().filter(|last| last.is("MemberExpression")).and_then(|last| last.node("object")) {
        chain.push(unwrapped(object));
    }
    let root = chain.last().filter(|root| root.is("Identifier")).and_then(|root| root.name());
    if !chain[0].is("MemberExpression") || !root.is_some_and(|root| REQUEST_ROOTS.contains(&root.as_ref())) {
        return false;
    }
    chain.iter().any(|current| current.is("MemberExpression") && member_name(*current).is_some_and(|name| REQUEST_PARTS.contains(&name.as_str())))
}

fn is_call_of(call: Node, owner: &str, names: &[&str]) -> bool {
    let Some(callee) = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { return false };
    let owned = callee.node("object").is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some(owner));
    owned && member_name(callee).is_some_and(|name| names.contains(&name.as_str()))
}

fn risky_operands(plain: Node) -> Vec<Node> {
    match plain.kind() {
        "TemplateLiteral" => plain.nodes("expressions"),
        "BinaryExpression" if plain.text("operator").as_deref() == Some("+") => plain.node("left").into_iter().chain(plain.node("right")).collect(),
        "ConditionalExpression" => plain.node("consequent").into_iter().chain(plain.node("alternate")).collect(),
        "LogicalExpression" => plain.node("left").into_iter().chain(plain.node("right")).collect(),
        _ => Vec::new(),
    }
}

fn is_risky_leaf(plain: Node, header: &str) -> bool {
    if plain.is("CallExpression") {
        return is_call_of(plain, "JSON", &["stringify"]) || is_call_of(plain, "path", &PATH_FUNCTIONS);
    }
    if !plain.is("Identifier") && !plain.is("MemberExpression") {
        return false;
    }
    let name = plain_name(plain).unwrap_or_default();
    RISKY_NAMES.contains(&name.to_lowercase().as_str()) || is_request_data(plain) || (DATA_HEADER.is_match(header) && DATA_NAME.is_match(&name))
}

fn is_risky_text(node: Node, header: &str) -> bool {
    let mut pending = vec![node];
    let mut at = 0;
    while at < pending.len() {
        let plain = unwrapped(pending[at]);
        at += 1;
        pending.extend(risky_operands(plain));
        if is_risky_leaf(plain, header) {
            return true;
        }
    }
    false
}

fn header_values(call: Node) -> Vec<Node> {
    let Some(callee) = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { return Vec::new() };
    let method = member_name(callee).unwrap_or_default();
    let receiver = callee.node("object").and_then(plain_name).unwrap_or_default();
    let Some(second) = call.list("arguments").get(1).copied().flatten().filter(|_| SET_METHODS.contains(&method.as_str())) else { return Vec::new() };
    let sets = method == "setHeader" || method == "appendHeader";
    if sets || RECEIVER.is_match(&receiver) || HEADERS_RECEIVER.is_match(&receiver) { vec![second] } else { Vec::new() }
}

fn object_values(object: Node) -> Vec<Node> {
    object.nodes("properties").into_iter().filter(|property| property.is("Property")).filter_map(|property| property.node("value")).collect()
}

fn header_name(value: Node) -> String {
    let Some(parent) = value.parent() else { return String::new() };
    if parent.is("Property") {
        return static_key(parent).unwrap_or_default();
    }
    let name = if parent.is("CallExpression") { parent.list("arguments").first().copied().flatten() } else { None };
    string_value(name).unwrap_or_default()
}

fn is_request_options(node: Node) -> bool {
    let mut current = node;
    while let Some(parent) = current.parent().filter(|parent| BRANCHES.contains(&parent.kind())) {
        current = parent;
    }
    current.parent().is_some_and(|call| call.is("NewExpression") || (call.is("CallExpression") && call.nodes("arguments").contains(&current)))
}

fn is_headers_property(property: Node) -> bool {
    let value = property.node("value");
    let parent = property.parent().filter(|parent| parent.is("ObjectExpression"));
    static_key(property).as_deref() == Some("headers") && value.is_some_and(|value| value.is("ObjectExpression")) && parent.is_some_and(is_request_options)
}

fn written_headers(node: Node) -> Vec<Node> {
    let Some(callee) = node.node("callee").map(unwrapped) else { return Vec::new() };
    let named = if node.is("NewExpression") {
        callee.is("Identifier") && callee.name().as_deref() == Some("Headers")
    } else {
        callee.is("MemberExpression") && member_name(callee).as_deref() == Some("writeHead")
    };
    if !named {
        return Vec::new();
    }
    node.nodes("arguments").into_iter().filter(|argument| argument.is("ObjectExpression")).flat_map(object_values).collect()
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut found = Vec::new();
    for node in view.nodes() {
        let values = match node.kind() {
            "CallExpression" => header_values(node).into_iter().chain(written_headers(node)).collect(),
            "NewExpression" => written_headers(node),
            "Property" if is_headers_property(node) => node.node("value").map(object_values).unwrap_or_default(),
            _ => Vec::new(),
        };
        found.extend(values.into_iter().filter(|value| is_risky_text(*value, &header_name(*value))));
    }
    for value in found {
        context.report_range(RULE, value.start(), Some(value.end()), MESSAGE.to_string());
    }
}
