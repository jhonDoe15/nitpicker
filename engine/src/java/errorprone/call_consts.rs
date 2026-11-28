//! DuplicateMapKeys, InsecureCryptoUsage, SubstringOfZero, ThreadBuilderNameWithPlaceholder, FloggerLogVarargs, ZoneIdOfZ and
//! LenientFormatStringValidation: calls judged by the constant value of an argument.
use super::Context;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::consts::{Const, constant};
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::java_text::{double_to_string, escape_java_chars, float_to_string};
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

fn call_name<'f>(context: &'f Context, call: Node) -> &'f str {
    if call.kind() != "method_invocation" {
        return "";
    }
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn string_constant(context: &Context, node: Node) -> Option<String> {
    match constant(context, node)? {
        Const::Str(text) => Some(text),
        _ => None,
    }
}

/// An identity for a constant that tells `Integer` from `Long` and `Character` the way `equals` does, and its `toString`.
pub(super) fn key_of(value: &Const) -> (String, String) {
    match value {
        Const::Int(number) => (format!("I{number}"), number.to_string()),
        Const::Long(number) => (format!("L{number}"), number.to_string()),
        Const::Char(code) => (format!("C{code}"), char::from_u32(u32::from(*code)).map(String::from).unwrap_or_default()),
        Const::Float(number) => (format!("F{}", if number.is_nan() { 0x7fc0_0000 } else { number.to_bits() }), float_to_string(*number)),
        Const::Double(number) => (format!("D{}", if number.is_nan() { 0x7ff8_0000_0000_0000 } else { number.to_bits() }), double_to_string(*number)),
        Const::Bool(flag) => (format!("B{flag}"), flag.to_string()),
        Const::Str(text) => (format!("S{text}"), text.clone()),
    }
}

pub fn duplicate_map_keys(context: &Context, call: Node) {
    if !static_on_class(context, call, "java.util.Map", &["ofEntries"]) {
        return;
    }
    let mut seen: HashSet<String> = HashSet::new();
    for entry in arguments(call) {
        if entry.kind() != "method_invocation" || !static_on_class(context, entry, "java.util.Map", &["entry"]) {
            continue;
        }
        let Some(first) = arguments(entry).first().copied() else { continue };
        let Some(value) = constant(context, first) else { continue };
        let (key, shown) = key_of(&value);
        if !seen.insert(key) {
            let message = format!("duplicate key '{shown}'; Map#ofEntries will throw an IllegalArgumentException");
            return context.report_fixed("DuplicateMapKeys", call, preferred(context, call), &message, &[]);
        }
    }
}

/// Java's `.` does not match these.
fn line_terminator(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{85}' | '\u{2028}' | '\u{2029}')
}

fn no_terminators(text: &str) -> bool {
    !text.chars().any(line_terminator)
}

/// `text.matches(prefix + ".*")`.
fn prefixed(text: &str, prefix: &str) -> bool {
    text.strip_prefix(prefix).is_some_and(no_terminators)
}

fn crypto_message(call: Node, context: &Context, explanation: &str) {
    let message = format!("Insecure usage of a crypto API: {explanation}.");
    context.report_fixed("InsecureCryptoUsage", call, preferred(context, call), &message, &[]);
}

fn cipher_transformation(context: &Context, call: Node, transformation: &str) {
    if prefixed(transformation, "ARCFOUR") || prefixed(transformation, "ARC4") || prefixed(transformation, "RC4") {
        return;
    }
    if !no_terminators(transformation) || transformation.matches('/').count() < 2 {
        return crypto_message(call, context, "the mode and padding must be explicitly specified");
    }
    if transformation.contains("/ECB/") && !prefixed(transformation, "RSA/") && !prefixed(transformation, "AESWrap/") {
        return crypto_message(call, context, "ECB mode must not be used");
    }
    if prefixed(transformation, "ECIES") || prefixed(transformation, "DHIES") {
        crypto_message(call, context, "IES-based algorithms use ECB mode and are insecure");
    }
}

pub fn insecure_crypto_usage(context: &Context, call: Node) {
    if call_name(context, call) != "getInstance" || arguments(call).is_empty() {
        return;
    }
    let cipher = static_on_class(context, call, "javax.crypto.Cipher", &["getInstance"]);
    let key_structure = !cipher
        && ["java.security.KeyPairGenerator", "java.security.KeyFactory", "javax.crypto.KeyAgreement"].iter().any(|owner| static_on_class(context, call, owner, &["getInstance"]));
    if !cipher && !key_structure {
        return;
    }
    let value = constant(context, arguments(call)[0]);
    if cipher {
        match value {
            Some(Const::Str(transformation)) => cipher_transformation(context, call, &transformation),
            _ => crypto_message(call, context, "the transformation is not a compile-time constant expression"),
        }
        return;
    }
    match value {
        Some(Const::Str(algorithm)) if algorithm == "DH" => crypto_message(call, context, "using Diffie-Hellman on prime fields is insecure"),
        Some(Const::Str(algorithm)) if algorithm == "DSA" => crypto_message(call, context, "using DSA is insecure"),
        Some(_) => {}
        None => crypto_message(call, context, "the algorithm specification is not a compile-time constant expression"),
    }
}

pub fn substring_of_zero(context: &Context, call: Node) {
    if call_name(context, call) != "substring" || !instance_on_exact_class(context, call, "java.lang.String", &["substring"]) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let list = arguments(call);
    if resolved.method.parameters != [Type::Primitive("int")] || list.len() != 1 || !matches!(constant(context, list[0]), Some(Const::Int(0))) {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    let fix = Fix::replace(call.start_byte(), call.end_byte(), context.text(receiver));
    context.report_fixed("SubstringOfZero", call, preferred(context, call), "String.substring(0) returns the original String", &[fix]);
}

pub fn thread_builder_name_with_placeholder(context: &Context, call: Node) {
    if call_name(context, call) != "name" {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.is_static || receiver_class(context, call).is_none_or(|receiver| !context.resolver.index.is_subtype(&receiver, "java.lang.Thread.Builder")) {
        return;
    }
    let Some(first) = arguments(call).first().copied() else { return };
    if string_constant(context, first).is_some_and(|name| name.contains("%d") || name.contains("%s")) {
        let message = "Thread.Builder.name() does not accept placeholders (e.g., %d or %s). threadBuilder.name(String) accepts a constant name and threadBuilder.name(String, int) accepts a constant name _prefix_ and an initial counter value.";
        context.report_fixed("ThreadBuilderNameWithPlaceholder", call, preferred(context, call), message, &[]);
    }
}

pub fn flogger_log_varargs(context: &Context, call: Node) {
    if call_name(context, call) != "log" {
        return;
    }
    let list = arguments(call);
    if list.len() < 2 || call.child_by_field_name("object").is_none() {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.is_static || receiver_class(context, call).is_none_or(|receiver| !context.resolver.index.is_subtype(&receiver, "com.google.common.flogger.LoggingApi")) {
        return;
    }
    let string = context.resolver.type_of(list[0]).is_some_and(|kind| kind.erased() == Type::class("java.lang.String"));
    let objects = context.resolver.type_of(list[1]).is_some_and(|kind| kind.erased() == Type::Array(Box::new(Type::class("java.lang.Object"))));
    if !string || !objects || super::parts::enclosing_method(call).is_none() || constant(context, list[0]).is_some() {
        return;
    }
    let Some(name) = call.child_by_field_name("name") else { return };
    let fix = Fix::replace(name.start_byte(), name.end_byte(), "logVarargs");
    context.report_fixed("FloggerLogVarargs", call, preferred(context, call), "logVarargs should be used to pass through format strings and arguments.", &[fix]);
}

/// `Matchers.packageStartsWith`, which wants a dot after the prefix, or nothing.
pub(super) fn package_starts_with(context: &Context, prefix: &str) -> bool {
    let package = &context.resolver.scope.package;
    package.starts_with(prefix) && (package.len() == prefix.len() || package[prefix.len()..].starts_with('.'))
}

pub fn zone_id_of_z(context: &Context, call: Node) {
    if !static_on_class(context, call, "java.time.ZoneId", &["of"]) || package_starts_with(context, "java.") || package_starts_with(context, "tck.java.") {
        return;
    }
    let Some(first) = arguments(call).first().copied() else { return };
    if string_constant(context, first).is_none_or(|zone| zone != "Z") {
        return;
    }
    let mut fix = Fix::new().with_imports();
    let offset = qualify_type(context, call, "java.time.ZoneOffset", &mut fix);
    let fix = fix.and(call.start_byte(), call.end_byte(), format!("{offset}.UTC"));
    context.report_fixed("ZoneIdOfZ", call, preferred(context, call), "Use ZoneOffset.UTC instead of ZoneId.of(\"Z\").", &[fix]);
}

pub(super) fn lenient_position(context: &Context, call: Node, count: usize) -> Option<usize> {
    let name = call_name(context, call);
    let (position, matched) = if name.starts_with("check") && !name["check".len()..].starts_with("ElementIndex") && !name["check".len()..].starts_with("PositionIndex") && static_on_class(context, call, "com.google.common.base.Preconditions", &[name]) {
        (1, true)
    } else if name.starts_with("verify") && static_on_class(context, call, "com.google.common.base.Verify", &[name]) {
        (1, true)
    } else if name == "lenientFormat" && static_on_class(context, call, "com.google.common.base.Strings", &["lenientFormat"]) {
        (0, true)
    } else if name == "assertWithMessage" && static_on_class(context, call, "com.google.common.truth.Truth", &["assertWithMessage"]) {
        (0, true)
    } else if (name == "check" && lenient_instance(context, call, "com.google.common.truth.Subject")) || (name == "withMessage" && lenient_instance(context, call, "com.google.common.truth.StandardSubjectBuilder")) {
        (0, true)
    } else {
        (0, false)
    };
    (matched && position < count).then_some(position)
}

fn lenient_instance(context: &Context, call: Node, owner: &str) -> bool {
    context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static) && receiver_class(context, call).is_some_and(|receiver| context.resolver.index.is_subtype(&receiver, owner))
}

fn occurrences(haystack: &str, needle: &str) -> usize {
    haystack.matches(needle).count()
}

pub fn lenient_format_string_validation(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let list = arguments(call);
    let Some(position) = lenient_position(context, call, list.len()) else { return };
    let argument = list[position];
    let Some(Const::Str(string)) = constant(context, argument) else { return };
    let expected = occurrences(&string, "%s");
    let actual = list.len() - position - 1;
    if expected == actual {
        return;
    }
    let message = format!("Expected {expected} positional arguments, but saw {actual}. Note that lenient format strings only support %s placeholders.");
    let numeric = string.replace("%d", "%s");
    let literal = super::shape::folded_strings(argument);
    let mut fixes = Vec::new();
    if occurrences(&numeric, "%s") == actual && literal {
        fixes.push(Fix::replace(argument.start_byte(), argument.end_byte(), format!("\"{}\"", escape_java_chars(&numeric))));
    } else if expected < actual {
        let extra = format!(" ({})", vec!["%s"; actual - expected].join(", "));
        let end = argument.end_byte();
        fixes.push(if literal { Fix::replace(end - 1, end, format!("{extra}\"")) } else { Fix::new().insert(end, format!("+ \"{extra}\"")) });
    }
    context.report_fixed("LenientFormatStringValidation", call, preferred(context, call), &message, &fixes);
}
