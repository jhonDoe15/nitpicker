//! NP_BOOLEAN_RETURN_NULL and NP_OPTIONAL_RETURN_NULL (BooleanReturnNull, OptionalReturnNull): a method or lambda
//! declared to return `Boolean`, or `java.util.Optional` or Guava's `Optional`, gives back the literal `null`.
//!
//! As measured, SpotBugs reports a `null` that the compiled code hands straight to the return: `return null`,
//! the last arm of `?:` (the arm javac keeps when the condition is constant), the last case of a `switch`
//! expression and the body of a lambda. A `null` returned through a variable or a cast, the first arm of `?:`,
//! an earlier case, and a `return` that leaves a `try` with a non-empty `finally`, a `try` with resources or a
//! `synchronized` block (code runs between the value and the return) are
//! not reported, nor is a method whose result is declared nullable (`@CheckForNull` or a nickname for it, also
//! inherited, or JSR-305 or SpotBugs `@Nullable` on the method itself). One finding per method, on the line of
//! the first such return. For `Boolean`, high priority for a method whose name starts with `is`; an `Optional` is always
//! high priority. `OptionalInt`, `OptionalLong` and `OptionalDouble` do not count.
use super::super::{Context, folds, names, nulls, place};
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

pub const PATTERN: &str = "NP_BOOLEAN_RETURN_NULL";
pub const OPTIONAL: &str = "NP_OPTIONAL_RETURN_NULL";

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
fn direct_null(context: &Context, node: Node) -> bool {
    let node = unwrapped(node);
    match node.kind() {
        "null_literal" => true,
        "ternary_expression" => {
            let chosen = folds::fixed(context, node.child_by_field_name("condition"));
            let arm = if chosen == Some(true) { "consequence" } else { "alternative" };
            node.child_by_field_name(arm).is_some_and(|arm| direct_null(context, arm))
        }
        "switch_expression" => last_case_null(context, node),
        _ => false,
    }
}

fn last_case_null(context: &Context, switch: Node) -> bool {
    let Some(block) = switch.child_by_field_name("body") else { return false };
    let Some(last) = named_children(block).into_iter().filter(|part| part.kind().starts_with("switch_")).last() else { return false };
    let parts: Vec<Node> = named_children(last).into_iter().filter(|part| part.kind() != "switch_label").collect();
    match parts.last() {
        Some(part) if part.kind() == "expression_statement" => last.kind() == "switch_rule" && named_children(*part).first().is_some_and(|inner| direct_null(context, *inner)),
        Some(part) if part.kind() == "block" => named_children(*part).last().is_some_and(|last| yields_null(context, *last)),
        Some(part) if last.kind() == "switch_rule" => direct_null(context, *part),
        Some(part) => yields_null(context, *part),
        None => false,
    }
}

fn yields_null(context: &Context, statement: Node) -> bool {
    statement.kind() == "yield_statement" && named_children(statement).into_iter().next().is_some_and(|value| direct_null(context, value))
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
        let finally = children(at).into_iter().any(|part| part.kind() == "finally_clause" && named_children(part).iter().any(|block| children(*block).iter().any(|code| !matches!(code.kind(), "{" | "}") && !code.kind().ends_with("comment"))));
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
            if value.is_some_and(|value| direct_null(context, value)) && !leaves_through_cleanup(part, top) {
                return Some(part);
            }
        }
        if let Some(found) = first_return(context, part, top) {
            return Some(found);
        }
    }
    None
}

/// The pattern for a declared result type, with the word SpotBugs' message names it by.
fn pattern_of(kind: Option<Type>) -> Option<(&'static str, &'static str)> {
    match kind {
        Some(Type::Class(name, _)) if name == "java.lang.Boolean" => Some((PATTERN, "Boolean")),
        Some(Type::Class(name, _)) if name == "java.util.Optional" || name == "com.google.common.base.Optional" => Some((OPTIONAL, "Optional")),
        _ => None,
    }
}

pub fn boolean_null<'a>(context: &Context<'a>, own: &str, node: Node<'a>) {
    let Some(body) = node.child_by_field_name("body") else { return };
    let Some((pattern, word)) = pattern_of(context.resolver.returned_type(body)) else { return };
    if !context.wants(&[pattern]) {
        return;
    }
    let found = if body.kind() == "block" { first_return(context, body, body) } else { direct_null(context, body).then_some(body) };
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
    let priority = if pattern == OPTIONAL || named.is_some_and(|name| name.starts_with("is")) { 1 } else { 2 };
    let message = format!("{label} has {word} return type and returns explicit null");
    context.report_placed(pattern, found, context.line(found), message, place::function(&label), priority);
}
