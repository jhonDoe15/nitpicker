//! OptionalMapUnusedValue and OptionalOfRedundantMethod: `java.util.Optional` and Guava's `Optional` used wrongly.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::parts::{arguments, preferred};
use super::Context;
use crate::engine::source::parent;
use crate::java::types::model::Type;
use tree_sitter::Node;

const JAVA_OPTIONAL: &str = "java.util.Optional";
const GUAVA_OPTIONAL: &str = "com.google.common.base.Optional";

/// `SuggestedFixes.renameMethodInvocation`: the name of the invoked method becomes `replacement`.
pub fn rename_invocation(call: Node, replacement: &str) -> Fix {
    match call.child_by_field_name("name") {
        Some(name) => Fix::replace(name.start_byte(), name.end_byte(), replacement),
        None => Fix::new(),
    }
}

fn void_compatible(argument: Node) -> bool {
    match argument.kind() {
        "method_reference" => true,
        "lambda_expression" => argument.child_by_field_name("body").is_some_and(|body| body.kind() == "method_invocation"),
        _ => false,
    }
}

pub fn optional_map_unused_value(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !instance_on_exact_class(context, node, JAVA_OPTIONAL, &["map"]) {
        return;
    }
    if !parent(node).is_some_and(|up| up.kind() == "expression_statement") || !arguments(node).first().is_some_and(|first| void_compatible(*first)) {
        return;
    }
    let message = "Optional.ifPresent is preferred over Optional.map when the return value is unused";
    context.report_fixed("OptionalMapUnusedValue", node, preferred(node), message, &[super::optional_checks::rename_invocation(node, "ifPresent")]);
}

const JAVA_REDUNDANT: [&str; 5] = ["ifPresent", "isPresent", "orElse", "orElseGet", "orElseThrow"];
const GUAVA_REDUNDANT: [&str; 3] = ["isPresent", "or", "orNull"];

pub fn optional_of_redundant_method(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(inner) = node.child_by_field_name("object").filter(|object| object.kind() == "method_invocation") else { return };
    let guava = static_on_class(context, inner, GUAVA_OPTIONAL, &["of"]);
    if !guava && !static_on_class(context, inner, JAVA_OPTIONAL, &["of"]) {
        return;
    }
    if !instance_on_exact_class(context, node, JAVA_OPTIONAL, &JAVA_REDUNDANT) && !instance_on_exact_class(context, node, GUAVA_OPTIONAL, &GUAVA_REDUNDANT) {
        return;
    }
    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let mut fixes = vec![rename_invocation(inner, if guava { "fromNullable" } else { "ofNullable" })];
    if !parent(node).is_some_and(|up| up.kind() == "expression_statement") {
        match name {
            "orElse" | "orElseGet" | "orElseThrow" | "or" | "orNull" => {
                if let Some(value) = arguments(inner).first() {
                    fixes.push(Fix::replace(node.start_byte(), node.end_byte(), context.text(*value)));
                }
            }
            "isPresent" => fixes.push(Fix::replace(node.start_byte(), node.end_byte(), "true")),
            _ => {}
        }
    }
    let message = format!("Optional.of() always returns a non-empty Optional. Using '{name}' method on it is unnecessary and most probably a bug.");
    context.report_fixed("OptionalOfRedundantMethod", node, preferred(node), &message, &fixes);
}
