//! The string SpotBugs' operand stack knows an argument holds, measured with FindSecBugs' crypto detectors:
//! - a compile-time constant, a literal in parentheses or cast to `String`, `+` of known parts (javac's string
//!   concatenation is followed), and `toString()` or `intern()` of a known string;
//! - a `?:` whose two sides hold the same string, an assignment expression by the value it stores;
//! - a local variable when every store that reaches the use gives the same string: the last store always made
//!   before, and the later ones of a loop around the use;
//! - a field by what the whole run stores in it (see `summary`).
//!
//! Calls (`String.valueOf`, `toUpperCase`), `new String(..)`, parameters and values captured by lambdas are
//! unknown.
use super::super::Context;
use super::super::dumb::numbers::values::{reaching, writes};
use super::super::fields::field_key;
use super::super::observed::BODIES;
use crate::engine::source::{ancestor, walk};
use crate::java::types::constant::Constant;
use crate::java::types::expr::{Binding, unwrap};
use tree_sitter::Node;

const DEPTH: usize = 6;

/// A field by the class that declares it and its name.
pub type Key = (String, String);

#[derive(Clone, PartialEq, Debug)]
pub enum Held {
    Text(String),
    /// Whatever the run stores in the field.
    Field(Key),
    Unknown,
}

pub fn held(context: &Context, node: Node) -> Held {
    held_at(context, node, 0)
}

fn known(held: Held) -> Option<String> {
    match held {
        Held::Text(text) => Some(text),
        _ => None,
    }
}

fn number_text(value: Constant) -> Option<String> {
    match value {
        Constant::Int(value) => Some(value.to_string()),
        Constant::Long(value) => Some(value.to_string()),
        Constant::Bool(value) => Some(value.to_string()),
        Constant::Char(value) => char::from_u32(u32::from(value)).map(String::from),
        _ => None,
    }
}

fn part(context: &Context, node: Node, depth: usize) -> Option<String> {
    known(held_at(context, node, depth)).or_else(|| context.resolver.constant_number(unwrap(node)).and_then(number_text))
}

fn held_at(context: &Context, node: Node, depth: usize) -> Held {
    let node = unwrap(node);
    if let Some(text) = context.resolver.constant_string(node) {
        return Held::Text(text);
    }
    if let Some(value) = context.resolver.constant_number(node).filter(|value| !matches!(value, Constant::Char(_))) {
        return number_text(value).map_or(Held::Unknown, Held::Text);
    }
    if let Some(value) = context.resolver.constant_boolean(node) {
        return Held::Text(value.to_string());
    }
    if depth > DEPTH {
        return Held::Unknown;
    }
    let field = |name: &str| node.child_by_field_name(name);
    match node.kind() {
        "cast_expression" if field("type").is_some_and(|kind| matches!(context.text(kind), "String" | "java.lang.String")) => {
            field("value").map_or(Held::Unknown, |value| held_at(context, value, depth + 1))
        }
        "ternary_expression" => {
            let sides: Vec<Held> = ["consequence", "alternative"].iter().map(|side| field(side).map_or(Held::Unknown, |side| held_at(context, side, depth + 1))).collect();
            match &sides[..] {
                [Held::Text(one), Held::Text(other)] if one == other => sides[0].clone(),
                _ => Held::Unknown,
            }
        }
        "binary_expression" if field("operator").is_some_and(|operator| context.text(operator) == "+") => {
            let left = field("left").and_then(|left| part(context, left, depth + 1));
            let right = field("right").and_then(|right| part(context, right, depth + 1));
            match (left, right) {
                (Some(left), Some(right)) if !context.resolver.constant_number(node).is_some() => Held::Text(left + &right),
                _ => Held::Unknown,
            }
        }
        "assignment_expression" if field("operator").is_some_and(|operator| context.text(operator) == "=") => field("right").map_or(Held::Unknown, |right| held_at(context, right, depth + 1)),
        "method_invocation" => {
            let name = field("name").map(|name| context.text(name)).unwrap_or_default();
            let plain = field("arguments").is_some_and(|arguments| arguments.named_child_count() == 0);
            match field("object") {
                Some(object) if plain && matches!(name, "toString" | "intern") => match held_at(context, object, depth + 1) {
                    Held::Text(text) => Held::Text(text),
                    _ => Held::Unknown,
                },
                _ => Held::Unknown,
            }
        }
        "identifier" if matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Local(_))) => local(context, node, depth),
        "identifier" | "field_access" => field_key(context, node).map_or(Held::Unknown, Held::Field),
        _ => Held::Unknown,
    }
}

/// Whether the local is declared without a value in the body, so that javac makes every path store into it first.
fn declared_empty(context: &Context, body: Node, name: &str) -> bool {
    let mut found = false;
    walk(body, |node| {
        let named = node.kind() == "variable_declarator" && node.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name);
        found |= named && node.child_by_field_name("value").is_none() && node.parent().is_some_and(|holder| holder.kind() == "local_variable_declaration");
    });
    found
}

fn local(context: &Context, usage: Node, depth: usize) -> Held {
    let Some(body) = ancestor(usage, BODIES) else { return Held::Unknown };
    let name = context.text(usage);
    let stores = reaching(usage, &writes(context, body, name), body);
    let Some(first) = stores.first() else { return Held::Unknown };
    let always = first.end_byte() <= usage.start_byte() && super::super::observed::always_before(*first, usage, body);
    if !always && !declared_empty(context, body, name) {
        return Held::Unknown;
    }
    let mut value: Option<String> = None;
    for store in &stores {
        let given = match store.kind() {
            "variable_declarator" => store.child_by_field_name("value"),
            "assignment_expression" if store.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") => store.child_by_field_name("right"),
            _ => None,
        };
        let Some(text) = given.and_then(|given| known(held_at(context, given, depth + 1))) else { return Held::Unknown };
        if value.as_ref().is_some_and(|value| *value != text) {
            return Held::Unknown;
        }
        value = Some(text);
    }
    value.map_or(Held::Unknown, Held::Text)
}
