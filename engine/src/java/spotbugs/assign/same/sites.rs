//! The operators and calls the comparisons look at, the variable FindSelfComparison2 names and the method it
//! names for a call.
use super::super::super::{Context, idioms};
use super::super::flow::values::{Site, Val};
use crate::engine::source::parent;
use crate::java::javac::locals::{Found, Scopes, declaration};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

#[derive(Clone, Copy)]
pub enum Op {
    Compare,
    /// `-`, `&`, `|` or `^`: whether it is `-`.
    Compute(bool),
    Call,
}

const COMPARES: &[&str] = &["==", "!=", "<", "<=", ">", ">="];

fn floating(kind: &Option<Type>) -> bool {
    match kind {
        Some(Type::Primitive(name)) => matches!(*name, "float" | "double"),
        Some(Type::Class(name, _)) => matches!(name.as_str(), "java.lang.Float" | "java.lang.Double"),
        _ => false,
    }
}

fn primitive(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive(_)))
}

fn text<'s>(context: &'s Context, node: Node, name: &str) -> &'s str {
    node.child_by_field_name(name).map_or("", |part| context.text(part))
}

/// What a node does to its two operands, when it is one the comparisons look at.
pub fn op(context: &Context, node: Node) -> Option<Op> {
    let kind = |name: &str| node.child_by_field_name(name).and_then(|part| context.resolver.type_of(part));
    match node.kind() {
        "binary_expression" => {
            let (left, right) = (kind("left"), kind("right"));
            let operator = text(context, node, "operator");
            let numeric = primitive(&left) || primitive(&right) || !COMPARES.contains(&operator);
            if numeric && (floating(&left) || floating(&right)) {
                return None;
            }
            match operator {
                operator if COMPARES.contains(&operator) => Some(Op::Compare),
                "-" => Some(Op::Compute(true)),
                "&" | "|" | "^" => Some(Op::Compute(false)),
                _ => None,
            }
        }
        "assignment_expression" if !floating(&kind("left")) => match text(context, node, "operator") {
            "-=" => Some(Op::Compute(true)),
            "&=" | "|=" | "^=" => Some(Op::Compute(false)),
            _ => None,
        },
        "method_invocation" if used(node) => Some(Op::Call),
        _ => None,
    }
}

/// Whether the code uses the result of a call.
fn used(node: Node) -> bool {
    let mut at = node;
    while let Some(above) = parent(at).filter(|above| above.kind() == "parenthesized_expression") {
        at = above;
    }
    parent(at).is_some_and(|above| above.kind() != "expression_statement")
}

/// Whether the operator works on `long` values.
pub fn long(context: &Context, node: Node) -> bool {
    let long = |kind: Option<Type>| matches!(kind.map(|kind| kind.unboxed_or_same()), Some(Type::Primitive("long")));
    ["left", "right"].iter().filter_map(|name| node.child_by_field_name(name)).any(|part| long(context.resolver.type_of(part)))
}

/// The variable FindSelfComparison2 names: of those holding the value, the one declared first.
pub fn first_declared(context: &Context, site: &Site) -> Option<String> {
    if site.right == Val::This {
        return Some("this".to_string());
    }
    let root = crate::engine::source::ancestor(site.node, &["class_body"]).unwrap_or(site.node);
    let scopes = Scopes::of(context.file, root);
    let at = |name: &String| match declaration(context.resolver, &scopes, site.node, name) {
        Some(Found::Local(declared)) => declared.start_byte(),
        _ => usize::MAX,
    };
    site.holders.iter().min_by_key(|name| (at(name), (*name).clone())).cloned()
}

/// The called method as SpotBugs names it: by the class that declares it, but by the interface it is called on
/// when that interface does not declare it.
pub fn called(context: &Context, node: Node) -> Option<String> {
    let call = context.resolver.resolve_call(unwrap(node))?;
    let receiver = call.receiver.erased().name();
    let interface = context.resolver.index.get(&receiver).is_some_and(|info| info.is_interface);
    let owner = if interface && call.declaring == "java.lang.Object" { receiver } else { call.declaring.clone() };
    Some(idioms::called(context, &owner, &call.method.name, &call.method.parameters))
}
