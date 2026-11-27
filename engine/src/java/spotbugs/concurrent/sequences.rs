//! AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION, measured: a `ConcurrentHashMap.put` (called with `invokevirtual` on
//! a value whose type is `ConcurrentHashMap` itself, on any map) inside the branch that runs when a test finds a key
//! missing: `map.get(key) == null` or `!map.containsKey(key)`, directly or through a local variable that holds the
//! result (its last assignment before the test), alone or in an `&&` chain, as the condition of an `if`, `while`, `for`
//! or `?:`. A put after an `if` that leaves when the key is there, or in the `else` branch, is silent. One finding per
//! put, on the line of its `(`.
use super::super::{Context, names};
use crate::engine::source::walk;
use crate::java::helpers::declarators;
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERN: &str = "AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION";
const MAP: &str = "java.util.concurrent.ConcurrentHashMap";

fn map_call(context: &Context, node: Node, name: &str) -> bool {
    let node = unwrap(node);
    node.kind() == "method_invocation"
        && node.child_by_field_name("name").is_some_and(|called| context.text(called) == name)
        && node.child_by_field_name("object").is_some_and(|object| object.kind() != "super")
        && context.resolver.resolve_call(node).is_some_and(|call| call.declaring == MAP && matches!(call.receiver.erased(), Type::Class(name, _) if name == MAP))
}

/// The value a local variable got from its last assignment before `at`.
fn value_before<'a>(context: &Context<'a>, nodes: &[Node<'a>], local: Node<'a>) -> Option<Node<'a>> {
    let name = context.text(local);
    let at = local.start_byte();
    let mut last: Option<(usize, Option<Node<'a>>)> = None;
    let mut note = |start: usize, value: Option<Node<'a>>| {
        if start < at && last.is_none_or(|(known, _)| known < start) {
            last = Some((start, value));
        }
    };
    for node in nodes {
        match node.kind() {
            "local_variable_declaration" => {
                for declarator in declarators(*node) {
                    if declarator.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) {
                        note(declarator.start_byte(), declarator.child_by_field_name("value"));
                    }
                }
            }
            "assignment_expression" => {
                if node.child_by_field_name("left").is_some_and(|left| left.kind() == "identifier" && context.text(left) == name) {
                    let plain = node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=");
                    note(node.start_byte(), node.child_by_field_name("right").filter(|_| plain));
                }
            }
            _ => {}
        }
    }
    last.and_then(|(_, value)| value)
}

/// The call a value comes from: the call itself, or a local variable holding its result.
fn from_call<'a>(context: &Context<'a>, nodes: &[Node<'a>], value: Node<'a>, name: &str) -> bool {
    let value = unwrap(value);
    if map_call(context, value, name) {
        return true;
    }
    value.kind() == "identifier"
        && matches!(context.resolver.binding(value, context.text(value)), Some(Binding::Local(_)))
        && value_before(context, nodes, value).is_some_and(|held| map_call(context, held, name))
}

/// Whether a test holds when the key is missing.
fn missing<'a>(context: &Context<'a>, nodes: &[Node<'a>], test: Node<'a>) -> bool {
    let test = unwrap(test);
    match test.kind() {
        "binary_expression" => {
            let operator = test.child_by_field_name("operator").map(|operator| context.text(operator));
            let (Some(left), Some(right)) = (test.child_by_field_name("left"), test.child_by_field_name("right")) else { return false };
            match operator {
                Some("&&") => missing(context, nodes, left) || missing(context, nodes, right),
                Some("==") => {
                    let null = |node: Node| unwrap(node).kind() == "null_literal";
                    (null(right) && from_call(context, nodes, left, "get")) || (null(left) && from_call(context, nodes, right, "get"))
                }
                _ => false,
            }
        }
        "unary_expression" => {
            test.child(0).is_some_and(|operator| context.text(operator) == "!")
                && test.child_by_field_name("operand").is_some_and(|operand| from_call(context, nodes, operand, "containsKey"))
        }
        _ => false,
    }
}

pub fn check<'a>(context: &Context<'a>, own: &str, nodes: &[Node<'a>], label: &str) {
    let mut reported = HashSet::new();
    for node in nodes {
        let (condition, branch) = match node.kind() {
            "if_statement" | "while_statement" | "for_statement" => (node.child_by_field_name("condition"), node.child_by_field_name(if node.kind() == "if_statement" { "consequence" } else { "body" })),
            "ternary_expression" => (node.child_by_field_name("condition"), node.child_by_field_name("consequence")),
            _ => continue,
        };
        let (Some(condition), Some(branch)) = (condition, branch) else { continue };
        if !missing(context, nodes, condition) {
            continue;
        }
        let mut puts = Vec::new();
        walk(branch, |inner| {
            if map_call(context, inner, "put") && nodes.iter().any(|own| own.id() == inner.id()) {
                puts.push(inner);
            }
        });
        for put in puts {
            if !reported.insert(put.id()) {
                continue;
            }
            let line = put.child_by_field_name("arguments").map_or_else(|| context.line(put), |arguments| context.line(arguments));
            let message = format!("Sequence of calls to {MAP} may not be atomic in {label}");
            let package = names::package_of(&names::binary(context, own)).to_string();
            let at = format!("function:{MAP}.put(Object, Object)|{package}@{}", names::binary(context, own));
            context.report_listed(PATTERN, put, line, message, at, 2, vec![MAP.to_string(), label.to_string()]);
        }
    }
}
