//! TruthGetOrDefault: `assertThat(map.getOrDefault(k, d)).isEqualTo(v)`.
use super::Context;
use super::call_consts::key_of;
use super::call_match::static_on_class;
use super::consts::constant;
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use super::symbol_key::same_symbol;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub(super) fn on_descendant(context: &Context, call: Node, owner: &str, name: &str) -> bool {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|found| context.text(found) != name) {
        return false;
    }
    let instance = context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static);
    instance && receiver_class(context, call).is_some_and(|class| class == owner || context.resolver.index.is_subtype(&class, owner))
}

#[derive(PartialEq)]
enum Match {
    Same,
    Different,
    Unknown,
}

fn values_same(context: &Context, default: Node, expected: Node) -> Match {
    if same_symbol(context, default, expected) {
        return Match::Same;
    }
    let (Some(expected_value), Some(default_value)) = (constant(context, expected), constant(context, default)) else { return Match::Unknown };
    if key_of(&expected_value).0 == key_of(&default_value).0 {
        return Match::Same;
    }
    match (context.resolver.type_of(expected), context.resolver.type_of(default)) {
        (Some(a), Some(b)) if a == b => Match::Different,
        _ => Match::Unknown,
    }
}

pub fn truth_get_or_default(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !on_descendant(context, call, "com.google.common.truth.Subject", "isEqualTo") {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.parameters != [Type::class("java.lang.Object")] {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    if !static_on_class(context, receiver, "com.google.common.truth.Truth", &["assertThat"]) {
        return;
    }
    let assert_args = arguments(receiver);
    let [argument] = assert_args.as_slice() else { return };
    let argument = *argument;
    if !on_descendant(context, argument, "java.util.Map", "getOrDefault") {
        return;
    }
    let get_args = arguments(argument);
    let (Some(map), [key, default]) = (argument.child_by_field_name("object"), get_args.as_slice()) else { return };
    let equals_args = arguments(call);
    let [expected] = equals_args.as_slice() else { return };
    let Some(name) = call.child_by_field_name("name") else { return };
    let verdict = values_same(context, *default, *expected);
    let fix = match verdict {
        Match::Unknown => return,
        Match::Different => Fix::replace(argument.start_byte(), argument.end_byte(), context.text(map))
            .and(receiver.end_byte(), name.end_byte(), ".containsEntry")
            .and(expected.start_byte(), expected.end_byte(), format!("{}, {}", context.text(*key), context.text(*expected))),
        Match::Same => Fix::replace(argument.start_byte(), argument.end_byte(), context.text(map))
            .and(receiver.end_byte(), name.end_byte(), ".doesNotContainKey")
            .and(expected.start_byte(), expected.end_byte(), context.text(*key)),
    };
    let message = "Asserting on getOrDefault is unclear; prefer containsEntry or doesNotContainKey";
    context.report_fixed("TruthGetOrDefault", call, preferred(context, call), message, &[fix]);
}
