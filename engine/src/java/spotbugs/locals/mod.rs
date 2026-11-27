//! Patterns about the local variables of one method: SA_LOCAL_SELF_ASSIGNMENT and
//! SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD (FindLocalSelfAssignment2, see `assign`).
mod assign;
mod lambdas;

use super::Context;
use crate::engine::source::{children, parent};
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[assign::SELF, assign::INSTEAD_OF_FIELD];

/// The members of a class, an enum, a record, an interface or an anonymous class.
fn members(class: Node) -> Vec<Node> {
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    let Some(body) = body else { return Vec::new() };
    let mut found = children(body);
    found.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    found
}

/// Whether a node is the body of a class of its own: a declaration, or the body of an anonymous class.
fn nested(node: Node) -> bool {
    match node.kind() {
        "class_body" => parent(node).is_some_and(|holder| holder.kind() == "object_creation_expression"),
        kind => crate::java::types::scope::TYPE_DECLARATIONS.contains(&kind),
    }
}

pub fn locals<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    for member in members(class) {
        assign::member(context, own, class, member);
    }
}
