//! CompatibleWithAnnotationMisuse: `@CompatibleWith` must name a type variable in scope.
use super::consts::{constant, Const};
use super::hierarchy::{declared_method, simple_name, super_methods};
use super::inject_checks::annotation_class;
use super::shadow::{is_static, parameters_of, CLASS_LIKE, METHOD_LIKE};
use super::Context;
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::helpers::has_modifier;
use tree_sitter::Node;

const COMPATIBLE_WITH: &str = "com.google.errorprone.annotations.CompatibleWith";

fn class_like(node: Node) -> bool {
    CLASS_LIKE.contains(&node.kind()) || (node.kind() == "object_creation_expression" && children(node).iter().any(|part| part.kind() == "class_body"))
}

fn enclosing_class(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        if class_like(at) {
            return Some(at);
        }
        current = parent(at);
    }
    None
}

/// Whether the class around is an instance of an enclosing class: javac's `isInner`.
fn is_inner(class: Node) -> bool {
    if CLASS_LIKE.contains(&class.kind()) && parent(class).is_some_and(|up| matches!(up.kind(), "class_body" | "interface_body" | "enum_body" | "annotation_type_body")) {
        return !is_static(class);
    }
    let mut current = parent(class);
    while let Some(at) = current {
        match at.kind() {
            kind if METHOD_LIKE.contains(&kind) => return !has_modifier(at, "static"),
            "static_initializer" => return false,
            "field_declaration" => return !has_modifier(at, "static"),
            "compact_constructor_declaration" | "program" => return false,
            _ => current = parent(at),
        }
    }
    false
}

pub fn compatible_with_misuse(context: &Context, node: Node) {
    if node.kind() != "annotation" || annotation_class(context, node).as_deref() != Some(COMPATIBLE_WITH) {
        return;
    }
    let Some(method) = ancestor(node, &["method_declaration"]) else { return };
    let report = |message: &str| context.report_fixed("CompatibleWithAnnotationMisuse", node, node.start_byte(), message, &[]);
    if let Some((origin, declared)) = declared_method(context, method) {
        for (owner, above) in super_methods(context.resolver.index, origin, declared) {
            if above.detail.parameter_annotations.iter().any(|names| names.iter().any(|name| name == COMPATIBLE_WITH)) {
                return report(&format!("This method overrides a method in {} that already has @CompatibleWith", simple_name(&owner.name)));
            }
        }
    }
    let mut names: Vec<String> = parameters_of(context, method).into_iter().map(|(name, _)| name).collect();
    let mut class = enclosing_class(method);
    while let Some(at) = class {
        names.extend(parameters_of(context, at).into_iter().map(|(name, _)| name));
        class = if is_inner(at) { enclosing_class(at) } else { None };
    }
    if names.is_empty() {
        return report("There are no type arguments in scope to match against.");
    }
    let mut valid: Vec<String> = Vec::new();
    for name in names {
        if !valid.contains(&name) {
            valid.push(name);
        }
    }
    let shown = valid.join(", ");
    let value = node
        .child_by_field_name("arguments")
        .map(named_children)
        .and_then(|parts| parts.into_iter().find(|part| !part.kind().ends_with("comment")))
        .and_then(|pair| if pair.kind() == "element_value_pair" { pair.child_by_field_name("value") } else { Some(pair) })
        .and_then(|value| match constant(context, value) {
            Some(Const::Str(text)) => Some(text),
            _ => None,
        });
    match value {
        None => report(&format!("The value of @CompatibleWith must not be empty (valid arguments are {shown})")),
        Some(text) if text.is_empty() => report(&format!("The value of @CompatibleWith must not be empty (valid arguments are {shown})")),
        Some(text) if !valid.contains(&text) => report(&format!("{text} is not a valid type argument. Valid arguments are: {shown}")),
        _ => {}
    }
}
