//! FloggerMessageFormat and FloggerStringConcatenation: `log` calls whose format string is wrong.
use super::consts::{constant, Const};
use super::fixes::Fix;
use super::java_quote::quote;
use super::odd_calls::receiver_class;
use super::parts::arguments;
use super::positions::preferred;
use super::Context;
use crate::java::types::expr::literal_text;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// `instanceMethod().onDescendantOf("com.google.common.flogger.LoggingApi").named("log")`.
fn is_log_call(context: &Context, call: Node) -> bool {
    call.kind() == "method_invocation"
        && call.child_by_field_name("name").is_some_and(|name| context.text(name) == "log")
        && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static)
        && receiver_class(context, call).is_some_and(|receiver| context.resolver.index.is_subtype(&receiver, "com.google.common.flogger.LoggingApi"))
}

/// The source with each `{0}` to `{9}` turned into `%s`, `None` when it has none.
fn replace_placeholders(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut result = String::new();
    let mut found = false;
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'{' && at + 2 < bytes.len() && bytes[at + 1].is_ascii_digit() && bytes[at + 2] == b'}' {
            result.push_str("%s");
            at += 3;
            found = true;
        } else {
            let width = text[at..].chars().next().map_or(1, char::len_utf8);
            result.push_str(&text[at..at + width]);
            at += width;
        }
    }
    found.then_some(result)
}

pub fn flogger_message_format(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !is_log_call(context, call) {
        return;
    }
    let Some(format) = arguments(call).first().copied() else { return };
    let Some(Const::Str(value)) = constant(context, format) else { return };
    if replace_placeholders(&value).is_none() {
        return;
    }
    let mut fixes = Vec::new();
    if let Some(fixed) = replace_placeholders(context.text(format)) {
        fixes.push(Fix::replace(format.start_byte(), format.end_byte(), fixed));
    }
    let message = "Invalid message format-style format specifier ({0}), expected printf-style (%s)";
    context.report_fixed("FloggerMessageFormat", call, preferred(context, call), message, &fixes);
}

fn format_specifier(context: &Context, piece: Node) -> char {
    match context.resolver.type_of(piece).map(|kind| kind.unboxed_or_same()) {
        Some(Type::Primitive("int" | "long")) => 'd',
        Some(Type::Primitive("float" | "double")) => 'g',
        _ => 's',
    }
}

fn collect_pieces<'t>(context: &Context, node: Node<'t>, pieces: &mut Vec<Node<'t>>) {
    match node.kind() {
        "binary_expression" if node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "+") && context.resolver.type_is(node, "java.lang.String") => {
            if let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) {
                collect_pieces(context, left, pieces);
                collect_pieces(context, right, pieces);
            }
        }
        "parenthesized_expression" => {
            if let Some(inner) = node.named_child(0) {
                collect_pieces(context, inner, pieces);
            }
        }
        _ => pieces.push(node),
    }
}

pub fn flogger_string_concatenation(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !is_log_call(context, call) {
        return;
    }
    let Some(argument) = arguments(call).first().copied().filter(|argument| argument.kind() == "binary_expression") else { return };
    if matches!(constant(context, argument), Some(Const::Str(_))) {
        return;
    }
    let mut pieces = Vec::new();
    collect_pieces(context, argument, &mut pieces);
    let mut format = String::new();
    let mut formatted: Vec<&str> = Vec::new();
    for piece in pieces {
        if piece.kind() == "string_literal" {
            let Some(text) = literal_text(context.file, piece) else { return };
            format.push_str(&text);
        } else {
            format.push('%');
            format.push(format_specifier(context, piece));
            formatted.push(context.text(piece));
        }
    }
    let constant_expression = format!("\"{}\"", quote(&format).replace("\\'", "'"));
    let replacement = format!("{constant_expression}, {}", formatted.join(", "));
    let fix = Fix::replace(argument.start_byte(), argument.end_byte(), replacement);
    let message = "Prefer string formatting using printf placeholders (e.g. %s) instead of string concatenation";
    context.report_fixed("FloggerStringConcatenation", call, preferred(context, call), message, &[fix]);
}
