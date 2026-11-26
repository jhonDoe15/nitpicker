//! What a store puts in its variable, judged as SpotBugs judges it: by the instruction the compiled code runs
//! right before the store. A `?:` or a `switch` is judged by its last arm, a cast the compiler leaves out by what it casts.
mod constant;

pub use constant::{constant, constant_local};
use constant::known;
use super::super::Context;
use super::slots::{Kind, Layout};
use constant::small;
use crate::engine::source::{named_children, parent};
use crate::java::flow::cfg::unwrap;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Value {
    /// A constant; `wide` when it takes `ldc2_w`: a `long` or `double` other than 0 and 1.
    Constant { wide: bool },
    Null,
    Class,
    New,
    /// A field of an object, read with `getfield`.
    Field,
    Copy(usize),
    /// The exception a handler caught, or a copy of it.
    Caught,
    Other,
}

const BOOLEAN: &[&str] = &["==", "!=", "<", ">", "<=", ">=", "&&", "||"];

fn primitive(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive(_)))
}

/// What a value stored in a variable of type `target` is.
pub fn of(context: &Context, layout: &Layout, value: Node, target: &Option<Type>) -> Value {
    let value = unwrap(value);
    if constant(context, layout, value) {
        let boxed = matches!(target, Some(Type::Class(..))) && primitive(&context.resolver.type_of(value));
        if boxed {
            return Value::Other;
        }
        return Value::Constant { wide: super::slots::wide(target) && !small(context, value) };
    }
    let given = context.resolver.type_of(value);
    if boxes(target, &given) {
        return Value::Other;
    }
    let known = value.child_by_field_name("condition").filter(|_| value.kind() == "ternary_expression").and_then(|condition| known(context, condition));
    if let Some(holds) = known {
        let arm = value.child_by_field_name(if holds { "consequence" } else { "alternative" });
        return arm.map_or(Value::Other, |arm| of(context, layout, arm, target));
    }
    let operator = value.child_by_field_name("operator").map(|operator| context.text(operator));
    match value.kind() {
        "null_literal" => Value::Null,
        "class_literal" => match value.named_child(0).map(|written| written.kind()) {
            Some("integral_type" | "floating_point_type" | "boolean_type" | "void_type") => Value::Other,
            _ => Value::Class,
        },
        "object_creation_expression" => Value::New,
        "array_creation_expression" => match value.child_by_field_name("value") {
            Some(listed) if filled(listed) => Value::Other,
            _ => Value::New,
        },
        "array_initializer" if filled(value) => Value::Other,
        "array_initializer" => Value::New,
        "binary_expression" | "unary_expression" if tests(context, value) == Some(true) => Value::Other,
        "binary_expression" if operator.is_some_and(|operator| BOOLEAN.contains(&operator)) => Value::Constant { wide: false },
        "unary_expression" if operator == Some("!") => Value::Constant { wide: false },
        "ternary_expression" | "switch_expression" => match last_arm(value).map(|last| of(context, layout, last, target)) {
            Some(Value::Copy(_) | Value::Field) | None => Value::Other,
            Some(last) => last,
        },
        "cast_expression" => {
            let Some(inner) = value.child_by_field_name("value") else { return Value::Other };
            if dropped(context, value, inner) { of(context, layout, inner, target) } else { Value::Other }
        }
        "identifier" => match layout.uses.get(&value.id()) {
            Some(var) if caught(context, layout, *var, 0) => Value::Caught,
            Some(var) if converts(&layout.vars[*var].ty, target) => Value::Other,
            Some(var) => Value::Copy(*var),
            None if converts(&given, target) => Value::Other,
            None => field(context, layout, value),
        },
        "field_access" if converts(&given, target) => Value::Other,
        "field_access" => field(context, layout, value),
        _ => Value::Other,
    }
}

/// The arm whose code runs right before the store: the last of a `?:` or of a `switch`.
fn last_arm(value: Node) -> Option<Node> {
    if value.kind() == "ternary_expression" {
        return value.child_by_field_name("alternative");
    }
    let last = value.child_by_field_name("body").and_then(|body| named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).last())?;
    let tail = named_children(last).into_iter().filter(|part| !part.kind().ends_with("comment") && part.kind() != "switch_label").last()?;
    let tail = if tail.kind() == "block" { named_children(tail).into_iter().filter(|part| !part.kind().ends_with("comment")).last()? } else { tail };
    match tail.kind() {
        "expression_statement" | "yield_statement" => tail.named_child(0),
        _ => None,
    }
}

/// Whether the compiler converts a primitive value on the way into the variable.
fn converts(from: &Option<Type>, to: &Option<Type>) -> bool {
    match (from, to) {
        (Some(Type::Primitive(from)), Some(Type::Primitive(to))) => from != to && !matches!((*from, *to), ("byte" | "short" | "char", "int") | ("byte", "short")),
        (Some(Type::Primitive(_)), Some(_)) | (Some(_), Some(Type::Primitive(_))) => true,
        _ => false,
    }
}

/// For a test made of `&&`, `||`, `!` and comparisons: whether every comparison in it is one with `null`, which
/// SpotBugs does not take for a constant.
fn tests(context: &Context, node: Node) -> Option<bool> {
    let node = unwrap(node);
    let operator = node.child_by_field_name("operator").map(|operator| context.text(operator));
    match (node.kind(), operator) {
        ("unary_expression", Some("!")) => tests(context, node.child_by_field_name("operand")?),
        ("binary_expression", Some("&&" | "||")) => {
            Some(tests(context, node.child_by_field_name("left")?)? && tests(context, node.child_by_field_name("right")?)?)
        }
        ("binary_expression", Some("==" | "!=")) => {
            let sides = [node.child_by_field_name("left"), node.child_by_field_name("right")];
            Some(sides.into_iter().flatten().any(|side| unwrap(side).kind() == "null_literal"))
        }
        _ => Some(false),
    }
}

fn filled(listed: Node) -> bool {
    named_children(listed).into_iter().any(|part| !part.kind().ends_with("comment"))
}

/// A cast the compiler writes no instruction for: to the same primitive type, or to a supertype.
fn dropped(context: &Context, cast: Node, inner: Node) -> bool {
    let (Some(to), Some(from)) = (cast.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)), context.resolver.type_of(inner)) else {
        return false;
    };
    match (&from, &to) {
        (Type::Primitive(_), _) | (_, Type::Primitive(_)) => from == to,
        (Type::Null, _) => false,
        _ => context.resolver.assignable(&from, &to, true),
    }
}

/// A read of a field of `this` or of a local variable: `aload` then `getfield`. The field of a field, a call's
/// result and the like are not.
fn field(context: &Context, layout: &Layout, node: Node) -> Value {
    let found = match node.kind() {
        "identifier" => context.resolver.binding(node, context.text(node)),
        _ => {
            let object = node.child_by_field_name("object");
            let local = object.map(unwrap).is_some_and(|object| object.kind() == "this" || layout.uses.contains_key(&object.id()));
            if !local {
                return Value::Other;
            }
            if object.and_then(|object| context.resolver.type_of(object)).is_some_and(|kind| matches!(kind, Type::Array(_))) {
                return Value::Other;
            }
            let name = node.child_by_field_name("field").map(|name| context.text(name)).unwrap_or_default();
            let receiver = object.and_then(|object| context.resolver.type_of(object));
            let class = receiver.map(|kind| kind.erased().name());
            let found = class.and_then(|class| context.resolver.index.field(&class, name));
            return match found {
                Some((_, field)) if field.flags & flag::STATIC == 0 => Value::Field,
                _ => Value::Other,
            };
        }
    };
    match found {
        Some(Binding::Field(_, _, field)) if field.flags & flag::STATIC == 0 => Value::Field,
        _ => Value::Other,
    }
}

/// Whether a variable holds the exception a handler caught: the handler's own, or one only ever set from it.
fn caught(context: &Context, layout: &Layout, var: usize, depth: u32) -> bool {
    let known = &layout.vars[var];
    match known.kind {
        Kind::Catch => true,
        Kind::Local if depth < 4 => {
            let value = known.decl.child_by_field_name("value").map(unwrap);
            let copied = value.filter(|value| value.kind() == "identifier").and_then(|value| layout.uses.get(&value.id()));
            copied.is_some_and(|other| *other != var && caught(context, layout, *other, depth + 1)) && layout.stores.get(&known.slot) == Some(&1)
        }
        _ => false,
    }
}

/// The identifier an assignment or `++`/`--` writes, when it is a plain name.
pub fn target(node: Node) -> Option<Node> {
    let written = match node.kind() {
        "assignment_expression" => node.child_by_field_name("left"),
        "update_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")),
        _ => None,
    }?;
    Some(unwrap(written)).filter(|written| written.kind() == "identifier")
}

/// Whether the compiler writes an assignment or update as `iinc`: `++`, `--`, `+=` and `-=` of a constant on an `int`.
pub fn increment(context: &Context, layout: &Layout, node: Node) -> bool {
    let Some(var) = target(node).and_then(|written| layout.uses.get(&written.id())) else { return false };
    if layout.vars[*var].ty != Some(Type::Primitive("int")) {
        return false;
    }
    match node.kind() {
        "update_expression" => true,
        _ => {
            let operator = node.child_by_field_name("operator").map(|operator| context.text(operator));
            let Some(right) = node.child_by_field_name("right") else { return false };
            let integral = matches!(context.resolver.type_of(right), Some(Type::Primitive("int" | "short" | "char" | "byte")));
            matches!(operator, Some("+=" | "-=")) && integral && constant(context, layout, right) && fits(context, right)
        }
    }
}

fn fits(context: &Context, node: Node) -> bool {
    let node = unwrap(node);
    let text: String = context.text(node).chars().filter(|c| *c != '_').collect();
    match node.kind() {
        "decimal_integer_literal" => text.parse::<i64>().is_ok_and(|value| value <= 32767),
        _ => true,
    }
}

/// Whether the value of an expression is used: not a statement of its own or a loop's update.
pub fn used(node: Node) -> bool {
    let mut holder = parent(node);
    while let Some(around) = holder.filter(|around| around.kind() == "parenthesized_expression") {
        holder = parent(around);
    }
    match holder {
        Some(holder) if holder.kind() == "expression_statement" => false,
        Some(holder) if holder.kind() == "for_statement" => holder.child_by_field_name("condition").is_some_and(|condition| condition.id() == node.id()),
        _ => true,
    }
}

/// Whether a value is boxed or unboxed on its way into a variable: a call to `valueOf` or to `intValue` and the like.
pub fn boxes(to: &Option<Type>, from: &Option<Type>) -> bool {
    match (to, from) {
        (Some(Type::Primitive(_)), Some(Type::Class(..))) => true,
        (Some(Type::Class(..)), Some(Type::Primitive(_))) => true,
        _ => false,
    }
}
