//! `secret-operands.mts`: the names and properties in a value given to a log call that name a secret.
use super::nodes::{env_key, member_name, unwrapped};
use super::words::is_secret_name;
use crate::typescript::rules::escaping::is_valid_regex;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::string_value;
use crate::typescript::rules::writes::syntax::js_number;
use regex::Regex;
use std::sync::LazyLock;

static STATE_PREFIX: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:has|is)[A-Z_]").expect("pattern"));
static SCREAMING_CASE: LazyLock<Regex> = LazyLock::new(|| Regex::new("^[A-Z][A-Z0-9_]*$").expect("pattern"));
const NOT_SECRET_OWNERS: [&str; 2] = ["tokenizer", "tokenizers"];
const TEXT_CALLS: [&str; 2] = ["String", "JSON.stringify"];
const PLAIN_VALUES: [&str; 3] = ["Identifier", "MemberExpression", "TemplateLiteral"];

fn names_a_secret(name: Option<&str>) -> bool {
    name.is_some_and(|name| !STATE_PREFIX.is_match(name) && !SCREAMING_CASE.is_match(name) && is_secret_name(name))
}

fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn owner_name(member: Node) -> Option<String> {
    let object = unwrapped(member.node("object")?);
    if object.is("Identifier") { name(Some(object)).map(|name| name.to_lowercase()) } else { None }
}

/// `String(key.value)` of a literal key.
fn literal_text(key: Node) -> Option<String> {
    if !key.is("Literal") {
        return None;
    }
    if let Value::Node(at) = key.get("regex") {
        let regex = key.view.at(at);
        let (pattern, flags) = (regex.text("pattern")?, regex.text("flags")?);
        return Some(if is_valid_regex(&pattern, &flags) { format!("/{pattern}/{flags}") } else { "null".to_string() });
    }
    if key.get("bigint") != Value::Null {
        return key.text("bigint").map(|text| text.into_owned());
    }
    match key.get("value") {
        Value::Text(..) => string_value(Some(key)),
        Value::Number(number) => Some(js_number(number)),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => Some("null".to_string()),
    }
}

fn property_key_name(property: Node) -> Option<String> {
    let key = property.node("key")?;
    if property.flag("computed") {
        return literal_text(key);
    }
    if key.is("Identifier") { name(Some(key)) } else { literal_text(key) }
}

fn is_plain_value(value: Node) -> bool {
    let inner = unwrapped(value);
    PLAIN_VALUES.contains(&inner.kind()) && !(inner.is("Identifier") && inner.name().as_deref() == Some("undefined"))
}

fn named_property(property: Node) -> bool {
    names_a_secret(property_key_name(property).as_deref()) && property.node("value").is_some_and(is_plain_value)
}

fn call_target(call: Node) -> Option<Node> {
    let callee = unwrapped(call.node("callee")?);
    let member = callee.is("MemberExpression");
    let object = if member { callee.node("object").map(unwrapped) } else { None };
    let method = if member { member_name(callee) } else { None };
    let qualified = match (object.filter(|object| object.is("Identifier")), &method) {
        (Some(object), Some(method)) => Some(format!("{}.{method}", name(Some(object)).unwrap_or_default())),
        _ if callee.is("Identifier") => name(Some(callee)),
        _ => None,
    };
    let arguments = call.nodes("arguments");
    if qualified.is_some_and(|qualified| TEXT_CALLS.contains(&qualified.as_str())) && !arguments.is_empty() {
        return arguments.first().copied();
    }
    if member && method.as_deref() == Some("toString") { callee.node("object") } else { None }
}

fn operand_children(inner: Node) -> Vec<Node> {
    let operator = inner.text("operator");
    let left = inner.node("left");
    let right = inner.node("right");
    match inner.kind() {
        "TemplateLiteral" => inner.nodes("expressions"),
        "BinaryExpression" if operator.as_deref() == Some("+") => left.into_iter().chain(right).collect(),
        "LogicalExpression" if operator.as_deref() == Some("&&") => right.into_iter().collect(),
        "LogicalExpression" => left.into_iter().chain(right).collect(),
        "ConditionalExpression" => inner.node("consequent").into_iter().chain(inner.node("alternate")).collect(),
        "ArrayExpression" => inner.nodes("elements"),
        "CallExpression" => call_target(inner).into_iter().collect(),
        _ => Vec::new(),
    }
}

fn member_operand(member: Node) -> bool {
    let secret = match env_key(member) {
        None => names_a_secret(member_name(member).as_deref()),
        Some(key) => is_secret_name(&key) && !STATE_PREFIX.is_match(&key),
    };
    secret && !owner_name(member).is_some_and(|owner| NOT_SECRET_OWNERS.contains(&owner.as_str()))
}

/// `secretOperands`: the identifiers, members and object properties that name a secret, in source order.
pub fn secret_operands(node: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut pending = vec![(node, false)];
    while let Some((item, kept)) = pending.pop() {
        if kept {
            found.push(item);
            continue;
        }
        let inner = unwrapped(item);
        match inner.kind() {
            "Identifier" if names_a_secret(inner.name().as_deref()) => found.push(inner),
            "Identifier" => {}
            "MemberExpression" if member_operand(inner) => found.push(inner),
            "MemberExpression" => {}
            "ObjectExpression" => {
                let properties = inner.nodes("properties").into_iter().filter(|property| !property.is("SpreadElement"));
                let entries: Vec<(Node, bool)> = properties
                    .filter_map(|property| if named_property(property) { Some((property, true)) } else { property.node("value").map(|value| (value, false)) })
                    .collect();
                pending.extend(entries.into_iter().rev());
            }
            _ => pending.extend(operand_children(inner).into_iter().rev().map(|child| (child, false))),
        }
    }
    found
}
