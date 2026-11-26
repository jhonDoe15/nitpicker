//! SS_SHOULD_BE_STATIC: a final instance field set to a compile-time constant, which javac stores as the field's
//! constant value. Measured on test code: any class, nested and anonymous ones and enums too; only a primitive or
//! `String` field set to a constant expression; priority 2 whether the field is read or not, on the line of the
//! field's name.
use super::super::{Context, names, place};
use crate::engine::source::children;
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use tree_sitter::Node;

const PATTERN: &str = "SS_SHOULD_BE_STATIC";

fn constant(context: &Context, value: Node) -> bool {
    let mut uses = Vec::new();
    if value.kind() == "array_initializer" || !context.resolver.constant_shape(value, &mut uses) {
        return false;
    }
    let near = |_: &str| false;
    let own = crate::java::types::scope::enclosing_types(context.resolver.scope, value);
    uses.iter().all(|(owner, name)| {
        let index = context.resolver.index;
        if owner.is_empty() {
            own.iter().any(|class| index.constant_field(class, name, &near, true, 0))
        } else {
            index.constant_field(owner, name, &near, true, 0)
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
    for member in place::members(body).into_iter().filter(|member| member.kind() == "field_declaration") {
        if has_modifier(member, "static") || !has_modifier(member, "final") || class.kind() == "interface_declaration" {
            continue;
        }
        for declarator in declarators(member) {
            let simple = context.resolver.declared_type(member, Some(declarator)).is_some_and(|kind| matches!(kind, Type::Primitive(_)) || kind.name() == "java.lang.String");
            let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { continue };
            if !simple || !constant(context, value) {
                continue;
            }
            let field = format!("{binary}.{}", context.text(name));
            let message = format!("Unread field: {field}; should this field be static?");
            context.report_listed(PATTERN, declarator, context.line(name), message, format!("member:{field}"), 2, vec![field]);
        }
    }
}
