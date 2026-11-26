//! SS_SHOULD_BE_STATIC: a final instance field set to a compile-time constant, which javac stores as the field's
//! constant value. Measured on test code: any class, nested and anonymous ones and enums too; only a primitive or
//! `String` field set to a constant expression; priority 2 whether the field is read or not, on the first line of the
//! field's declaration, annotations included. A constant may be built from other such fields of the class.
use super::super::{Context, names, place};
use crate::engine::source::children;
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use std::collections::HashMap;
use tree_sitter::Node;

const PATTERN: &str = "SS_SHOULD_BE_STATIC";

/// The final instance fields of a class body that are a primitive or a `String`, with their initial values.
type Own<'t> = HashMap<String, Node<'t>>;

fn constant(context: &Context, value: Node, own_fields: &Own, depth: usize) -> bool {
    let mut uses = Vec::new();
    if depth > 12 || value.kind() == "array_initializer" || !context.resolver.constant_shape(value, &mut uses) {
        return false;
    }
    let near = |_: &str| false;
    let own = crate::java::types::scope::enclosing_types(context.resolver.scope, value);
    uses.iter().all(|(owner, name)| {
        let index = context.resolver.index;
        if !owner.is_empty() {
            return index.constant_field(owner, name, &near, true, 0);
        }
        match own_fields.get(name) {
            Some(initial) => constant(context, *initial, own_fields, depth + 1),
            None => own.iter().any(|class| index.constant_field(class, name, &near, true, 0)),
        }
    })
}

pub fn should_be_static(context: &Context, class: Node) {
    if !context.wants(&[PATTERN]) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let binary = names::binary(context, &own);
    let fields: Vec<Node> = place::members(body)
        .into_iter()
        .filter(|member| member.kind() == "field_declaration" && !has_modifier(*member, "static") && has_modifier(*member, "final"))
        .collect();
    let simple = |member: Node, declarator: Node| {
        let kind = context.resolver.declared_type(member, Some(declarator));
        kind.is_some_and(|kind| matches!(kind, Type::Primitive(_)) || kind.name() == "java.lang.String")
    };
    let mut own_fields = Own::new();
    for &member in &fields {
        for declarator in declarators(member).into_iter().filter(|declarator| simple(member, *declarator)) {
            if let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) {
                own_fields.insert(context.text(name).to_string(), value);
            }
        }
    }
    if class.kind() == "interface_declaration" {
        return;
    }
    for &member in &fields {
        for declarator in declarators(member) {
            let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { continue };
            if !simple(member, declarator) || context.suppressed_by_methods(PATTERN, member) || !constant(context, value, &own_fields, 0) {
                continue;
            }
            let field = format!("{binary}.{}", context.text(name));
            let message = format!("Unread field: {field}; should this field be static?");
            context.report_listed(PATTERN, declarator, context.line(member), message, format!("member:{field}"), 2, vec![field]);
        }
    }
}
