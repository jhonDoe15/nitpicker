//! What DumbMethods knows about a whole number on the operand stack, measured on test code:
//! - a signed byte: anything typed `byte` (an element, field, parameter, call, cast or unboxed `Byte`), seen
//!   through casts that add no instruction and `long` widening, and an `int` local holding only signed bytes;
//!   a constant is not one;
//! - low 8 bits clear: a shift left by a constant of 8 to 31 after javac masks it (`int`), of 8 or more (`long`),
//!   an and with a constant whose low 8 bits are 0, a shift right by 0 of such a value, and an `int` local
//!   holding only such values; widening to `long` forgets it;
//! - nonnegative: anything typed `char`, an array length, an `int` and with a constant of 0 or more, and an
//!   `int` local holding only such values.
use super::super::super::Context;
use super::super::super::observed::BODIES;
pub use super::stores::{held, local, stores};
use crate::engine::source::{ancestor, walk};
use crate::java::types::constant::Constant;
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use tree_sitter::Node;

const DEPTH: usize = 6;

pub fn primitive(context: &Context, node: Node) -> Option<&'static str> {
    match context.resolver.type_of(node)? {
        Type::Primitive(kind) => Some(kind),
        Type::Class(name, _) => match name.as_str() {
            "java.lang.Byte" => Some("byte"),
            "java.lang.Short" => Some("short"),
            "java.lang.Character" => Some("char"),
            "java.lang.Integer" => Some("int"),
            "java.lang.Long" => Some("long"),
            _ => None,
        },
        _ => None,
    }
}

/// The value of a `final` field of a class of this file initialized with a constant.
fn source_constant(context: &Context, node: Node, depth: usize) -> Option<Constant> {
    let (class, name) = super::super::super::fields::field_key(context, node)?;
    let declaration = *context.classes.get(&class)?;
    let body = declaration.child_by_field_name("body")?;
    for member in crate::engine::source::children(body).into_iter().filter(|member| matches!(member.kind(), "field_declaration" | "constant_declaration")) {
        let fixed = member.kind() == "constant_declaration" || crate::java::helpers::has_modifier(member, "final");
        let kind = member.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
        for declarator in crate::java::helpers::declarators(member) {
            if fixed && declarator.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) {
                let value = folded_at(context, declarator.child_by_field_name("value")?, depth + 1)?;
                return crate::java::types::constant::cast(kind, value);
            }
        }
    }
    None
}

fn folded_at(context: &Context, node: Node, depth: usize) -> Option<Constant> {
    let node = unwrap(node);
    if let Some(value) = context.resolver.constant_number(node) {
        return Some(value);
    }
    if depth > DEPTH {
        return None;
    }
    if let Some(value) = local_value(context, node) {
        return folded_at(context, value, depth + 1);
    }
    match node.kind() {
        "identifier" | "field_access" => source_constant(context, node, depth),
        _ => None,
    }
}

/// The value a local variable holds at a use when one store, not a compound one, always gives it.
pub fn local_value<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    if !local(context, node) {
        return None;
    }
    let [store] = stores(context, node, context.text(node))[..] else { return None };
    match store.kind() {
        "variable_declarator" => store.child_by_field_name("value"),
        "assignment_expression" if operator(context, store) == "=" => store.child_by_field_name("right"),
        _ => None,
    }
}

/// The string javac folds an expression to, also through a local holding one.
pub fn text_constant(context: &Context, node: Node) -> Option<String> {
    let node = unwrap(node);
    if let Some(text) = context.resolver.constant_string(node) {
        return Some(text);
    }
    local_value(context, node).and_then(|value| context.resolver.constant_string(unwrap(value)))
}

/// The number javac folds an expression to, also from constant fields of this file the type index has no value for.
pub fn folded(context: &Context, node: Node) -> Option<Constant> {
    folded_at(context, node, 0)
}

/// The whole number javac folds an expression to.
pub fn whole(context: &Context, node: Node) -> Option<i64> {
    match folded(context, node)? {
        Constant::Int(value) => Some(i64::from(value)),
        Constant::Long(value) => Some(value),
        Constant::Char(value) => Some(i64::from(value)),
        _ => None,
    }
}

pub fn operator<'a>(context: &'a Context, node: Node) -> &'a str {
    node.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default()
}

fn int_local(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Primitive("int")))
}

fn assigned<'t>(node: Node<'t>) -> Option<Node<'t>> {
    (node.kind() == "assignment_expression" && node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=")).then(|| node.child_by_field_name("right")).flatten()
}

/// Whether a field is written in the code around a use before it: SpotBugs then knows the value stored.
fn stored_before(context: &Context, node: Node) -> bool {
    let Some(key) = super::super::super::fields::field_key(context, node) else { return false };
    let Some(body) = ancestor(node, BODIES) else { return false };
    let mut found = false;
    walk(body, |store| {
        let target = (store.kind() == "assignment_expression").then(|| store.child_by_field_name("left")).flatten();
        if !found && store.end_byte() <= node.start_byte() && target.is_some_and(|target| super::super::super::fields::field_key(context, target).as_ref() == Some(&key)) {
            found = true;
        }
    });
    found
}

/// A value of a narrow type (`byte`, `char`) as SpotBugs tracks it: a parameter, an element, a call or a field not
/// written before; a local only when each value it holds is one; a constant never.
fn typed(context: &Context, node: Node, kind: &str, depth: usize, test: &dyn Fn(Node, usize) -> bool) -> Option<bool> {
    match node.kind() {
        "ternary_expression" => Some(["consequence", "alternative"].iter().all(|side| node.child_by_field_name(side).is_some_and(|side| test(side, depth + 1)))),
        "identifier" if local(context, node) && primitive(context, node) == Some(kind) => {
            let written = !stores(context, node, context.text(node)).is_empty();
            Some(!written || held(context, node, depth, test))
        }
        "identifier" | "field_access" if primitive(context, node) == Some(kind) && (stored_before(context, node) || super::stores::initialized(context, node)) => Some(false),
        _ => (primitive(context, node) == Some(kind)).then_some(true),
    }
}

pub fn signed_byte(context: &Context, node: Node, depth: usize) -> bool {
    let node = unwrap(node);
    if depth > DEPTH || whole(context, node).is_some() {
        return false;
    }
    if let Some(known) = typed(context, node, "byte", depth, &|value, depth| signed_byte(context, value, depth)) {
        return known;
    }
    if let Some(right) = assigned(node) {
        return signed_byte(context, right, depth + 1);
    }
    match node.kind() {
        "binary_expression" if operator(context, node) == "<<" && node.child_by_field_name("right").and_then(|right| whole(context, right)) == Some(0) => {
            node.child_by_field_name("left").is_some_and(|left| signed_byte(context, left, depth + 1))
        }
        "cast_expression" => {
            let to = node.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
            matches!(to, "int" | "short" | "long") && node.child_by_field_name("value").is_some_and(|value| signed_byte(context, value, depth + 1))
        }
        "ternary_expression" => ["consequence", "alternative"].iter().all(|side| node.child_by_field_name(side).is_some_and(|side| signed_byte(context, side, depth + 1))),
        "identifier" if int_local(context, node) || primitive(context, node) == Some("long") => held(context, node, depth, &|value, depth| signed_byte(context, value, depth)),
        _ => false,
    }
}

/// The operands of a binary operation, or of a compound assignment with the variable's own value on the left.
pub fn operands<'t>(node: Node<'t>) -> Option<(Node<'t>, Node<'t>)> {
    match node.kind() {
        "binary_expression" => Some((node.child_by_field_name("left")?, node.child_by_field_name("right")?)),
        "assignment_expression" => Some((node.child_by_field_name("left")?, node.child_by_field_name("right")?)),
        _ => None,
    }
}

/// The operator of a binary operation or compound assignment, without `=`.
pub fn binary_operator<'a>(context: &'a Context, node: Node) -> &'a str {
    let written = operator(context, node);
    if node.kind() == "assignment_expression" { written.strip_suffix('=').unwrap_or_default() } else { written }
}

pub fn low_clear(context: &Context, node: Node, depth: usize) -> bool {
    let node = unwrap(node);
    if depth > DEPTH {
        return false;
    }
    if let Some(value) = whole(context, node) {
        return value != 0 && value & 0xff == 0 && value != 256;
    }
    if let Some(right) = assigned(node) {
        return low_clear(context, right, depth + 1);
    }
    match node.kind() {
        "binary_expression" | "assignment_expression" if node.kind() == "binary_expression" || operator(context, node) != "=" => {
            let Some((left, right)) = operands(node) else { return false };
            let long = primitive(context, node) == Some("long");
            match binary_operator(context, node) {
                "<<" => match whole(context, right) {
                    Some(0) => low_clear(context, left, depth + 1),
                    Some(shift) if long => shift >= 8,
                    Some(shift) => (shift & 31) >= 8 || ((shift & 31) == 0 && low_clear(context, left, depth + 1)),
                    None => false,
                },
                ">>" | ">>>" => !long && whole(context, right).is_some_and(|shift| shift & 31 == 0) && low_clear(context, left, depth + 1),
                "&" => {
                    let masked = |side: Node| whole(context, side).is_some_and(|mask| mask & 0xff == 0);
                    masked(right) || (node.kind() == "binary_expression" && masked(left))
                }
                _ => false,
            }
        }
        "cast_expression" => {
            let to = node.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
            let value = node.child_by_field_name("value");
            matches!(to, "int" | "short") && value.is_some_and(|value| primitive(context, value) == Some("int") && low_clear(context, value, depth + 1))
        }
        "ternary_expression" => ["consequence", "alternative"].iter().all(|side| node.child_by_field_name(side).is_some_and(|side| low_clear(context, side, depth + 1))),
        "identifier" if int_local(context, node) || primitive(context, node) == Some("long") => held(context, node, depth, &|value, depth| low_clear(context, value, depth)),
        _ => false,
    }
}

pub fn nonnegative(context: &Context, node: Node, depth: usize) -> bool {
    let node = unwrap(node);
    if depth > DEPTH || whole(context, node).is_some() {
        return false;
    }
    if let Some(known) = typed(context, node, "char", depth, &|value, depth| nonnegative(context, value, depth)) {
        return known;
    }
    if let Some(right) = assigned(node) {
        return nonnegative(context, right, depth + 1);
    }
    match node.kind() {
        "method_invocation" => {
            let sized = node.child_by_field_name("name").is_some_and(|name| context.text(name) == "size") && node.child_by_field_name("arguments").is_some_and(|list| list.named_child_count() == 0);
            sized && context.resolver.resolve_call(node).is_some_and(|call| context.resolver.index.is_subtype(&call.declaring, "java.util.Collection"))
        }
        "assignment_expression" if operator(context, node) == "&=" => {
            node.child_by_field_name("right").and_then(|right| whole(context, right)).is_some_and(|mask| mask >= 0)
        }
        "field_access" => {
            let length = node.child_by_field_name("field").is_some_and(|field| context.text(field) == "length");
            length && node.child_by_field_name("object").and_then(|object| context.resolver.type_of(object)).is_some_and(|kind| matches!(kind, Type::Array(_)))
        }
        "binary_expression" if operator(context, node) == "&" && primitive(context, node) == Some("int") => {
            ["left", "right"].iter().any(|side| node.child_by_field_name(side).and_then(|side| whole(context, side)).is_some_and(|mask| mask >= 0))
        }
        "cast_expression" => {
            let to = node.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
            to == "int" && node.child_by_field_name("value").is_some_and(|value| nonnegative(context, value, depth + 1))
        }
        "ternary_expression" => ["consequence", "alternative"].iter().all(|side| node.child_by_field_name(side).is_some_and(|side| nonnegative(context, side, depth + 1))),
        "identifier" if int_local(context, node) => held(context, node, depth, &|value, depth| nonnegative(context, value, depth)),
        _ => false,
    }
}
