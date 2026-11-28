//! ExpensiveLenientFormatString and FormatStringShouldUsePlaceholders.
use super::Context;
use super::call_consts::lenient_position;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::java::types::model::Type;
use tree_sitter::Node;

fn call_name<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn string_constant(context: &Context, node: Node) -> Option<String> {
    match constant(context, node)? {
        Const::Str(text) => Some(text),
        _ => None,
    }
}

/// `%[^%s]` finds a match somewhere in the text.
fn has_invalid_format_character(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    chars.windows(2).any(|pair| pair[0] == '%' && pair[1] != '%' && pair[1] != 's')
}

pub fn expensive_lenient_format_string(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let list = arguments(call);
    let Some(position) = lenient_position(context, call, list.len()) else { return };
    let format = list[position];
    if format.kind() != "method_invocation" || !static_on_class(context, format, "java.lang.String", &["format"]) {
        return;
    }
    let inner = arguments(format);
    let (Some(first), Some(last)) = (inner.first(), inner.last()) else { return };
    let Some(text) = string_constant(context, *first) else { return };
    if has_invalid_format_character(&text) {
        return;
    }
    let fix = Fix::replace(format.start_byte(), first.start_byte(), "").and(last.end_byte(), format.end_byte(), "");
    let message = "String.format is passed to a lenient formatting method, which can be unwrapped to improve efficiency.";
    context.report_fixed("ExpensiveLenientFormatString", format, preferred(context, format), message, &[fix]);
}

fn is_printf_method(context: &Context, call: Node) -> bool {
    let name = call_name(context, call);
    if matches!(name, "format" | "printf") {
        let instance = context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static);
        let described = receiver_class(context, call).is_some_and(|class| {
            ["java.io.PrintStream", "java.io.PrintWriter", "java.util.Formatter", "java.io.Console"].iter().any(|owner| class == *owner || context.resolver.index.is_subtype(&class, owner))
        });
        if instance && described {
            return true;
        }
    }
    if name == "format" && static_on_class(context, call, "java.lang.String", &["format"]) {
        return true;
    }
    if matches!(name, "readPassword" | "readLine") && instance_on_exact_class(context, call, "java.io.Console", &["readPassword", "readLine"]) {
        return context.resolver.resolve_call(call).is_some_and(|resolved| {
            resolved.method.varargs && resolved.method.parameters == [Type::class("java.lang.String"), Type::Array(Box::new(Type::class("java.lang.Object")))]
        });
    }
    false
}

/// The format string and what it formats, as `FormatStringUtils.formatMethodArguments` finds them.
pub(super) fn annotated_arguments<'t>(_context: &Context, method: &crate::java::types::model::Method, list: &[Node<'t>]) -> Vec<Node<'t>> {
    let resolved = Resolved { method };
    if !resolved.method.detail.annotations.iter().any(|name| name == "com.google.errorprone.annotations.FormatMethod") {
        return Vec::new();
    }
    let mut first_string = None;
    for (at, parameter) in resolved.method.parameters.iter().enumerate() {
        if resolved.method.detail.parameter_annotations.get(at).is_some_and(|names| names.iter().any(|name| name == "com.google.errorprone.annotations.FormatString")) {
            return list.get(at..).map(<[Node]>::to_vec).unwrap_or_default();
        }
        if first_string.is_none() && *parameter == Type::class("java.lang.String") {
            first_string = Some(at);
        }
    }
    first_string.and_then(|at| list.get(at..)).map(<[Node]>::to_vec).unwrap_or_default()
}

struct Resolved<'m> {
    method: &'m crate::java::types::model::Method,
}

pub(super) fn format_method_arguments<'t>(context: &Context, call: Node<'t>) -> Vec<Node<'t>> {
    let list = arguments(call);
    if call_name(context, call) == "formatted" && instance_on_exact_class(context, call, "java.lang.String", &["formatted"]) {
        return match call.child_by_field_name("object") {
            Some(receiver) => std::iter::once(receiver).chain(list).collect(),
            None => Vec::new(),
        };
    }
    if is_printf_method(context, call) {
        let locale = list.first().is_some_and(|first| context.resolver.type_of(*first) == Some(Type::class("java.util.Locale")));
        return if locale { list[1..].to_vec() } else { list };
    }
    match context.resolver.resolve_call(call) {
        Some(resolved) => annotated_arguments(context, &resolved.method, &list),
        None => Vec::new(),
    }
}

/// The operands of a chain of `+`, the way the visitor flattens it.
fn concatenations<'t>(node: Node<'t>, found: &mut Vec<Node<'t>>) {
    if node.kind() == "binary_expression" && node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "+") {
        if let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) {
            concatenations(left, found);
            concatenations(right, found);
            return;
        }
    }
    found.push(node);
}

pub fn format_string_should_use_placeholders(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let mut formatted = format_method_arguments(context, call);
    if formatted.is_empty() {
        let list = arguments(call);
        if let Some(position) = lenient_position(context, call, list.len()) {
            formatted = list[position..].to_vec();
        }
    }
    let (Some(format_string), Some(last)) = (formatted.first().copied(), formatted.last().copied()) else { return };
    if formatted.len() == 2 && context.resolver.type_of(formatted[1]) == Some(Type::Array(Box::new(Type::class("java.lang.Object")))) {
        return;
    }
    if string_constant(context, format_string).is_some() {
        return;
    }
    let mut concats = Vec::new();
    concatenations(format_string, &mut concats);
    if concats.len() <= 1 {
        return;
    }
    let mut message = String::from("\"");
    let mut new_args = String::new();
    let mut added = 0;
    for concat in concats {
        if concat.kind() == "string_literal" {
            let source: Vec<char> = context.text(concat).chars().collect();
            message.extend(&source[1..source.len() - 1]);
            let mut at = 0;
            while at < source.len() {
                if source[at] == '%' && at + 1 < source.len() {
                    at += 1;
                    if source[at] == 's' && added + 1 < formatted.len() {
                        added += 1;
                        new_args.push_str(", ");
                        new_args.push_str(context.text(formatted[added]));
                    }
                }
                at += 1;
            }
        } else {
            message.push_str("%s");
            new_args.push_str(", ");
            new_args.push_str(context.text(concat));
        }
    }
    if added + 1 < formatted.len() || new_args.is_empty() {
        return;
    }
    let placeholders = message.matches("%s").count();
    let count = new_args.matches(',').count();
    if placeholders == count + 1 && message.ends_with("%s") {
        message.truncate(message.len() - 2);
    } else if count != placeholders {
        return;
    }
    let replacement = format!("{message}\"{new_args}");
    let fix = Fix::replace(format_string.start_byte(), last.end_byte(), replacement);
    context.report_fixed("FormatStringShouldUsePlaceholders", call, preferred(context, call), "Using a format string avoids string concatenation in the common case.", &[fix]);
}
