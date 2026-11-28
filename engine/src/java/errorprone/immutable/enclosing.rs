//! The enclosing instances of a class: the classes whose `this` it can reach.
use super::super::Context;
use super::classes::{declaration_name, own_type};
use crate::engine::source::parent;
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub(super) use super::super::classes3::references_outer;

const CLASSES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

/// The declaration whose instance holds this class, when it has one.
fn instance_owner<'t>(context: &Context, class: Node<'t>) -> Option<Node<'t>> {
    if matches!(class.kind(), "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration") || has_modifier(class, "static") {
        return None;
    }
    let mut fixed = false;
    let mut current = parent(class)?;
    loop {
        match current.kind() {
            "method_declaration" | "field_declaration" | "constructor_declaration" | "static_initializer" | "enum_constant" => {
                fixed |= matches!(current.kind(), "static_initializer" | "enum_constant") || has_modifier(current, "static");
            }
            "class_body" | "interface_body" | "enum_body" | "annotation_type_body" => {
                let owner = parent(current)?;
                let member = parent(class).is_some_and(|above| above.id() == current.id());
                if fixed || matches!(owner.kind(), "interface_declaration" | "annotation_type_declaration") && member {
                    return None;
                }
                return (CLASSES.contains(&owner.kind()) || owner.kind() == "object_creation_expression").then_some(owner).filter(|owner| declaration_name(context, *owner).is_some());
            }
            _ => {}
        }
        current = parent(current)?;
    }
}

/// The types of the enclosing instances of a class, nearest first.
pub fn instance_chain(context: &Context, class: Node) -> Vec<Type> {
    let mut found = Vec::new();
    let mut current = class;
    while let Some(owner) = instance_owner(context, current) {
        let Some(info) = declaration_name(context, owner).and_then(|name| context.resolver.index.get(&name)) else { break };
        found.push(own_type(info));
        current = owner;
    }
    found
}
