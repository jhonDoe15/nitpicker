//! Checks that ask what type the place of an expression wants.
use super::Context;
use super::values::value_name;
use crate::engine::source::parent;
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

const BOOLEAN: &str = "java.lang.Boolean";

fn boolean() -> Option<Type> {
    Some(Type::Primitive("boolean"))
}

fn is_boolean(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive("boolean")))
}

/// The type the place around an expression wants, as Error Prone's `TargetType` works it out.
pub fn target_type(context: &Context, expression: Node) -> Option<Type> {
    let mut inner = expression;
    let mut holder = parent(expression)?;
    while holder.kind() == "parenthesized_expression" {
        inner = holder;
        holder = parent(holder)?;
    }
    let field = |name: &str| holder.child_by_field_name(name) == Some(inner);
    let resolver = context.resolver;
    match holder.kind() {
        "if_statement" | "while_statement" | "do_statement" => boolean(),
        "for_statement" => field("condition").then(boolean).flatten(),
        "assert_statement" => {
            if holder.named_child(0) == Some(inner) { boolean() } else { Some(Type::class("java.lang.String")) }
        }
        "unary_expression" | "update_expression" => resolver.type_of(holder),
        "ternary_expression" if field("condition") => boolean(),
        "ternary_expression" => resolver.type_of(holder),
        "cast_expression" => resolver.type_node(holder.child_by_field_name("type")?),
        "instanceof_expression" | "synchronized_statement" => Some(Type::class(crate::java::types::model::OBJECT)),
        "assignment_expression" if field("right") => {
            let left = resolver.type_of(holder.child_by_field_name("left")?);
            let operator = holder.child_by_field_name("operator").map(|operator| context.text(operator));
            if operator == Some("=") { left } else { left.map(Type::unboxed_or_same) }
        }
        "binary_expression" => {
            let operator = context.text(holder.child_by_field_name("operator")?);
            let left = resolver.type_of(holder.child_by_field_name("left")?);
            let right = resolver.type_of(holder.child_by_field_name("right")?);
            let (own, other) = if field("left") { (left, right) } else { (right, left) };
            let string = |kind: &Option<Type>| kind.as_ref().is_some_and(|kind| kind.name() == "java.lang.String");
            match operator {
                "&&" | "||" => boolean(),
                "+" if string(&own) || string(&other) => Some(Type::class("java.lang.String")),
                "==" | "!=" => if is_boolean(&own) || is_boolean(&other) { boolean() } else { own },
                _ => own.map(Type::unboxed_or_same),
            }
        }
        _ => resolver.expected(expression),
    }
}

/// `Boolean.TRUE` where `true` says the same.
pub fn boolean_literal(context: &Context, node: Node) {
    let (name, at) = match node.kind() {
        "field_access" => {
            let Some(object) = node.child_by_field_name("object") else { return };
            let Some(field) = node.child_by_field_name("field") else { return };
            let name = context.text(field);
            if !matches!(name, "TRUE" | "FALSE") || !matches!(context.resolver.receiver(object), Some(Receiver::Static(class)) if class == BOOLEAN) {
                return;
            }
            let dot = crate::engine::source::children(node).into_iter().rfind(|part| part.kind() == ".");
            (name, dot.map_or(node.start_byte(), |dot| dot.start_byte()))
        }
        "identifier" => {
            let name = context.text(node);
            let imported = context.resolver.scope.static_single.get(name).is_some_and(|owners| owners.iter().any(|owner| owner == BOOLEAN));
            if !matches!(name, "TRUE" | "FALSE") || !imported || !value_name(node) || context.resolver.is_variable(node, name) {
                return;
            }
            (name, node.start_byte())
        }
        _ => return,
    };
    let _ = name;
    const TEXT: &str = "This expression can be written more clearly with a boolean literal.";
    let Some(holder) = parent(node) else { return };
    if holder.kind() == "method_reference" {
        return;
    }
    if holder.kind() == "method_invocation" && holder.child_by_field_name("object") == Some(node) {
        let called = holder.child_by_field_name("name").map(|name| context.text(name));
        if matches!(called, Some("toString" | "booleanValue")) {
            context.report("BooleanLiteral", node, at, TEXT);
        }
        return;
    }
    if holder.kind() == "field_access" {
        return;
    }
    match target_type(context, node) {
        None | Some(Type::Variable(_)) => {}
        Some(Type::Class(class, _)) if class == BOOLEAN => {}
        Some(_) => context.report("BooleanLiteral", node, at, TEXT),
    }
}
