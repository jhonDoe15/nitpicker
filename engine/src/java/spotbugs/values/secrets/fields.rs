//! What reading a string field gives, as SpotBugs sums up the stores of a field: the one string constant every store
//! of the file puts there, `null` for an instance field nothing but `null` is stored in (fields left unset start as
//! `null`), and nothing for a public field, a static field without stores or a field of a class of another file.
use super::super::super::Context;
use super::Hard;
use crate::engine::source::walk;
use crate::java::helpers::has_modifier;
use crate::java::types::expr::{Binding, Receiver, unwrap};
use crate::java::types::model::{Type, flag};
use std::collections::HashMap;
use tree_sitter::Node;

pub struct Summaries {
    stores: HashMap<(String, String), Vec<Hard>>,
}

/// The class and name of the field an assignment target or a read names.
pub fn field_of(context: &Context, node: Node) -> Option<(String, String, Type, u32)> {
    let node = unwrap(node);
    let resolver = context.resolver;
    match node.kind() {
        "identifier" => match resolver.binding(node, context.text(node))? {
            Binding::Field(_, info, field) => Some((info.name.clone(), field.name.clone(), field.kind.clone(), field.flags)),
            Binding::Local(_) => None,
        },
        "field_access" => {
            let name = context.text(node.child_by_field_name("field")?);
            let owner = match resolver.receiver(node.child_by_field_name("object")?)? {
                Receiver::Static(owner) | Receiver::Value(Type::Class(owner, _)) => owner,
                _ => return None,
            };
            let (info, field) = resolver.index.field(&owner, name)?;
            Some((info.name.clone(), field.name.clone(), field.kind.clone(), field.flags))
        }
        _ => None,
    }
}

fn stored(context: &Context, value: Node) -> Hard {
    let value = unwrap(value);
    if value.kind() == "null_literal" {
        return Hard::Null;
    }
    context.resolver.constant_string(value).map_or(Hard::No, |text| Hard::Text(Some(text)))
}

impl Summaries {
    pub fn of(context: &Context) -> Summaries {
        let mut stores: HashMap<(String, String), Vec<Hard>> = HashMap::new();
        walk(context.file.tree.root_node(), |node| match node.kind() {
            "field_declaration" => {
                let Some(own) = crate::java::types::scope::enclosing_types(context.resolver.scope, node).into_iter().next() else { return };
                let body = node.parent().map(|body| body.kind()).unwrap_or_default();
                let instance = !has_modifier(node, "static") && !matches!(body, "interface_body" | "annotation_type_body");
                for declarator in crate::engine::source::children(node).into_iter().filter(|part| part.kind() == "variable_declarator") {
                    let Some(name) = declarator.child_by_field_name("name") else { continue };
                    let held = match declarator.child_by_field_name("value") {
                        Some(value) => stored(context, value),
                        None if instance => Hard::Null,
                        None => continue,
                    };
                    stores.entry((own.clone(), context.text(name).to_string())).or_default().push(held);
                }
            }
            "assignment_expression" => {
                let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
                let Some((class, name, _, _)) = field_of(context, left) else { return };
                let operator = node.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or("=");
                let held = if operator == "=" { stored(context, right) } else { Hard::No };
                stores.entry((class, name)).or_default().push(held);
            }
            _ => {}
        });
        Summaries { stores }
    }

    /// What reading a string field gives.
    pub fn read(&self, context: &Context, class: &str, name: &str, flags: u32) -> Hard {
        if flags & flag::PUBLIC != 0 || !context.classes.contains_key(class) {
            return Hard::No;
        }
        let Some(stores) = self.stores.get(&(class.to_string(), name.to_string())) else {
            return if flags & flag::STATIC != 0 { Hard::No } else { Hard::Null };
        };
        let Some(first) = stores.first() else { return Hard::No };
        if stores.iter().all(|store| store == first) && *first != Hard::No { first.clone() } else { Hard::No }
    }
}
