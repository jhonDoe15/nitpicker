//! `no-untrimmed-request-text`: request text that reaches a search, filter or lookup without being trimmed, unless
//! the project trims request text in one place (the setting `global-trimmer`, which the caller reads from the project
//! files). Like the plugin rule it reads the TypeScript compiler's syntax tree, without a type checker.
mod bindings;
mod lookups;

use self::bindings::{declared_bindings, is_raw_request_text, is_trimming_assignment, Binding};
use self::lookups::{is_identifier_name, reaches_lookup};
use super::request_inputs::bindings::{is_function_like, is_method_value};
use super::request_inputs::nest::is_parameter;
use super::request_inputs::tree::{Tree, T};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-untrimmed-request-text";

fn message(name: &str) -> String {
    format!("{name} comes from the request untrimmed and reaches a lookup, so a padded value finds nothing. Call .trim() on it, or trim in one place: a global pipe, interceptor or middleware, a zod schema that trims (z.string().trim()), or a @Transform that trims the DTO field.")
}

/// The function-like node the compiler sees: a method's function stands for the method.
fn function_of(node: Node) -> Node {
    if is_method_value(node) { node.parent().unwrap_or(node) } else { node }
}

fn scope_of<'v>(node: Node<'v>) -> Node<'v> {
    if is_parameter(node) {
        return node.parent().map(function_of).unwrap_or(node);
    }
    node.ancestors().find(|ancestor| is_function_like(*ancestor) || ancestor.is("Program")).unwrap_or(node)
}

fn is_trimmed(tree: &Tree, binding: &Binding, scope: Node) -> bool {
    scope.descendants().into_iter().any(|node| is_trimming_assignment(tree, node, &binding.name))
}

fn is_used(tree: &Tree, binding: &Binding, scope: Node) -> bool {
    if is_identifier_name(Some(&binding.field)) {
        return false;
    }
    scope.descendants().into_iter().any(|node| {
        node.is("Identifier") && node.name().as_deref() == Some(binding.name.as_str()) && reaches_lookup(tree, T { node, level: 0 })
    })
}

pub fn check(context: &mut Context) {
    if context.setting(&format!("{RULE}.global-trimmer")) == Some("true") {
        return;
    }
    let Some(tree) = Tree::of(context) else { return };
    let mut found: Vec<(u32, u32, String)> = Vec::new();
    for node in tree.view.nodes() {
        for binding in declared_bindings(&tree, node) {
            let scope = scope_of(node);
            if !is_trimmed(&tree, &binding, scope) && is_used(&tree, &binding, scope) {
                let start = super::request_inputs::start_of(&tree, T { node: binding.anchor, level: 0 });
                found.push((start, binding.anchor.end(), binding.field.clone()));
            }
        }
    }
    let mut direct: Vec<(u32, u32, String)> = tree.view.nodes().filter(|node| node.is("MemberExpression") || node.is("CallExpression")).filter_map(|node| {
        let t = T { node, level: 0 };
        let declared = tree.parent(t).is_some_and(|parent| parent.node != node && parent.node.is("VariableDeclarator"));
        (is_raw_request_text(&tree, t) && reaches_lookup(&tree, t) && !declared).then(|| (node.start(), node.end(), tree.text(t).to_string()))
    }).collect();
    direct.sort_by_key(|(start, end, _)| (*start, std::cmp::Reverse(*end)));
    found.extend(direct);
    let mut reported: Vec<u32> = Vec::new();
    for (start, end, name) in found {
        if !reported.contains(&start) {
            reported.push(start);
            context.report_range(RULE, start, Some(end), message(&name));
        }
    }
}
