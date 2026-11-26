//! Patterns that judge one method as a whole from its declaration and what it returns or dereferences:
//! NP_BOOLEAN_RETURN_NULL and NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT.
mod booleans;
mod equals;

use super::Context;
use crate::engine::source::children;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

/// The methods and lambdas of a class, without those of classes declared inside it.
fn bodies<'a>(node: Node<'a>, out: &mut Vec<Node<'a>>) {
    for part in children(node) {
        if part.kind() == "class_body" || part.kind() == "enum_body" || TYPE_DECLARATIONS.contains(&part.kind()) {
            continue;
        }
        if matches!(part.kind(), "method_declaration" | "lambda_expression") {
            out.push(part);
        }
        bodies(part, out);
    }
}

/// The class body of a declaration or of the `new` expression or enum constant carrying an anonymous class.
fn body_of(class: Node) -> Option<Node> {
    class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))
}

pub fn method_patterns<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(&[booleans::PATTERN, equals::PATTERN]) {
        return;
    }
    let Some(body) = body_of(class) else { return };
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let mut found = Vec::new();
    for member in children(body) {
        if member.kind() == "enum_body_declarations" {
            children(member).into_iter().for_each(|inner| collect(inner, &mut found));
        } else {
            collect(member, &mut found);
        }
    }
    for node in found {
        booleans::boolean_null(context, own, node);
        if node.kind() == "method_declaration" {
            equals::equals_null(context, own, node);
        }
    }
}

fn collect<'a>(member: Node<'a>, found: &mut Vec<Node<'a>>) {
    if TYPE_DECLARATIONS.contains(&member.kind()) {
        return;
    }
    if member.kind() == "method_declaration" {
        found.push(member);
    }
    bodies(member, found);
}
