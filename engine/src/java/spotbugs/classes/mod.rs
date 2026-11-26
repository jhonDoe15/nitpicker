//! Patterns about the shape of a class as a whole: its supertypes, constructors and special methods.
mod clones;
mod lines;
mod singletons;

use super::{Context, place};
use crate::engine::source::children;
use crate::java::helpers::{declarators, has_modifier};
use tree_sitter::Node;

/// What the class patterns share about one class.
pub struct Shape<'t> {
    pub class: Node<'t>,
    pub own: String,
    pub members: Vec<Node<'t>>,
    /// The private static fields declared with the class's own type.
    pub statics: Vec<String>,
    pub first_line: Option<usize>,
}

pub fn class_shape(context: &Context, class: Node) {
    if !context.wants(singletons::PATTERNS) && !context.wants(clones::PATTERNS) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let members = place::members(body);
    let mut statics = Vec::new();
    for member in members.iter().filter(|member| member.kind() == "field_declaration" && has_modifier(**member, "static") && has_modifier(**member, "private")) {
        for declarator in declarators(*member) {
            let typed = context.resolver.declared_type(*member, Some(declarator)).is_some_and(|kind| kind.erased().name() == own);
            if let Some(name) = declarator.child_by_field_name("name").filter(|_| typed) {
                statics.push(context.text(name).to_string());
            }
        }
    }
    let first_line = lines::class_first(context, &own, class, &members);
    let shape = Shape { class, own, members, statics, first_line };
    singletons::check(context, &shape);
    clones::check(context, &shape);
}
