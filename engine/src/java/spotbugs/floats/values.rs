//! What FindFloatEquality knows about each side of a comparison, measured on test code.
use super::super::Context;
use super::super::dumb::numbers::stores::{local, stores};
use super::super::dumb::numbers::values::{folded, local_value, operator};
use super::super::fields::field_key;
use crate::engine::source::{named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::constant::Constant;
use crate::java::types::expr::unwrap;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const DEPTH: usize = 6;
const ARITHMETIC: &[&str] = &["+", "-", "*", "/", "%"];

pub type Key = (String, String);

/// Whether a value is the result of floating point arithmetic: `Yes`, or so when one of the fields is written one.
pub enum Math {
    No,
    Yes,
    Fields(Vec<Key>),
}

impl Math {
    pub fn or_math(self, other: Math) -> Math {
        match (self, other) {
            (Math::Yes, _) | (_, Math::Yes) => Math::Yes,
            (Math::No, other) | (other, Math::No) => other,
            (Math::Fields(mut one), Math::Fields(two)) => {
                one.extend(two);
                Math::Fields(one)
            }
        }
    }
}

/// The primitive type a value compares as, unboxed.
pub fn numeric(kind: &Type) -> Option<&'static str> {
    match kind {
        Type::Primitive(kind) => Some(kind),
        Type::Class(name, _) => match name.as_str() {
            "java.lang.Double" => Some("double"),
            "java.lang.Float" => Some("float"),
            "java.lang.Long" => Some("long"),
            "java.lang.Integer" => Some("int"),
            "java.lang.Short" => Some("short"),
            "java.lang.Byte" => Some("byte"),
            "java.lang.Character" => Some("char"),
            _ => None,
        },
        _ => None,
    }
}

fn floating(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Primitive("double" | "float")))
}

/// The number javac folds an expression to, also arithmetic on constant fields the type index has no value for;
/// `true` with a whole number type.
fn number(context: &Context, node: Node, depth: usize) -> Option<(f64, bool)> {
    let node = unwrap(node);
    if depth > 0 && local(context, node) && !final_local(context, node) {
        return None;
    }
    if let Some(value) = folded(context, node) {
        return match value {
            Constant::Double(value) => Some((value, false)),
            Constant::Float(value) => Some((f64::from(value), false)),
            Constant::Int(value) => Some((f64::from(value), true)),
            Constant::Long(value) => Some((value as f64, true)),
            Constant::Char(value) => Some((f64::from(value), true)),
            Constant::Bool(_) => None,
        };
    }
    if depth > DEPTH {
        return None;
    }
    match node.kind() {
        "unary_expression" if matches!(operator(context, node), "-" | "+") => {
            let (value, whole) = number(context, node.child_by_field_name("operand")?, depth + 1)?;
            Some((if operator(context, node) == "-" { -value } else { value }, whole))
        }
        "binary_expression" if ARITHMETIC.contains(&operator(context, node)) => {
            let (left, left_whole) = number(context, node.child_by_field_name("left")?, depth + 1)?;
            let (right, right_whole) = number(context, node.child_by_field_name("right")?, depth + 1)?;
            let whole = left_whole && right_whole;
            let value = match operator(context, node) {
                "+" => left + right,
                "-" => left - right,
                "*" => left * right,
                "/" if whole => (right != 0.0).then(|| (left / right).trunc())?,
                "/" => left / right,
                _ if whole => (right != 0.0).then(|| left % right)?,
                _ => left % right,
            };
            Some((value, whole))
        }
        _ => None,
    }
}

pub enum Folded {
    NotANumber,
    Integral,
    Other,
}

/// What javac folds a side to: NaN, a whole number or infinity, or another number.
pub fn constant(context: &Context, node: Node) -> Option<Folded> {
    let (value, whole) = number(context, node, 0)?;
    Some(if value.is_nan() {
        Folded::NotANumber
    } else if whole || value.is_infinite() || value == value.trunc() {
        Folded::Integral
    } else {
        Folded::Other
    })
}

/// Whether a local is `final`, so that javac folds its constant into arithmetic.
fn final_local(context: &Context, node: Node) -> bool {
    let held = stores(context, node, context.text(node));
    let declared = held.first().and_then(|store| parent(*store)).filter(|declaration| declaration.kind() == "local_variable_declaration");
    held.len() == 1 && declared.is_some_and(|declaration| has_modifier(declaration, "final"))
}

/// Whether javac folds an expression to a number.
fn constant_expression(context: &Context, node: Node) -> bool {
    number(context, node, 1).is_some()
}

/// Whether both sides fold to one number.
pub fn same_constant(context: &Context, left: Node, right: Node) -> bool {
    number(context, left, 0).zip(number(context, right, 0)).is_some_and(|((one, _), (two, _))| one == two)
}

/// The expression or variable a side reads, through casts that change nothing and locals copied from another.
fn source<'t>(context: &Context, node: Node<'t>, depth: usize) -> Node<'t> {
    let node = unwrap(node);
    match node.kind() {
        "cast_expression" if same_type(context, node) => node.child_by_field_name("value").map_or(node, |value| source(context, value, depth)),
        "identifier" if depth < DEPTH => match local_value(context, node).map(unwrap) {
            Some(value) if matches!(value.kind(), "identifier" | "field_access") => source(context, value, depth + 1),
            _ => node,
        },
        _ => node,
    }
}

pub fn same_type(context: &Context, cast: Node) -> bool {
    let value = cast.child_by_field_name("value").and_then(|value| context.resolver.type_of(value));
    value.is_some_and(|value| context.resolver.type_of(cast).is_some_and(|kind| kind == value))
}

fn receiver(context: &Context, node: Node) -> String {
    match node.child_by_field_name("object") {
        Some(object) if object.kind() != "this" => context.text(object).split_whitespace().collect(),
        _ => String::new(),
    }
}

/// Whether both sides read the same value: one local, or one field of one object.
pub fn same(context: &Context, left: Node, right: Node) -> bool {
    let (left, right) = (source(context, left, 0), source(context, right, 0));
    if left.id() == right.id() {
        return true;
    }
    if local(context, left) || local(context, right) {
        return local(context, left) && local(context, right) && context.text(left) == context.text(right);
    }
    let (Some(one), Some(two)) = (field_key(context, left), field_key(context, right)) else { return false };
    let shared = context.resolver.index.field(&one.0, &one.1).is_some_and(|(_, field)| field.flags & flag::STATIC != 0);
    let receiver_of = |node: Node| if node.kind() == "field_access" && !shared { receiver(context, node) } else { String::new() };
    one == two && receiver_of(left) == receiver_of(right)
}

fn public(context: &Context, key: &Key) -> bool {
    context.resolver.index.field(&key.0, &key.1).is_some_and(|(_, field)| field.flags & flag::PUBLIC != 0)
}

/// Whether a side is the result of floating point arithmetic: `+ - * / %` typed `double` or `float`, kept through
/// casts that change nothing, ternaries and locals any of whose reaching stores is one; a field not `public` when
/// the run writes it one.
pub fn math(context: &Context, node: Node, depth: usize) -> Math {
    let node = unwrap(node);
    if depth > DEPTH {
        return Math::No;
    }
    match node.kind() {
        "binary_expression" => Math::from(ARITHMETIC.contains(&operator(context, node)) && floating(context, node) && !constant_expression(context, node)),
        "cast_expression" if same_type(context, node) => node.child_by_field_name("value").map_or(Math::No, |value| math(context, value, depth + 1)),
        "ternary_expression" => {
            let branch = |name| node.child_by_field_name(name).map_or(Math::No, |value| math(context, value, depth + 1));
            branch("consequence").or_math(branch("alternative"))
        }
        "identifier" if local(context, node) => stores(context, node, context.text(node)).into_iter().fold(Math::No, |found, store| found.or_math(stored_math(context, store, depth))),
        "identifier" | "field_access" => match field_key(context, node) {
            Some(key) if !public(context, &key) && floating(context, node) => Math::Fields(vec![key]),
            _ => Math::No,
        },
        _ => Math::No,
    }
}

impl From<bool> for Math {
    fn from(yes: bool) -> Self {
        if yes { Math::Yes } else { Math::No }
    }
}

fn stored_math(context: &Context, store: Node, depth: usize) -> Math {
    match store.kind() {
        "variable_declarator" => store.child_by_field_name("value").map_or(Math::No, |value| math(context, value, depth + 1)),
        "assignment_expression" if operator(context, store) == "=" => store.child_by_field_name("right").map_or(Math::No, |value| math(context, value, depth + 1)),
        _ => Math::Yes,
    }
}

/// Whether a store into a field writes floating point arithmetic, not counting what other fields hold.
pub fn writes_math(context: &Context, store: Node) -> bool {
    let target = match store.kind() {
        "assignment_expression" => store.child_by_field_name("left"),
        "update_expression" => named_children(store).into_iter().next(),
        _ => store.child_by_field_name("name"),
    };
    let floating_target = target.is_some_and(|target| floating(context, target));
    match store.kind() {
        "assignment_expression" if operator(context, store) != "=" => floating_target,
        "update_expression" => floating_target,
        _ => matches!(stored_math(context, store, 0), Math::Yes),
    }
}
