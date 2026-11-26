//! ComparableAndComparator and BadComparable.
use super::Context;
use super::fixes::Fix;
use super::hierarchy::formals;
use super::nodes::{class_position, unparenthesized};
use crate::engine::source::{ancestor, children, named_children};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const COMPARABLE: &str = "java.lang.Comparable";
const COMPARATOR: &str = "java.util.Comparator";
const CLASSES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

fn subtype_of(context: &Context, name: &str, wanted: &str) -> bool {
    name == wanted || context.resolver.index.is_subtype(name, wanted)
}

fn both(context: &Context, name: &str) -> bool {
    subtype_of(context, name, COMPARABLE) && subtype_of(context, name, COMPARATOR)
}

/// The types written after `extends` and `implements` of a class, or after `extends` of an interface.
pub(super) fn written_supertypes<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let mut found = Vec::new();
    for clause in children(class) {
        if matches!(clause.kind(), "superclass" | "super_interfaces" | "extends_interfaces") {
            for part in children(clause) {
                if part.kind() == "type_list" {
                    found.extend(named_children(part));
                } else if part.is_named() && !part.kind().ends_with("comment") {
                    found.push(part);
                }
            }
        }
    }
    found
}

pub fn comparable_and_comparator(context: &Context, class: Node) {
    if !CLASSES.contains(&class.kind()) || class.kind() == "enum_declaration" {
        return;
    }
    let Some(name) = context.resolver.scope.names.get(&class.id()) else { return };
    if !both(context, name) {
        return;
    }
    for written in written_supertypes(class) {
        if let Some(Type::Class(parent, _)) = context.resolver.type_node(written) {
            if both(context, &parent) {
                return;
            }
        }
    }
    context.report_fixed("ComparableAndComparator", class, class_position(class), "Class should not implement both `Comparable` and `Comparator`", &[]);
}

fn is_long(kind: &Type) -> bool {
    matches!(kind, Type::Primitive("long")) || matches!(kind, Type::Class(name, _) if name == "java.lang.Long")
}

fn subtract_is_long(context: &Context, subtract: Node) -> Option<bool> {
    let left = context.resolver.type_of(subtract.child_by_field_name("left")?)?;
    let right = context.resolver.type_of(subtract.child_by_field_name("right")?)?;
    let kind = if left == right { left } else { context.resolver.type_of(subtract)? };
    Some(is_long(&kind))
}

fn public_method(method: Node, in_interface: bool) -> bool {
    has_modifier(method, "public") || (in_interface && !has_modifier(method, "private"))
}

fn return_type_is_int(context: &Context, method: Node) -> bool {
    method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "int")
}

pub fn bad_comparable(context: &Context, cast: Node) {
    if cast.kind() != "cast_expression" {
        return;
    }
    let (Some(kind), Some(value)) = (cast.child_by_field_name("type"), cast.child_by_field_name("value")) else { return };
    if context.text(kind) != "int" {
        return;
    }
    let subtract = unparenthesized(value);
    if subtract.kind() != "binary_expression" || subtract.child_by_field_name("operator").is_none_or(|operator| context.text(operator) != "-") {
        return;
    }
    if subtract_is_long(context, subtract) != Some(true) {
        return;
    }
    let Some(owner) = enclosing_type(context.file, context.resolver.scope, cast) else { return };
    if !subtype_of(context, &owner, COMPARABLE) && !subtype_of(context, &owner, COMPARATOR) {
        return;
    }
    let Some(method) = ancestor(cast, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]).filter(|method| method.kind() == "method_declaration") else { return };
    let Some(method_owner) = enclosing_type(context.file, context.resolver.scope, method) else { return };
    let interface = context.resolver.index.get(&method_owner).is_some_and(|info| info.is_interface);
    let name = method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let shape = public_method(method, interface) && return_type_is_int(context, method);
    let matched = shape && ((name == "compareTo" && formals(method).len() == 1) || (name == "compare" && formals(method).len() == 2));
    if !matched {
        return;
    }
    let (Some(left), Some(right)) = (subtract.child_by_field_name("left"), subtract.child_by_field_name("right")) else { return };
    let primitive = matches!(context.resolver.type_of(left), Some(Type::Primitive(_)));
    let replacement = if primitive {
        format!("Long.compare({}, {})", context.text(left), context.text(right))
    } else {
        format!("{}.compareTo({})", context.text(left), context.text(right))
    };
    let fix = Fix::replace(cast.start_byte(), cast.end_byte(), replacement);
    context.report_fixed("BadComparable", cast, cast.start_byte(), "Possible sign flip from narrowing conversion", &[fix]);
}
