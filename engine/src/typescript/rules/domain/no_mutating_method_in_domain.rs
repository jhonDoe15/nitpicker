//! `no-mutating-method-in-domain`: a call of a method that changes an array, Set, Map, Date, typed array,
//! Buffer or URLSearchParams in place, found by the type that declares the method.
use super::mutating_methods::{is_array_mutator, mutated_owner, static_name};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-mutating-method-in-domain";
const INDIRECT_CALLS: &[&str] = &["call", "apply", "bind"];

fn is_plain_callee(node: Node) -> bool {
    !node.flag("computed") && node.parent().is_some_and(|parent| parent.is("CallExpression") && parent.node("callee") == Some(node))
}

fn is_reported_by_syntax(node: Node, method: &str) -> bool {
    if !is_array_mutator(method) || node.flag("computed") {
        return false;
    }
    if is_plain_callee(node) {
        return true;
    }
    node.parent().is_some_and(|outer| {
        outer.is("MemberExpression")
            && outer.node("object") == Some(node)
            && INDIRECT_CALLS.contains(&outer.node("property").and_then(|property| property.text("name")).as_deref().unwrap_or(""))
            && is_plain_callee(outer)
    })
}

fn message(owner: &str, method: &str) -> String {
    format!(
        "domain/ code does not mutate values, and {owner}.{method} changes the value it is called on: build a new value instead, \
         e.g. new Set([...set, x]), new Map([...map, [key, value]]), new Map(xs.map((x) => [x.id, x] as const)) or new Date(ms + delta)."
    )
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("MemberExpression")) {
        let mut types = types.borrow_mut();
        let Some(method) = static_name(node, &mut types) else { continue };
        if is_reported_by_syntax(node, &method) {
            continue;
        }
        if let Some(owner) = mutated_owner(node, &method, &mut types) {
            found.push((node.start(), node.end(), message(&owner, &method)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
