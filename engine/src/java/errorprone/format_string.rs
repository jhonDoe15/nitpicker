//! FormatString, FloggerFormatString and OrphanedFormatString.
use super::Context;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::flogger_calls::on_descendant;
use super::format_checks::{annotated_arguments, format_method_arguments};
use super::format_validation::{misses_arguments, validate};
use super::positions::{arguments, preferred};
use crate::engine::source::parent;
use crate::java::types::model::{Method, Type};
use tree_sitter::Node;

const LOGGING_API: &str = "com.google.common.flogger.LoggingApi";
const FORMAT_METHOD: &str = "com.google.errorprone.annotations.FormatMethod";
const FORMAT_STRING: &str = "com.google.errorprone.annotations.FormatString";

pub fn format_string(context: &Context, call: Node) {
    if call.kind() == "explicit_constructor_invocation" {
        let Some(resolved) = context.resolver.resolve_delegation(call) else { return };
        let formatted = annotated_arguments(context, &resolved.method, &arguments(call));
        if let Some(message) = (!formatted.is_empty()).then(|| validate(context, Some(&resolved.method), &formatted)).flatten() {
            let at = call.child_by_field_name("arguments").map_or(call.start_byte(), |list| list.start_byte());
            context.report("FormatString", call, at, &message);
        }
        return;
    }
    if call.kind() != "method_invocation" {
        return;
    }
    let formatted = format_method_arguments(context, call);
    if formatted.is_empty() {
        return;
    }
    let resolved = context.resolver.resolve_call(call);
    if let Some(message) = validate(context, resolved.as_ref().map(|resolved| &resolved.method), &formatted) {
        context.report("FormatString", call, preferred(context, call), &message);
    }
}

fn calls_with_cause(context: &Context, node: Node) -> bool {
    if on_descendant(context, node, LOGGING_API, &["withCause"], false) {
        return true;
    }
    let mut cursor = node.walk();
    let found = node.named_children(&mut cursor).any(|child| calls_with_cause(context, child));
    found
}

fn with_cause_fix(context: &Context, call: Node, list: &[Node]) -> Option<Fix> {
    let last = *list.last()?;
    let throwable = context.resolver.type_of(last).is_some_and(|found| match found.erased() {
        Type::Class(name, _) => context.resolver.index.is_subtype(&name, "java.lang.Throwable"),
        Type::Null => true,
        _ => false,
    });
    if !throwable || calls_with_cause(context, call) {
        return None;
    }
    let receiver = call.child_by_field_name("object")?;
    let before = list[list.len() - 2];
    Some(Fix::replace(before.end_byte(), last.end_byte(), "").insert(receiver.end_byte(), format!(".withCause({})", context.text(last))))
}

pub fn flogger_format_string(context: &Context, call: Node) {
    if !on_descendant(context, call, LOGGING_API, &["log"], false) {
        return;
    }
    let list = arguments(call);
    if list.len() <= 1 {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let Some(message) = validate(context, Some(&resolved.method), &list) else { return };
    let fixes: Vec<Fix> = if message.starts_with("extra format arguments") { with_cause_fix(context, call, &list).into_iter().collect() } else { Vec::new() };
    context.report_fixed("FloggerFormatString", call, preferred(context, call), &message, &fixes);
}

fn is_format_method(method: &Method) -> bool {
    method.detail.annotations.iter().any(|name| name == FORMAT_METHOD)
}

fn has_format_string(method: &Method) -> bool {
    method.detail.parameter_annotations.iter().any(|names| names.iter().any(|name| name == FORMAT_STRING))
}

/// `findMatchingMethods` over the receiver type and every type it inherits from.
fn any_format_method_named(context: &Context, call: Node, name: &str) -> bool {
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    let start = match call.child_by_field_name("object") {
        Some(_) => match resolved.receiver.erased() {
            Type::Class(class, _) => class,
            _ => return false,
        },
        None => resolved.declaring.clone(),
    };
    let index = &context.resolver.index;
    std::iter::once(start.clone()).chain(index.lineage(&start).iter().cloned()).any(|class| {
        index.get(&class).is_some_and(|info| info.methods.iter().any(|method| method.name == name && (is_format_method(method) || has_format_string(method))))
    })
}

fn creates_class(context: &Context, creation: Node, test: impl Fn(&str) -> bool) -> Option<Method> {
    let resolved = if creation.kind() == "explicit_constructor_invocation" {
        context.resolver.resolve_delegation(creation)?
    } else {
        context.resolver.resolve_constructor(creation)?
    };
    test(&resolved.declaring).then_some(resolved.method)
}

fn likely_mistake(context: &Context, call: Node) -> bool {
    if matches!(call.kind(), "object_creation_expression" | "explicit_constructor_invocation") {
        let index = &context.resolver.index;
        return creates_class(context, call, |class| class == "java.lang.StringBuilder").is_some()
            || creates_class(context, call, |class| index.is_subtype(class, "java.lang.Throwable")).is_some_and(|method| !method.varargs);
    }
    if call.kind() != "method_invocation" {
        return false;
    }
    let parameters = |types: &[&str]| {
        context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters.iter().map(Type::name).eq(types.iter().map(|name| name.to_string())))
    };
    on_descendant(context, call, "java.io.PrintStream", &["print", "println"], false)
        || on_descendant(context, call, "java.io.PrintWriter", &["print", "println"], false)
        || (instance_on_exact_class(context, call, "java.lang.StringBuilder", &["append"]) && parameters(&["java.lang.CharSequence", "int", "int"]))
        || (static_on_class(context, call, "com.google.common.truth.Truth", &["assertWithMessage"]) && parameters(&["java.lang.String"]))
        || (on_descendant(context, call, LOGGING_API, &["log"], false) && parameters(&["java.lang.String"]))
        || call.child_by_field_name("name").is_some_and(|name| any_format_method_named(context, call, context.text(name)))
}

/// `findIndexOfFormatStringParameter`: the `@FormatString` parameter, else the first `String` one.
fn format_string_index(method: &Method) -> Option<usize> {
    let marked = method.detail.parameter_annotations.iter().position(|names| names.iter().any(|name| name == FORMAT_STRING));
    marked.filter(|at| *at < method.parameters.len()).or_else(|| method.parameters.iter().position(|parameter| *parameter == Type::class("java.lang.String")))
}

fn is_format_argument(context: &Context, literal: Node, call: Node) -> bool {
    let resolved = if call.kind() == "explicit_constructor_invocation" { context.resolver.resolve_delegation(call) } else { context.resolver.resolve_call(call) };
    let Some(resolved) = resolved else { return false };
    if !is_format_method(&resolved.method) {
        return false;
    }
    format_string_index(&resolved.method).is_some_and(|at| arguments(call).get(at).is_some_and(|argument| argument.id() == literal.id()))
}

/// The operands of a `+` chain that javac's parser folds into one literal: string literals only.
fn folded_literals<'t>(node: Node<'t>, found: &mut Vec<Node<'t>>) -> bool {
    match node.kind() {
        "string_literal" => {
            found.push(node);
            true
        }
        "binary_expression" if node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "+") => {
            node.child_by_field_name("left").is_some_and(|left| folded_literals(left, found))
                && node.child_by_field_name("right").is_some_and(|right| folded_literals(right, found))
        }
        _ => false,
    }
}

pub fn orphaned_format_string(context: &Context, literal: Node) {
    let mut parts = Vec::new();
    if !matches!(literal.kind(), "string_literal" | "binary_expression") || !folded_literals(literal, &mut parts) {
        return;
    }
    if literal.kind() == "binary_expression" && parent(literal).is_some_and(|above| above.kind() == "binary_expression") {
        return;
    }
    let Some(Const::Str(text)) = constant(context, literal) else { return };
    if !misses_arguments(&text) {
        return;
    }
    let Some(call) = parent(literal).filter(|list| list.kind() == "argument_list").and_then(parent) else { return };
    if !likely_mistake(context, call) || (call.kind() != "object_creation_expression" && is_format_argument(context, literal, call)) {
        return;
    }
    context.report("OrphanedFormatString", literal, parts[0].start_byte(), "String literal contains format specifiers, but is not passed to a format method");
}
