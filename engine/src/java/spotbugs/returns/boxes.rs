//! BX_UNBOXING_IMMEDIATELY_REBOXED: a primitive value that javac boxes right after unboxing it from the same box
//! type, with nothing compiled in between. The boxing is the conversion of an expression to a reference type (a
//! declaration, assignment, argument, return, lambda result, array element, cast or reference conditional) or an
//! explicit `Box.valueOf(value)`; the value ends in an unboxing when it is `box.xValue()`, a value of the box type
//! itself, a cast of one to the primitive, or a conditional whose second branch ends so (the first one jumps over
//! the second). Priority 2, once per method, on the line where the boxed expression starts (the line of the
//! `valueOf` call when it is written out).
use super::super::{Context, place};
use crate::engine::source::{parent, walk};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERN: &str = "BX_UNBOXING_IMMEDIATELY_REBOXED";
const BOXES: &[(&str, &str)] = &[
    ("int", "java.lang.Integer"),
    ("long", "java.lang.Long"),
    ("short", "java.lang.Short"),
    ("byte", "java.lang.Byte"),
    ("char", "java.lang.Character"),
    ("boolean", "java.lang.Boolean"),
    ("float", "java.lang.Float"),
    ("double", "java.lang.Double"),
];

fn box_of(primitive: &str) -> Option<&'static str> {
    BOXES.iter().find(|(kind, _)| *kind == primitive).map(|(_, boxed)| *boxed)
}

fn primitive(context: &Context, node: Node) -> Option<&'static str> {
    if node.kind() == "ternary_expression" {
        return conditional(context, node).filter(|(_, boxed)| !boxed).map(|(kind, _)| kind);
    }
    match context.resolver.type_of(node)? {
        Type::Primitive(kind) if kind != "void" => Some(kind),
        _ => None,
    }
}

/// The primitive type a branch of a conditional stands for, and whether it is a box of it.
fn branch(context: &Context, node: Node) -> Option<(&'static str, bool)> {
    let node = unwrap(node);
    if node.kind() == "ternary_expression" {
        return conditional(context, node);
    }
    match context.resolver.type_of(node)? {
        Type::Primitive(kind) if kind != "void" => Some((kind, false)),
        Type::Class(name, _) => BOXES.iter().find(|(_, boxed)| *boxed == name).map(|(kind, _)| (*kind, true)),
        _ => None,
    }
}

/// The type of a conditional whose branches are primitives or boxes: a box only when both branches are that box,
/// else the primitive (the wider one for two numeric types).
fn conditional(context: &Context, node: Node) -> Option<(&'static str, bool)> {
    let (first, first_boxed) = branch(context, node.child_by_field_name("consequence")?)?;
    let (second, second_boxed) = branch(context, node.child_by_field_name("alternative")?)?;
    if first == second {
        return Some((first, first_boxed && second_boxed));
    }
    const WIDER: &[&str] = &["double", "float", "long", "int"];
    let numeric = |kind: &str| kind != "boolean";
    if !numeric(first) || !numeric(second) {
        return None;
    }
    let widest = WIDER.iter().find(|kind| **kind == first || **kind == second).copied().unwrap_or("int");
    Some((widest, false))
}

/// Whether the last thing javac compiles for an expression of the primitive type is unboxing that box.
fn ends_unboxed(context: &Context, node: Node, kind: &str, boxed: &str) -> bool {
    let node = unwrap(node);
    match node.kind() {
        "ternary_expression" => node.child_by_field_name("alternative").is_some_and(|other| ends_unboxed(context, other, kind, boxed)),
        "cast_expression" => {
            let to_box = node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).is_some_and(|kind| matches!(kind, Type::Class(ref name, _) if name == boxed));
            let Some(value) = node.child_by_field_name("value") else { return false };
            to_box || ends_unboxed(context, value, kind, boxed)
        }
        "method_invocation" => {
            let named = node.child_by_field_name("name").is_some_and(|name| context.text(name) == format!("{kind}Value"));
            let empty = node.child_by_field_name("arguments").is_some_and(|arguments| arguments.named_child_count() == 0);
            let on_box = node.child_by_field_name("object").and_then(|object| context.resolver.type_of(object)).is_some_and(|on| on.erased().name() == boxed);
            (named && empty && on_box) || is_box(context, node, boxed)
        }
        _ => is_box(context, node, boxed),
    }
}

fn is_box(context: &Context, node: Node, boxed: &str) -> bool {
    context.resolver.type_of(node).is_some_and(|kind| matches!(kind, Type::Class(ref name, _) if name == boxed))
}

/// The box an expression of a primitive type is converted to by its place, when the place asks for a reference.
fn boxed_by_place(context: &Context, node: Node, kind: &str) -> Option<&'static str> {
    let mut holder = parent(node)?;
    let mut inner = node;
    while holder.kind() == "parenthesized_expression" {
        inner = holder;
        holder = parent(holder)?;
    }
    let reference = |kind: &Type| matches!(kind, Type::Class(..) | Type::Variable(_));
    let asked = match holder.kind() {
        "ternary_expression" if holder.child_by_field_name("condition").is_some_and(|condition| condition.id() == inner.id()) => return None,
        "ternary_expression" if conditional(context, holder).is_some() => None,
        "ternary_expression" => context.resolver.type_of(holder).filter(reference),
        "cast_expression" => holder.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).filter(reference),
        "expression_statement" | "binary_expression" | "unary_expression" => None,
        _ => context.resolver.expected(node).filter(reference),
    };
    asked.and_then(|_| box_of(kind))
}

/// The expression a written `Box.valueOf(value)` boxes.
fn written_box<'t>(context: &Context, call: Node<'t>) -> Option<(Node<'t>, &'static str)> {
    if call.child_by_field_name("name").is_none_or(|name| context.text(name) != "valueOf") {
        return None;
    }
    let arguments = call.child_by_field_name("arguments")?;
    let [value] = crate::engine::source::named_children(arguments)[..] else { return None };
    let resolved = context.resolver.resolve_call(call)?;
    let Some(Type::Primitive(kind)) = resolved.method.parameters.first() else { return None };
    let boxed = box_of(kind)?;
    let fits = resolved.declaring == boxed && resolved.method.is_static;
    fits.then_some((value, boxed))
}

pub fn boxes(context: &Context) {
    let mut seen = HashSet::new();
    let package = context.resolver.scope.package.clone();
    walk(context.file.tree.root_node(), |node| {
        let written = (node.kind() == "method_invocation").then(|| written_box(context, node)).flatten();
        let found = written.map(|(value, boxed)| (value, boxed, node.child_by_field_name("arguments").map_or(context.line(node), |arguments| context.line(arguments)))).or_else(|| {
            let candidate = node.kind() != "parenthesized_expression" && (node.kind().ends_with("expression") || matches!(node.kind(), "method_invocation" | "identifier" | "field_access" | "array_access"));
            let kind = primitive(context, node).filter(|_| candidate)?;
            boxed_by_place(context, node, kind).map(|boxed| (node, boxed, context.line(node)))
        });
        let Some((value, boxed, line)) = found else { return };
        let kind = BOXES.iter().find(|(_, other)| *other == boxed).map(|(kind, _)| *kind).unwrap_or_default();
        if !ends_unboxed(context, value, kind, boxed) {
            return;
        }
        let short = boxed.trim_start_matches("java.lang.");
        let called = format!("{short}.valueOf({kind})");
        for label in place::methods(context, node) {
            if !seen.insert(label.clone()) {
                continue;
            }
            let message = format!("Boxed value is unboxed and then immediately reboxed in {label}");
            let place = format!("function:{called}|{package}@{called}");
            context.report_listed(PATTERN, node, line, message, place, 2, vec![label]);
        }
    });
}
