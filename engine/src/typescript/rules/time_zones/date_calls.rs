//! `date-calls.mts`: local-time methods of `Date`, `Intl.DateTimeFormat` without a zone, `new Date(...)` and
//! `Date.parse(...)` on text that carries no offset.
use super::bindings::property_name;
use super::tables::{
    DATE_ONLY, LOCAL_DATE_METHODS, LOCAL_STRING_METHODS, LOCALE_METHODS, NAMED_ZONE, OFFSET_METHOD, TRAILING_TIME, WITH_OFFSET, is_js_space,
};
use super::{Env, Problem};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::testing_library::nodes::string_literal;
use std::collections::HashMap;

const TIME_ZONE: &str = "timeZone";

pub fn key_text(key: Node) -> String {
    if key.is("Identifier") {
        return key.name().map(|name| name.into_owned()).unwrap_or_default();
    }
    string_literal(Some(key)).unwrap_or_else(|| "\0".to_string())
}

/// `objectKeys`: the keys of an object literal and their values, unless it spreads or computes a key.
pub fn object_keys(node: Option<Node>) -> Option<HashMap<String, Node>> {
    let node = node.filter(|node| node.is("ObjectExpression"))?;
    let mut keys = HashMap::new();
    for property in node.nodes("properties") {
        if !property.is("Property") || property.flag("computed") {
            return None;
        }
        keys.insert(key_text(property.node("key")?), property.node("value")?);
    }
    Some(keys)
}

pub fn is_global(env: &Env, identifier: Node, name: &str) -> bool {
    identifier.is("Identifier") && identifier.name().as_deref() == Some(name) && !env.has_variable(identifier)
}

fn lacks_time_zone(options: Option<Node>) -> bool {
    options.is_none() || object_keys(options).is_some_and(|keys| !keys.contains_key(TIME_ZONE))
}

fn date_method_report(name: &str, call: Node) -> Option<Problem> {
    if let Some((_, utc)) = LOCAL_DATE_METHODS.iter().find(|(local, _)| *local == name) {
        return Some(Problem::LocalDateMethod(name.to_string(), utc));
    }
    if name == OFFSET_METHOD {
        return Some(Problem::LocalOffset(name.to_string()));
    }
    let arguments = call.nodes("arguments");
    if LOCAL_STRING_METHODS.contains(&name) {
        return arguments.is_empty().then(|| Problem::LocalString(name.to_string()));
    }
    (LOCALE_METHODS.contains(&name) && lacks_time_zone(arguments.get(1).copied())).then(|| Problem::LocaleWithoutZone(name.to_string()))
}

pub fn date_method_problem(env: &Env, call: Node) -> Option<Problem> {
    let callee = call.node("callee")?;
    let name = property_name(callee)?;
    if callee.node("object")?.is("Super") {
        return None;
    }
    let report = date_method_report(&name, call)?;
    let property = callee.node("property")?;
    env.types.borrow_mut().is_library_date_member(property.start(), property.end()).then_some(report)
}

fn is_intl_formatter(env: &Env, callee: Node) -> bool {
    callee.is("MemberExpression")
        && property_name(callee).as_deref() == Some("DateTimeFormat")
        && callee.node("object").is_some_and(|object| is_global(env, object, "Intl"))
}

fn reads_zone_key(pattern: Node) -> bool {
    pattern.is("ObjectPattern")
        && pattern.nodes("properties").iter().any(|property| {
            property.is("Property") && !property.flag("computed") && property.node("key").is_some_and(|key| key_text(key) == TIME_ZONE)
        })
}

/// `resolvedOptionsRead`: `None` when the formatter's resolved options are not read, `Some` of the name read
/// from them otherwise (empty when it cannot be told).
fn resolved_options_read(call: Node) -> Option<Option<String>> {
    let member = call.parent()?;
    let is_member = member.is("MemberExpression") && member.node("object") == Some(call) && property_name(member).as_deref() == Some("resolvedOptions");
    let outer = member.parent().filter(|outer| is_member && outer.is("CallExpression") && outer.node("callee") == Some(member))?;
    let read = outer.parent()?;
    if read.is("VariableDeclarator") && read.node("init") == Some(outer) {
        let reads = read.node("id").is_some_and(reads_zone_key);
        return Some(Some(if reads { TIME_ZONE.to_string() } else { String::new() }));
    }
    if read.is("MemberExpression") && read.node("object") == Some(outer) {
        return Some(property_name(read));
    }
    Some(Some(String::new()))
}

pub fn intl_problem(env: &Env, call: Node) -> Option<Problem> {
    let callee = call.node("callee")?;
    if !(is_intl_formatter(env, callee) && lacks_time_zone(call.nodes("arguments").get(1).copied())) {
        return None;
    }
    match resolved_options_read(call) {
        None | Some(None) => Some(Problem::IntlWithoutZone),
        Some(Some(read)) => (read == TIME_ZONE).then_some(Problem::ServerZoneName),
    }
}

fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_space)
}

fn cooked_last(template: Node) -> String {
    let quasis = template.nodes("quasis");
    match quasis.last().map(|quasi| quasi.get("value")) {
        Some(Value::Node(index)) => template.view.at(index).text("cooked").map(|text| text.into_owned()).unwrap_or_default(),
        _ => String::new(),
    }
}

fn static_text(node: Option<Node>) -> Option<(String, bool)> {
    let node = node?;
    if node.is("Literal") {
        return string_literal(Some(node)).map(|text| (js_trim(&text).to_string(), true));
    }
    if node.is("TemplateLiteral") {
        let last = cooked_last(node);
        let complete = node.nodes("expressions").is_empty();
        return Some((if complete { js_trim(&last).to_string() } else { last }, complete));
    }
    None
}

fn is_local_date_time_text(node: Option<Node>) -> bool {
    let Some((text, complete)) = static_text(node) else { return false };
    if !complete {
        return TRAILING_TIME.is_match(&text);
    }
    !text.is_empty() && !DATE_ONLY.is_match(&text) && !WITH_OFFSET.is_match(&text) && !NAMED_ZONE.is_match(&text)
}

pub fn constructor_problem(env: &Env, node: Node) -> Option<Problem> {
    if !is_global(env, node.node("callee")?, "Date") {
        return None;
    }
    let arguments = node.nodes("arguments");
    if arguments.len() >= 2 {
        return Some(Problem::LocalConstructor);
    }
    is_local_date_time_text(arguments.first().copied()).then_some(Problem::LocalParse)
}

pub fn parse_problem(env: &Env, call: Node) -> Option<Problem> {
    let callee = call.node("callee")?;
    let parses = callee.is("MemberExpression")
        && property_name(callee).as_deref() == Some("parse")
        && callee.node("object").is_some_and(|object| is_global(env, object, "Date"));
    (parses && is_local_date_time_text(call.nodes("arguments").first().copied())).then_some(Problem::LocalParse)
}
