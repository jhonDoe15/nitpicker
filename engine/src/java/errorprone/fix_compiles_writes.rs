//! Helpers of `fix_compiles`: writes to a field of the class being read, and MutableGuiceModule's mutable field types.
use super::Context;
use super::immutable_known::MUTABLE;
use crate::engine::source::walk;
use crate::java::types::expr::Binding;
use tree_sitter::Node;

/// The field `name` of the object being built, written as the name alone or as `this.name`.
fn own_field(context: &Context, target: Node, name: &str) -> bool {
    match target.kind() {
        "identifier" => context.text(target) == name && matches!(context.resolver.binding(target, name), Some(Binding::Field(..))),
        "field_access" => {
            target.child_by_field_name("object").is_some_and(|object| object.kind() == "this")
                && target.child_by_field_name("field").is_some_and(|field| context.text(field) == name)
        }
        "parenthesized_expression" => target.named_child(0).is_some_and(|inner| own_field(context, inner, name)),
        _ => false,
    }
}

/// Whether an identifier stands for the field `name` of the object being built: `name` alone, not a local, or the
/// field of `this.name`.
pub fn refers(context: &Context, identifier: Node, name: &str) -> bool {
    if identifier.kind() != "identifier" || context.text(identifier) != name {
        return false;
    }
    match crate::engine::source::parent(identifier) {
        Some(up) if up.kind() == "field_access" && up.child_by_field_name("field").is_some_and(|field| field.id() == identifier.id()) => {
            own_field(context, up, name)
        }
        Some(up) if up.child_by_field_name("name").is_some_and(|named| named.id() == identifier.id()) => false,
        _ => own_field(context, identifier, name),
    }
}

/// Whether a statement is `name = value;` or `this.name = value;` for the field.
pub fn assigns(context: &Context, statement: Node, name: &str) -> bool {
    statement.kind() == "expression_statement"
        && statement.named_child(0).is_some_and(|expression| {
            expression.kind() == "assignment_expression"
                && expression.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=")
                && expression.child_by_field_name("left").is_some_and(|left| own_field(context, left, name))
        })
}

/// Whether the code of the class under `node` assigns, increments or decrements its field `name`, as the name alone or
/// as `this.name`. Nested classes have fields of their own; their writes to this one are in the project's field uses.
pub fn writes(context: &Context, node: Node, name: &str) -> bool {
    let mut found = false;
    let mut nested = Vec::new();
    walk(node, |part| {
        if part.id() != node.id() && (part.kind() == "class_body" || crate::java::types::scope::TYPE_DECLARATIONS.contains(&part.kind())) {
            nested.push(part.byte_range());
        }
        let target = match part.kind() {
            "assignment_expression" => part.child_by_field_name("left"),
            "update_expression" => part.named_child(0),
            _ => None,
        };
        let Some(target) = target else { return };
        if !nested.iter().any(|range| range.contains(&part.start_byte())) {
            found |= own_field(context, target, name);
        }
    });
    found
}

/// Whether the code under `node`, outside the bodies of classes declared in it, names the field: javac's definite
/// assignment reads those uses, lambda bodies included.
pub fn mentioned_directly(context: &Context, node: Node, name: &str) -> bool {
    let mut found = false;
    let mut nested = Vec::new();
    walk(node, |part| {
        if part.kind() == "class_body" {
            nested.push(part.byte_range());
        }
        if !nested.iter().any(|range| range.contains(&part.start_byte())) {
            found |= refers(context, part, name);
        }
    });
    found
}

/// MutableGuiceModule's second message: the field's type, as Error Prone prints it, when its class is one
/// `WellKnownMutability` knows to be mutable.
pub fn known_mutable(context: &Context, field: Node, declarator: Node) -> Option<String> {
    let kind = context.resolver.declared_type(field, Some(declarator))?;
    let crate::java::types::model::Type::Class(name, _) = &kind else { return None };
    if !MUTABLE.contains(&name.as_str()) {
        return None;
    }
    Some(super::object_to_string::pretty(context, field, &kind))
}
