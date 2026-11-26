//! Which methods change the value they are called on, by the built-in type that declares them.
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::{Types, is_string_literal};
use regex::Regex;
use std::sync::LazyLock;

const ARRAY_MUTATORS: &[&str] = &["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"];
const TYPED_ARRAY_MUTATORS: &[&str] = &["set", "sort", "reverse", "fill", "copyWithin"];

static TYPED_ARRAY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("^(Int8|Uint8|Uint8Clamped|Int16|Uint16|Int32|Uint32|Float16|Float32|Float64|BigInt64|BigUint64)Array$").expect("pattern"));
static DATE_SETTER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("^set(UTC)?(FullYear|Month|Date|Hours|Minutes|Seconds|Milliseconds)$|^set(Time|Year)$").expect("pattern"));
static BUFFER_WRITER: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(write|swap)").expect("pattern"));

fn owner_mutators(owner: &str) -> &'static [&'static str] {
    match owner {
        "Array" => ARRAY_MUTATORS,
        "Set" => &["add", "delete", "clear"],
        "WeakSet" => &["add", "delete"],
        "Map" => &["set", "delete", "clear"],
        "WeakMap" => &["set", "delete"],
        "URLSearchParams" => &["append", "delete", "set", "sort"],
        _ => &[],
    }
}

fn mutates(owner: &str, method: &str) -> bool {
    if owner == "Date" {
        return DATE_SETTER.is_match(method);
    }
    if owner == "Buffer" {
        return BUFFER_WRITER.is_match(method);
    }
    if TYPED_ARRAY.is_match(owner) {
        return TYPED_ARRAY_MUTATORS.contains(&method);
    }
    owner_mutators(owner).contains(&method)
}

pub fn is_array_mutator(method: &str) -> bool {
    ARRAY_MUTATORS.contains(&method)
}

pub fn static_name(node: Node, types: &mut Types) -> Option<String> {
    let property = node.node("property")?;
    if !node.flag("computed") {
        return property.is("Identifier").then(|| property.text("name").map(|name| name.into_owned())).flatten();
    }
    let kind = types.type_at(property.start(), property.end())?;
    if !is_string_literal(&kind) {
        return None;
    }
    kind.value.as_ref().and_then(|value| value.as_str()).map(String::from)
}

/// The built-in type that declares `method` and whose method changes the value; of several (the receiver is a
/// union), the first by name, so the answer does not depend on the order of the union's members.
pub fn mutated_owner(node: Node, method: &str, types: &mut Types) -> Option<String> {
    let object = node.node("object")?;
    let receiver = types.type_at(object.start(), object.end())?;
    let parts = types.parts(&receiver);
    let mut owners = Vec::new();
    for part in parts.iter() {
        let Some(apparent) = types.apparent(part) else { continue };
        let Some(property) = types.property(&apparent, method) else { continue };
        for declaration in &property.declarations {
            owners.extend(types.owner_name(declaration).filter(|owner| mutates(owner, method)));
        }
    }
    owners.into_iter().min()
}
