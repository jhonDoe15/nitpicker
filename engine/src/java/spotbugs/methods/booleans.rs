//! NP_BOOLEAN_RETURN_NULL: a method or lambda declared to return `Boolean` gives back the literal `null`.
//!
//! As measured, SpotBugs reports a `null` that the compiled code hands straight to the return: `return null`,
//! the last arm of `?:`, the last case of a `switch` expression and the body of a lambda. A `null` returned
//! through a variable or a cast, the first arm of `?:`, an earlier case, and a `return` that leaves a `try` with
//! `finally`, a `try` with resources or a `synchronized` block (code runs between the value and the return) are
//! not reported, nor is a method whose result is declared nullable (`@CheckForNull` or a nickname for it, also
//! inherited, or JSR-305 or SpotBugs `@Nullable` on the method itself). One finding per method, on the line of
//! the first such return. High priority for a method whose name starts with `is`.
use super::super::{Context, names, nulls, place};
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

pub const PATTERN: &str = "NP_BOOLEAN_RETURN_NULL";

fn unwrapped(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        match named_children(node).into_iter().next() {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

/// Whether the value goes straight to the return when it is `null`.
fn direct_null(node: Node) -> bool {
    let node = unwrapped(node);
    match node.kind() {
        "null_literal" => true,
        "ternary_expression" => node.child_by_field_name("alternative").is_some_and(direct_null),
        "switch_expression" => last_case_null(node),
        _ => false,
    }
}

fn last_case_null(switch: Node) -> bool {
    let Some(block) = switch.child_by_field_name("body") else { return false };
    let Some(last) = named_children(block).into_iter().filter(|part| part.kind().starts_with("switch_")).last() else { return false };
    let parts: Vec<Node> = named_children(last).into_iter().filter(|part| part.kind() != "switch_label").collect();
    match parts.last() {
        Some(part) if part.kind() == "expression_statement" => last.kind() == "switch_rule" && named_children(*part).first().is_some_and(|inner| direct_null(*inner)),
        Some(part) if part.kind() == "block" => named_children(*part).last().is_some_and(|last| yields_null(*last)),
        Some(part) if last.kind() == "switch_rule" => direct_null(*part),
        Some(part) => yields_null(*part),
        None => false,
    }
}

fn yields_null(statement: Node) -> bool {
    statement.kind() == "yield_statement" && named_children(statement).into_iter().next().is_some_and(direct_null)
}

/// Whether code runs between the value of a `return` and the return itself: a `finally`, the closing of
/// resources, or the release of a lock, on the way out of `top`.
fn leaves_through_cleanup(statement: Node, top: Node) -> bool {
    let mut inner = statement;
    let mut current = parent(statement);
    while let Some(at) = current {
        if at.id() == top.id() {
            return false;
        }
        let finally = children(at).into_iter().any(|part| part.kind() == "finally_clause");
        let in_finally = inner.kind() == "finally_clause";
        match at.kind() {
            "try_statement" if finally && !in_finally => return true,
            "try_with_resources_statement" if !in_finally && inner.kind() != "catch_clause" => return true,
            "try_with_resources_statement" if finally && !in_finally => return true,
            "synchronized_statement" if inner.kind() == "block" => return true,
            _ => {}
        }
        inner = at;
        current = parent(at);
    }
    false
}

fn first_return<'a>(context: &Context<'a>, node: Node<'a>, top: Node<'a>) -> Option<Node<'a>> {
    for part in children(node) {
        if part.kind() == "lambda_expression" || part.kind() == "class_body" || TYPE_DECLARATIONS.contains(&part.kind()) {
            continue;
        }
        if part.kind() == "return_statement" {
            let value = named_children(part).into_iter().find(|inner| !inner.kind().ends_with("comment"));
            if value.is_some_and(direct_null) && !leaves_through_cleanup(part, top) {
                return Some(part);
            }
        }
        if let Some(found) = first_return(context, part, top) {
            return Some(found);
        }
    }
    None
}

fn boolean(kind: Option<Type>) -> bool {
    matches!(kind, Some(Type::Class(name, _)) if name == "java.lang.Boolean")
}

pub fn boolean_null<'a>(context: &Context<'a>, own: &str, node: Node<'a>) {
    let Some(body) = node.child_by_field_name("body") else { return };
    if !boolean(context.resolver.returned_type(body)) {
        return;
    }
    let found = if body.kind() == "block" { first_return(context, body, body) } else { direct_null(body).then_some(body) };
    let Some(found) = found else { return };
    if node.kind() == "method_declaration" && nulls::declared_nullable(context, own, node) {
        return;
    }
    let label = match node.kind() {
        "lambda_expression" => names::lambda(context, node),
        _ => Some(names::method(context, own, node, None)),
    };
    let Some(label) = label else { return };
    let named = node.child_by_field_name("name").filter(|_| node.kind() == "method_declaration").map(|name| context.text(name));
    let priority = if named.is_some_and(|name| name.starts_with("is")) { 1 } else { 2 };
    let message = format!("{label} has Boolean return type and returns explicit null");
    context.report_placed(PATTERN, found, context.line(found), message, place::function(&label), priority);
}
