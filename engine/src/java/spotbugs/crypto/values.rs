//! The string SpotBugs' operand stack knows an argument holds, measured with FindSecBugs' crypto detectors:
//! - a compile-time constant, a literal in parentheses or cast to `String`, a known number cast to `int` or `long`, `+` of known parts (javac's string
//!   concatenation is followed), and `toString()` or `intern()` of a known string;
//! - `Integer.valueOf` of a known `int`; `boolean` and `int` constants as text;
//! - a `?:` whose two sides hold the same string, an assignment expression by the value it stores;
//! - a local variable when every store that reaches the use gives the same string: the last store always made
//!   before, and the later ones of a loop around the use; `x++` and `x--` of an `int` or `long` count from the value before (not in a `for` update), and so do `x op= v`;
//! - arithmetic of known `int` and `long` numbers, wrapped as Java does;
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
use crate::java::types::model::Type;
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

/// `Integer.valueOf(int)`, whose value SpotBugs follows.
fn boxes_int(context: &Context, node: Node) -> bool {
    let named = node.child_by_field_name("name").is_some_and(|name| context.text(name) == "valueOf");
    named && context.resolver.resolve_call(node).is_some_and(|call| call.declaring == "java.lang.Integer" && call.method.parameters.len() == 1 && call.method.parameters[0].name() == "int")
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
        "cast_expression" if field("type").is_some_and(|kind| matches!(context.text(kind), "int" | "long")) => {
            let value = field("value").map_or(Held::Unknown, |value| held_at(context, value, depth + 1));
            let number = known(value).and_then(|text| text.parse::<i64>().ok());
            let narrow = field("type").is_some_and(|kind| context.text(kind) == "int");
            number.map_or(Held::Unknown, |number| Held::Text(if narrow { i64::from(number as i32) } else { number }.to_string()))
        }
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
        "binary_expression" if width(context, node).is_some() => {
            let operator = field("operator").map(|operator| context.text(operator)).unwrap_or_default();
            let left = field("left").map_or(Held::Unknown, |left| held_at(context, left, depth + 1));
            let right = field("right").map_or(Held::Unknown, |right| held_at(context, right, depth + 1));
            computed(context, node, operator, left, right)
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
        "method_invocation" if boxes_int(context, node) => field("arguments").and_then(|arguments| arguments.named_child(0)).map_or(Held::Unknown, |value| held_at(context, value, depth + 1)),
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

/// The number `x op= v` of an `int` or `long` local leaves, from what the local held before it.
fn compounded(context: &Context, store: Node, operator: &str, depth: usize) -> Option<String> {
    let target = store.child_by_field_name("left").filter(|target| target.kind() == "identifier")?;
    if depth > DEPTH || width(context, target).is_none() {
        return None;
    }
    let before = local(context, target, depth + 1);
    let value = store.child_by_field_name("right").map_or(Held::Unknown, |right| held_at(context, right, depth + 1));
    known(computed(context, target, operator, before, value))
}

/// Whether an expression is an `int` (32) or `long` (64) number.
fn width(context: &Context, node: Node) -> Option<u32> {
    match context.resolver.type_of(node) {
        Some(Type::Primitive("int")) => Some(32),
        Some(Type::Primitive("long")) => Some(64),
        _ => None,
    }
}

/// An arithmetic operator on two known numbers, wrapped to the width of `node`'s type.
fn computed(context: &Context, node: Node, operator: &str, left: Held, right: Held) -> Held {
    let number = |held: Held| known(held).and_then(|text| text.parse::<i64>().ok());
    let (Some(bits), Some(a), Some(b)) = (width(context, node), number(left), number(right)) else { return Held::Unknown };
    let shift = (b as u32) & (bits - 1);
    let value = match operator {
        "+" => a.wrapping_add(b),
        "-" => a.wrapping_sub(b),
        "*" => a.wrapping_mul(b),
        "/" if b != 0 => a.wrapping_div(b),
        "%" if b != 0 => a.wrapping_rem(b),
        "&" => a & b,
        "|" => a | b,
        "^" => a ^ b,
        "<<" if bits == 32 => i64::from((a as i32).wrapping_shl(shift)),
        "<<" => a.wrapping_shl(shift),
        ">>" if bits == 32 => i64::from((a as i32) >> shift),
        ">>" => a >> shift,
        ">>>" if bits == 32 => i64::from(((a as i32 as u32) >> shift) as i32),
        ">>>" => ((a as u64) >> shift) as i64,
        _ => return Held::Unknown,
    };
    Held::Text(if bits == 32 { i64::from(value as i32) } else { value }.to_string())
}

/// The number an `x++` or `x--` of an `int` or `long` local leaves, from what the local held before it.
fn stepped(context: &Context, update: Node, depth: usize) -> Option<String> {
    if depth > DEPTH {
        return None;
    }
    let operand = crate::engine::source::named_children(update).into_iter().find(|part| part.kind() == "identifier")?;
    let before: i64 = known(local(context, operand, depth + 1))?.parse().ok()?;
    let step = if context.text(update).contains("++") { 1 } else { -1 };
    match context.resolver.type_of(operand) {
        Some(Type::Primitive("int")) => Some(i64::from((before as i32).wrapping_add(step)).to_string()),
        Some(Type::Primitive("long")) => Some(before.wrapping_add(i64::from(step)).to_string()),
        _ => None,
    }
}

/// Whether a store is the update of a `for` loop whose test or body holds the use: written before it, run after.
fn loop_update(store: Node, usage: Node) -> bool {
    let mut at = store.parent();
    while let Some(around) = at {
        if around.kind() == "for_statement" {
            let update = around.child_by_field_name("update").is_some_and(|update| update.start_byte() <= store.start_byte() && store.end_byte() <= update.end_byte());
            let mut cursor = around.walk();
            let updates: Vec<Node> = around.children_by_field_name("update", &mut cursor).collect();
            let listed = updates.iter().any(|update| update.start_byte() <= store.start_byte() && store.end_byte() <= update.end_byte());
            return (update || listed) && around.start_byte() <= usage.start_byte() && usage.end_byte() <= around.end_byte();
        }
        at = around.parent();
    }
    false
}

fn local(context: &Context, usage: Node, depth: usize) -> Held {
    let Some(body) = ancestor(usage, BODIES) else { return Held::Unknown };
    let name = context.text(usage);
    let stores = reaching(usage, &writes(context, body, name), body);
    let Some(first) = stores.first() else { return Held::Unknown };
    if stores.iter().any(|store| store.kind() == "update_expression" && loop_update(*store, usage)) {
        return Held::Unknown;
    }
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
        let compound = store.child_by_field_name("operator").map(|operator| context.text(operator)).filter(|operator| store.kind() == "assignment_expression" && *operator != "=");
        let text = match store.kind() {
            "update_expression" => stepped(context, *store, depth),
            _ if compound.is_some() => compounded(context, *store, compound.unwrap_or_default().trim_end_matches('='), depth),
            _ => given.and_then(|given| known(held_at(context, given, depth + 1))),
        };
        let Some(text) = text else { return Held::Unknown };
        if value.as_ref().is_some_and(|value| *value != text) {
            return Held::Unknown;
        }
        value = Some(text);
    }
    value.map_or(Held::Unknown, Held::Text)
}
