//! `no-parameter-mutation`: a function changes, in place, an array, Set, Map, indexed object or project object
//! that a caller passed in, directly, through an alias or a shallow copy, or through a local helper.
use super::Scope;
use super::aliases::{helper_mutation, nested_copy_write};
use super::copies::is_default_fill;
use super::mutations::{Kind, Mutation, mutation_at};
use super::owners::changed_parameter;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Def;
use crate::typescript::rules::support::view::Node;
use std::collections::{HashMap, HashSet};

const RULE: &str = "no-parameter-mutation";

fn parameter_message(name: &str) -> String {
    format!(
        "`{name}` changes the value the caller passed in. Build and return a new value (`[...items, item]`, `{{ ...table, [key]: value }}`, \
         `items.toSorted()`), or copy the parameter first (`const copy = [...items]`)."
    )
}

fn property_message(name: &str) -> String {
    format!(
        "`{name}` writes to the object the caller passed in, so a frozen or shared object breaks. Build a new object \
         (`{{ ...options, timeout: 5000 }}`), or copy the parameter first (`const next = {{ ...options }}`)."
    )
}

fn helper_message(name: &str, callee: &str) -> String {
    format!(
        "`{name}` is passed to `{callee}`, which changes it in place, so the caller's value changes. Pass a copy (`[...{name}]` or \
         `{{ ...{name} }}`), or make `{callee}` return a new value."
    )
}

fn mutation_hit<'v>(scope: &Scope<'_, '_, 'v>, mutation: Mutation<'v>, node: Node<'v>) -> Option<(Def<'v>, String)> {
    let definition = changed_parameter(scope, mutation.object, node, false).or_else(|| nested_copy_write(scope, &mutation, node))?;
    if is_default_fill(node, definition.name, definition.node) {
        return None;
    }
    let message = if mutation.kind == Kind::Parameter { parameter_message(&mutation.name) } else { property_message(&mutation.name) };
    Some((definition, message))
}

fn find_hit<'v>(scope: &Scope<'_, '_, 'v>, node: Node<'v>, helpers: &mut HashMap<u32, HashSet<usize>>) -> Option<(Def<'v>, String)> {
    if let Some(mutation) = mutation_at(scope, node) {
        return mutation_hit(scope, mutation, node);
    }
    let helper = node.is("CallExpression").then(|| helper_mutation(scope, node, helpers)).flatten()?;
    let message = helper_message(scope.source(helper.argument), &helper.callee);
    Some((helper.parameter, message))
}

fn is_visited(node: Node) -> bool {
    match node.kind() {
        "CallExpression" | "AssignmentExpression" | "UpdateExpression" => true,
        "UnaryExpression" => node.text("operator").as_deref() == Some("delete"),
        _ => false,
    }
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let scope = Scope { scopes, types, text: context.file.text };
    let mut helpers = HashMap::new();
    let mut reported = HashSet::new();
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| is_visited(*node)) {
        if types.borrow().refused.is_some() {
            return;
        }
        let Some((definition, message)) = find_hit(&scope, node, &mut helpers) else { continue };
        if reported.insert(definition.name.index) {
            found.push((node.start(), node.end(), message));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
