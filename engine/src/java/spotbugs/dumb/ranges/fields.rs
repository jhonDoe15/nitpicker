//! Which fields of a class something other than the written stores may set before a read.
use super::super::super::Context;
use crate::engine::source::{children, named_children};
use crate::java::types::expr::unwrap;
use tree_sitter::Node;

const LOMBOK_WRITERS: &[&str] = &["Setter", "Data", "Builder", "SuperBuilder", "AllArgsConstructor", "With", "Wither"];

/// Whether Lombok writes methods or constructors that store parameters into a field that is not `final`.
pub fn lombok_sets(context: &Context, class: Node, member: Node) -> bool {
    [class, member].into_iter().any(|holder| {
        let modifiers = children(holder).into_iter().find(|part| part.kind() == "modifiers");
        modifiers.is_some_and(|modifiers| {
            named_children(modifiers).into_iter().any(|annotation| {
                let name = annotation.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
                matches!(annotation.kind(), "marker_annotation" | "annotation") && LOMBOK_WRITERS.contains(&name.rsplit('.').next().unwrap_or(name))
            })
        })
    })
}

/// Whether every constructor (or a static initializer, for a static field) sets a field in a statement of its own
/// body, so that its default value never reaches a reader.
pub fn always_set(context: &Context, body: Node, name: &str, statics: bool) -> bool {
    let sets = |block: Node| {
        named_children(block).into_iter().any(|statement| {
            let assignment = statement.named_child(0).filter(|inner| statement.kind() == "expression_statement" && inner.kind() == "assignment_expression");
            assignment.and_then(|inner| inner.child_by_field_name("left")).is_some_and(|left| {
                let left = unwrap(left);
                let named = if left.kind() == "field_access" { left.child_by_field_name("field") } else { Some(left) };
                named.is_some_and(|named| named.kind() == "identifier" && context.text(named) == name)
            })
        })
    };
    let members = children(body);
    if statics {
        return members.iter().any(|member| member.kind() == "static_initializer" && member.named_child(0).is_some_and(sets));
    }
    let constructors: Vec<Node> = members.into_iter().filter(|member| member.kind() == "constructor_declaration").collect();
    !constructors.is_empty()
        && constructors.into_iter().all(|constructor| {
            let Some(block) = constructor.child_by_field_name("body") else { return false };
            let first = named_children(block).into_iter().next();
            let this = |first: Node| first.child_by_field_name("constructor").is_some_and(|call| call.kind() == "this");
            let delegates = first.is_some_and(|first| first.kind() == "explicit_constructor_invocation" && this(first));
            delegates || sets(block)
        })
}

