//! NullOptional, NullableOptional, NullableConstructor and OptionalMapToOptional.
use super::call_match::instance_on_exact_class;
use super::fixes::Fix;
use super::hierarchy::annotation_names;
use super::nodes::name_position;
use super::parts::{arguments, preferred};
use super::qualify::qualify;
use super::Context;
use crate::engine::source::{children, parent};
use crate::java::types::model::Type;
use tree_sitter::Node;

const JAVA_OPTIONAL: &str = "java.util.Optional";
const GUAVA_OPTIONAL: &str = "com.google.common.base.Optional";

fn is_optional_descendant(context: &Context, name: &str) -> bool {
    let index = context.resolver.index;
    index.is_subtype(name, GUAVA_OPTIONAL) || index.is_subtype(name, JAVA_OPTIONAL)
}

/// `Matchers.methodCallInDeclarationOfThrowingRunnable`: the nearest lambda or class around is a block that is expected to fail.
fn in_throwing_declaration(context: &Context, node: Node) -> bool {
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "lambda_expression" => {
                return context.resolver.type_of(at).is_some_and(|kind| super::unused::throwing_type(context, &kind.name()));
            }
            "class_body" | "enum_body" | "interface_body" | "annotation_type_body" => {
                let owner = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node);
                return owner.is_some_and(|owner| super::unused::throwing_type(context, &owner));
            }
            _ => {}
        }
        current = parent(at);
    }
    false
}

fn simple_name(name: &str) -> &str {
    name.rsplit('.').next().unwrap_or(name)
}

fn null_argument(context: &Context, call: Node, constructor: bool) {
    let resolved = match call.kind() {
        "object_creation_expression" if constructor => context.resolver.resolve_constructor(call),
        "explicit_constructor_invocation" => context.resolver.call_formals(call).map(|(resolved, _)| resolved),
        _ => context.resolver.resolve_call(call),
    };
    let Some(resolved) = resolved else { return };
    let formals = &resolved.method.parameters;
    if formals.is_empty() {
        return;
    }
    let annotated = &resolved.method.detail.parameter_annotations;
    for (at, argument) in arguments(call).into_iter().enumerate() {
        let position = at.min(formals.len() - 1);
        let mut kind = formals[position].clone();
        if resolved.method.varargs && position + 1 == formals.len() {
            if let Type::Array(element) = kind {
                kind = *element;
            }
        }
        let Type::Class(name, _) = &kind else { continue };
        if argument.kind() != "null_literal" || !is_optional_descendant(context, name) {
            continue;
        }
        let nullable = annotated.get(position).is_some_and(|names| names.iter().any(|annotation| simple_name(annotation) == "Nullable"));
        if nullable || in_throwing_declaration(context, call) {
            continue;
        }
        let absent = if context.resolver.index.is_subtype(name, GUAVA_OPTIONAL) { "absent" } else { "empty" };
        let fix = Fix::replace(argument.start_byte(), argument.end_byte(), format!("{}.{absent}()", qualify(context, argument, name))).with_imports();
        let message = "Passing a literal null to an Optional parameter is almost certainly a mistake. Did you mean to provide an empty Optional?";
        context.report_fixed("NullOptional", argument, argument.start_byte(), message, &[fix]);
    }
}

pub fn null_optional(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" | "explicit_constructor_invocation" => null_argument(context, node, false),
        "object_creation_expression" => null_argument(context, node, true),
        _ => {}
    }
}

fn has_nullable(context: &Context, declaration: Node) -> bool {
    annotation_names(context, declaration).iter().any(|name| simple_name(name) == "Nullable")
}

fn is_exact_optional(kind: Option<Type>) -> bool {
    matches!(kind, Some(Type::Class(name, _)) if name == JAVA_OPTIONAL || name == GUAVA_OPTIONAL)
}

pub fn nullable_optional(context: &Context, node: Node) {
    let message = "Using an Optional variable which is expected to possibly be null is discouraged. It is best to indicate the absence of the value by assigning it an empty optional.";
    match node.kind() {
        "method_declaration" => {
            if has_nullable(context, node) && is_exact_optional(node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written))) {
                context.report_fixed("NullableOptional", node, name_position(node), message, &[]);
            }
        }
        "field_declaration" | "local_variable_declaration" | "constant_declaration" => {
            if !has_nullable(context, node) {
                return;
            }
            for declarator in children(node).into_iter().filter(|part| part.kind() == "variable_declarator") {
                if is_exact_optional(context.resolver.declared_type(node, Some(declarator))) {
                    context.report_fixed("NullableOptional", node, name_position(declarator), message, &[]);
                }
            }
        }
        "enhanced_for_statement" => {
            let kind = node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
            if has_nullable(context, node) && is_exact_optional(kind) {
                context.report_fixed("NullableOptional", node, node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte()), message, &[]);
            }
        }
        "formal_parameter" | "spread_parameter" => {
            if has_nullable(context, node) && node.kind() == "formal_parameter" && is_exact_optional(context.resolver.declared_type(node, None)) {
                context.report_fixed("NullableOptional", node, name_position(node), message, &[]);
            }
        }
        _ => {}
    }
}

pub fn nullable_constructor(context: &Context, node: Node) {
    if node.kind() != "constructor_declaration" {
        return;
    }
    let Some(modifiers) = crate::java::helpers::modifiers(node) else { return };
    let found = children(modifiers).into_iter().find(|part| {
        matches!(part.kind(), "annotation" | "marker_annotation") && part.child_by_field_name("name").is_some_and(|name| simple_name(context.text(name)) == "Nullable")
    });
    if let Some(annotation) = found {
        let message = "Constructors should not be annotated with @Nullable since they cannot return null";
        context.report_fixed("NullableConstructor", annotation, annotation.start_byte(), message, &[Fix::replace(annotation.start_byte(), annotation.end_byte(), "")]);
    }
}

fn optional_exact_any_method(context: &Context, call: Node, except: &str) -> bool {
    [JAVA_OPTIONAL, GUAVA_OPTIONAL].iter().any(|owner| {
        context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && resolved.method.name != except)
            && super::owners::receiver_name(context, call, false).as_deref() == Some(owner)
    })
}

pub fn optional_map_to_optional(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let mapped = instance_on_exact_class(context, node, JAVA_OPTIONAL, &["map"]) || instance_on_exact_class(context, node, GUAVA_OPTIONAL, &["transform"]);
    if !mapped {
        return;
    }
    if let Some(up) = parent(node) {
        let outer = match up.kind() {
            "method_invocation" if up.child_by_field_name("object") == Some(node) => Some(up),
            "field_access" if up.child_by_field_name("object") == Some(node) => {
                parent(up).filter(|list| list.kind() == "argument_list").and_then(parent).filter(|call| matches!(call.kind(), "method_invocation" | "explicit_constructor_invocation"))
            }
            _ => None,
        };
        if outer.is_some_and(|outer| outer.kind() == "method_invocation" && optional_exact_any_method(context, outer, "isPresent")) {
            return;
        }
    }
    if arguments(node).is_empty() {
        return;
    }
    let Some(Type::Class(own, found)) = context.resolver.type_of(node) else { return };
    let constrained = match context.resolver.expected(node) {
        Some(Type::Class(name, arguments)) if name == own && arguments.len() == 1 && !matches!(arguments[0], Type::Wildcard) => Some(arguments[0].clone()),
        _ => None,
    };
    let mapped_to = match (&constrained, found.as_slice()) {
        (Some(only), [_]) | (None, [only]) => only,
        _ => return,
    };
    if matches!(mapped_to, Type::Class(name, _) if is_optional_descendant(context, name)) {
        let message = "Mapping to another Optional will yield a nested Optional. Did you mean flatMap?";
        context.report_fixed("OptionalMapToOptional", node, preferred(node), message, &[]);
    }
}
