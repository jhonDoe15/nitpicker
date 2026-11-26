//! A small stand-in for Error Prone's nullness dataflow: whether a name is known not to be null where it is compared.
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::expr::unwrap;
use tree_sitter::Node;

fn is_null(node: Node) -> bool {
    node.kind() == "null_literal"
}

fn operator<'c>(context: &'c Context, binary: Node) -> Option<&'c str> {
    binary.child_by_field_name("operator").map(|operator| context.text(operator))
}

/// The tests of the condition that hold when it is true (`all`) or when it is false (`!all`): `key != null` or `key == null`.
fn tests_hold(context: &Context, condition: Node, key: &str, nonnull_when_true: bool) -> bool {
    let condition = unwrap(condition);
    if condition.kind() == "unary_expression" && condition.child(0).is_some_and(|sign| sign.kind() == "!") {
        return condition.named_child(0).is_some_and(|inner| tests_hold(context, inner, key, !nonnull_when_true));
    }
    if condition.kind() == "instanceof_expression" {
        return nonnull_when_true && condition.named_child(0).is_some_and(|left| context.text(left) == key);
    }
    if condition.kind() != "binary_expression" {
        return false;
    }
    let (Some(left), Some(right), Some(own)) = (condition.child_by_field_name("left"), condition.child_by_field_name("right"), operator(context, condition)) else { return false };
    let joined = if nonnull_when_true { "&&" } else { "||" };
    if own == joined {
        return tests_hold(context, left, key, nonnull_when_true) || tests_hold(context, right, key, nonnull_when_true);
    }
    let wanted = if nonnull_when_true { "!=" } else { "==" };
    own == wanted && ((context.text(left) == key && is_null(right)) || (context.text(right) == key && is_null(left)))
}

fn exits(node: Node) -> bool {
    match node.kind() {
        "return_statement" | "throw_statement" | "continue_statement" | "break_statement" => true,
        "block" => named_children(node).into_iter().rev().find(|part| !part.kind().ends_with("comment")).is_some_and(exits),
        _ => false,
    }
}

fn derefs(context: &Context, node: Node, key: &str) -> bool {
    match node.kind() {
        "lambda_expression" | "class_body" | "switch_expression" | "ternary_expression" => false,
        "field_access" if node.child_by_field_name("object").is_some_and(|object| context.text(object) == key) => true,
        "method_invocation" if node.child_by_field_name("object").is_some_and(|object| context.text(object) == key) => true,
        "array_access" if node.child_by_field_name("array").is_some_and(|array| context.text(array) == key) => true,
        "binary_expression" if matches!(operator(context, node), Some("&&" | "||")) => node.child_by_field_name("left").is_some_and(|left| derefs(context, left, key)),
        "if_statement" | "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement" | "try_statement" | "block" | "switch_statement" | "labeled_statement" => {
            let first = if node.kind() == "do_statement" { None } else { node.child_by_field_name("condition").or_else(|| node.child_by_field_name("value")) };
            first.is_some_and(|condition| derefs(context, condition, key))
        }
        _ => children(node).into_iter().any(|part| derefs(context, part, key)),
    }
}

fn checks_after(context: &Context, statement: Node, key: &str) -> bool {
    match statement.kind() {
        "if_statement" => {
            let guard = statement.child_by_field_name("condition").is_some_and(|condition| tests_hold(context, condition, key, false));
            guard && statement.child_by_field_name("consequence").is_some_and(exits) && statement.child_by_field_name("alternative").is_none()
        }
        "expression_statement" => named_children(statement).into_iter().any(|call| {
            call.kind() == "method_invocation"
                && call.child_by_field_name("name").is_some_and(|name| matches!(context.text(name), "requireNonNull" | "checkNotNull" | "verifyNotNull"))
                && call.child_by_field_name("arguments").and_then(|list| list.named_child(0)).is_some_and(|first| context.text(first) == key)
        }),
        "assert_statement" => statement.named_child(0).is_some_and(|condition| tests_hold(context, condition, key, true)),
        _ => false,
    }
}

fn assigns(context: &Context, statement: Node, key: &str) -> bool {
    let mut found = false;
    crate::engine::source::walk(statement, |part| {
        found |= match part.kind() {
            "assignment_expression" => part.child_by_field_name("left").is_some_and(|left| context.text(left) == key),
            "variable_declarator" => part.child_by_field_name("name").is_some_and(|name| context.text(name) == key),
            _ => false,
        };
    });
    found
}

fn fresh(node: Node) -> bool {
    matches!(unwrap(node).kind(), "object_creation_expression" | "string_literal" | "array_creation_expression" | "this")
}

fn assigns_fresh(context: &Context, statement: Node, key: &str) -> bool {
    named_children(statement).into_iter().chain(std::iter::once(statement)).any(|part| match part.kind() {
        "assignment_expression" => part.child_by_field_name("left").is_some_and(|left| context.text(left) == key) && part.child_by_field_name("right").is_some_and(fresh),
        "variable_declarator" => part.child_by_field_name("name").is_some_and(|name| context.text(name) == key) && part.child_by_field_name("value").is_some_and(fresh),
        "local_variable_declaration" => children(part).into_iter().any(|inner| inner.kind() == "variable_declarator" && assigns_fresh(context, inner, key)),
        _ => false,
    })
}

/// `Integer.valueOf(...)` and the other boxing methods never return null.
fn boxing(context: &Context, call: Node) -> bool {
    const WRAPPERS: [&str; 8] = ["java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte", "java.lang.Character", "java.lang.Boolean", "java.lang.Float", "java.lang.Double"];
    call.child_by_field_name("name").is_some_and(|name| context.text(name) == "valueOf")
        && context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static && WRAPPERS.contains(&resolved.declaring.as_str()))
}

/// Whether the expression is known not to be null at its place.
pub fn known_non_null(context: &Context, expression: Node) -> bool {
    let expression = unwrap(expression);
    if fresh(expression) || matches!(expression.kind(), "binary_expression" | "class_literal" | "text_block") {
        return true;
    }
    if expression.kind() == "method_invocation" {
        return boxing(context, expression);
    }
    if !matches!(expression.kind(), "identifier" | "field_access") {
        return false;
    }
    if constant_field(context, expression) {
        return true;
    }
    let key = context.text(expression);
    let mut inner = expression;
    while let Some(holder) = parent(inner) {
        let side = |name: &str| holder.child_by_field_name(name) == Some(inner);
        let proven = match holder.kind() {
            "binary_expression" if side("right") => {
                let own = operator(context, holder);
                let left = holder.child_by_field_name("left");
                left.is_some_and(|left| match own {
                    Some("&&") => tests_hold(context, left, key, true) || derefs(context, left, key),
                    Some("||") => tests_hold(context, left, key, false) || derefs(context, left, key),
                    _ => derefs(context, left, key),
                })
            }
            "ternary_expression" => {
                let condition = holder.child_by_field_name("condition");
                condition.is_some_and(|condition| (side("consequence") && tests_hold(context, condition, key, true)) || (side("alternative") && tests_hold(context, condition, key, false)))
            }
            "if_statement" | "while_statement" | "for_statement" => {
                let condition = holder.child_by_field_name("condition");
                condition.is_some_and(|condition| {
                    (side("consequence") || side("body")) && tests_hold(context, condition, key, true) || side("alternative") && tests_hold(context, condition, key, false)
                })
            }
            "block" | "constructor_body" | "switch_block_statement_group" | "program" => {
                let mut known = false;
                for part in children(holder).into_iter().take_while(|part| part.id() != inner.id()) {
                    if assigns(context, part, key) {
                        known = assigns_fresh(context, part, key);
                    } else if checks_after(context, part, key) || derefs(context, part, key) {
                        known = true;
                    }
                }
                known
            }
            _ => false,
        };
        if proven {
            return true;
        }
        if matches!(holder.kind(), "method_declaration" | "constructor_declaration" | "lambda_expression" | "class_body") {
            break;
        }
        inner = holder;
    }
    false
}

/// A `final` field of this file that starts out as a new object or a constant: the dataflow knows its initializer.
fn constant_field(context: &Context, expression: Node) -> bool {
    if context.resolver.constant_string(expression).is_some() {
        return true;
    }
    let name = if expression.kind() == "field_access" { expression.child_by_field_name("field") } else { Some(expression) };
    let Some(name) = name.map(|name| context.text(name)) else { return false };
    let local = |found: super::vars::Named| match found {
        super::vars::Named::Variable(declarator) => parent(declarator).is_some_and(|declaration| declaration.kind() != "field_declaration"),
        super::vars::Named::Other(_) => true,
    };
    if expression.kind() == "identifier" && super::vars::named(context, expression).is_some_and(local) {
        return false;
    }
    if expression.kind() == "field_access" && expression.child_by_field_name("object").is_some_and(|object| context.text(object) != "this" && !matches!(context.resolver.receiver(object), Some(crate::java::types::expr::Receiver::Static(_)))) {
        return false;
    }
    let mut found = false;
    crate::engine::source::walk(context.file.tree.root_node(), |part| {
        if part.kind() != "field_declaration" || !crate::java::helpers::has_modifier(part, "final") {
            return;
        }
        for declarator in crate::java::helpers::declarators(part) {
            let same = declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
            let value = declarator.child_by_field_name("value");
            found |= same && value.is_some_and(|value| fresh(value) || value.kind().ends_with("_literal") || context.resolver.constant_string(value).is_some());
        }
    });
    found
}
