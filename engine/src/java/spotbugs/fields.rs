//! Every value the file stores in a field.
use super::Context;
use crate::engine::source::{parent, walk};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use std::collections::HashMap;
use tree_sitter::Node;

pub struct Stored<'a> {
    pub value: Node<'a>,
    /// The class the store is written in.
    pub by: String,
}

/// Stores by declaring class and field name.
pub type StoredMap<'a> = HashMap<(String, String), Vec<Stored<'a>>>;

/// The declaring class and name of the field a name or an `object.name` expression stands for.
pub fn field_key(context: &Context, usage: Node) -> Option<(String, String)> {
    let index = context.resolver.index;
    match usage.kind() {
        "identifier" => match context.resolver.binding(usage, context.text(usage)) {
            Some(Binding::Field(_, declaring, field)) => Some((declaring.name.clone(), field.name.clone())),
            _ => None,
        },
        "field_access" => {
            let holder = usage.child_by_field_name("object").and_then(|object| match object.kind() {
                "this" => enclosing_types(context.resolver.scope, object).into_iter().next(),
                _ => match context.resolver.receiver(object) {
                    Some(Receiver::Value(Type::Class(class, _)) | Receiver::Static(class)) => Some(class.to_string()),
                    _ => None,
                },
            });
            let name = usage.child_by_field_name("field").map(|field| context.text(field));
            holder.zip(name).and_then(|(holder, name)| index.field(&holder, name)).map(|(declaring, field)| (declaring.name.clone(), field.name.clone()))
        }
        _ => None,
    }
}

pub fn stored<'a>(context: &Context<'a>) -> StoredMap<'a> {
    let mut found: StoredMap<'a> = HashMap::new();
    let scope = context.resolver.scope;
    walk(context.file.tree.root_node(), |node| match node.kind() {
        "variable_declarator" if parent(node).is_some_and(|holder| holder.kind() == "field_declaration") => {
            let class = enclosing_types(scope, node).into_iter().next();
            if let (Some(class), Some(name), Some(value)) = (class, node.child_by_field_name("name"), node.child_by_field_name("value")) {
                found.entry((class.clone(), context.text(name).to_string())).or_default().push(Stored { value, by: class });
            }
        }
        "assignment_expression" => {
            let (Some(left), Some(value)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
            let by = enclosing_types(scope, node).into_iter().next();
            if let (Some(key), Some(by)) = (field_key(context, left), by) {
                found.entry(key).or_default().push(Stored { value, by });
            }
        }
        _ => {}
    });
    found
}
