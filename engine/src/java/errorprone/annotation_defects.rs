//! Checks on annotations: overlapping scope and qualifier annotations, `@Provides` outside a module, `@SuppressWarnings("deprecated")`.
use super::annotation_args::annotation_value;
use super::fixes::Fix;
use super::inject_checks::{annotation_class, annotations_of};
use super::java_quote::quote;
use super::shape::class_keyword;
use super::Context;
use crate::engine::source::named_children;
use crate::java::types::expr::unwrap;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const SCOPES: [&str; 3] = ["com.google.inject.ScopeAnnotation", "javax.inject.Scope", "jakarta.inject.Scope"];
const QUALIFIERS: [&str; 3] = ["com.google.inject.BindingAnnotation", "javax.inject.Qualifier", "jakarta.inject.Qualifier"];

pub fn overlapping_qualifier_and_scope_annotation(context: &Context, node: Node) {
    if node.kind() != "annotation_type_declaration" {
        return;
    }
    let found: Vec<String> = annotations_of(node).into_iter().filter_map(|annotation| annotation_class(context, annotation)).collect();
    if found.iter().any(|name| SCOPES.contains(&name.as_str())) && found.iter().any(|name| QUALIFIERS.contains(&name.as_str())) {
        let message = "Annotations cannot be both Scope annotations and Qualifier annotations: this causes confusion when trying to use them.";
        context.report_fixed("OverlappingQualifierAndScopeAnnotation", node, class_keyword(node), message, &[]);
    }
}

pub fn provides_method_outside_of_module(context: &Context, node: Node) {
    if !matches!(node.kind(), "annotation" | "marker_annotation") || annotation_class(context, node).as_deref() != Some("com.google.inject.Provides") {
        return;
    }
    let inside = enclosing_type(context.file, context.resolver.scope, node).is_some_and(|class| context.resolver.index.is_subtype(&class, "com.google.inject.Module"));
    if !inside {
        let fix = Fix::new().delete(node.start_byte(), node.end_byte());
        context.report_fixed("ProvidesMethodOutsideOfModule", node, node.start_byte(), "@Provides methods need to be declared in a Module to have any effect.", &[fix]);
    }
}

/// A string literal's value, when the node is one.
fn literal(context: &Context, node: Node) -> Option<String> {
    crate::java::types::expr::literal_text(context.file, node)
}

/// `VisitorState.getConstantExpression` does not escape single quotes.
fn unescape_quotes(escaped: &str) -> String {
    let chars: Vec<char> = escaped.chars().collect();
    let mut text = String::new();
    let mut at = 0;
    while at < chars.len() {
        let c = chars[at];
        if c == '\\' && at + 1 < chars.len() {
            at += 1;
            if chars[at] != '\'' {
                text.push(c);
            }
            text.push(chars[at]);
        } else {
            text.push(c);
        }
        at += 1;
    }
    text
}

pub fn suppress_warnings_deprecated(context: &Context, node: Node) {
    if node.kind() != "annotation" || annotation_class(context, node).as_deref() != Some("java.lang.SuppressWarnings") {
        return;
    }
    let Some(value) = annotation_value(&context.file.text, node, "value") else { return };
    let value = unwrap(value);
    let elements: Vec<Node> = if value.kind() == "element_value_array_initializer" { named_children(value).into_iter().filter(|part| !part.kind().ends_with("comment")).collect() } else { vec![value] };
    if !elements.iter().any(|element| element.kind() == "string_literal" && literal(context, *element).as_deref() == Some("deprecated")) {
        return;
    }
    let values: Option<Vec<String>> = elements
        .iter()
        .map(|element| context.resolver.constant_string(*element).or_else(|| literal(context, *element)))
        .map(|text| text.map(|text| if text == "deprecated" { "deprecation".to_string() } else { text }))
        .collect();
    let Some(values) = values else { return };
    let quoted: Vec<String> = values.iter().map(|text| format!("\"{}\"", unescape_quotes(&quote(text)))).collect();
    let argument = if quoted.len() > 1 { format!("{{{}}}", quoted.join(", ")) } else { quoted.join("") };
    let fix = Fix::replace(value.start_byte(), value.end_byte(), argument);
    context.report_fixed("SuppressWarningsDeprecated", node, node.start_byte(), "Suppressing \"deprecated\" is probably a typo for \"deprecation\"", &[fix]);
}
