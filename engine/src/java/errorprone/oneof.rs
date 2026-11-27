//! WrongOneof: a getter of another field of a proto `oneof`, inside the switch case of one of its fields.
use super::Context;
use super::already_pure::Constants;
use super::nodes::{position, unparenthesized};
use super::positions::receiver;
use super::reach::{can_fall_through, cases, is_default};
use crate::engine::source::{children, named_children, walk};
use crate::java::types::model::{Type, flag};
use std::collections::HashSet;
use tree_sitter::Node;

const ONE_OF_ENUM: &str = "com.google.protobuf.AbstractMessageLite.InternalOneOfEnum";

/// `"get" + UPPER_UNDERSCORE.to(UPPER_CAMEL, name)`.
fn getter(name: &str) -> String {
    let mut out = String::from("get");
    for word in name.split('_') {
        let mut chars = word.chars();
        if let Some(first) = chars.next() {
            out.push(first.to_ascii_uppercase());
            out.extend(chars.map(|value| value.to_ascii_lowercase()));
        }
    }
    out
}

fn case_names<'t>(context: &Context, case: Node<'t>) -> Vec<String> {
    let mut names = Vec::new();
    for label in children(case).into_iter().filter(|part| part.kind() == "switch_label") {
        for part in named_children(label) {
            let name = match part.kind() {
                "identifier" => context.text(part),
                "field_access" => part.child_by_field_name("field").map_or("", |field| context.text(field)),
                _ => continue,
            };
            names.push(getter(name));
        }
    }
    names
}

pub fn wrong_oneof(context: &Context, node: Node) {
    if node.kind() != "switch_expression" {
        return;
    }
    let Some(selector) = node.child_by_field_name("condition").and_then(|condition| condition.named_child(0)) else { return };
    let Some(Type::Class(name, _)) = context.resolver.type_of(selector) else { return };
    if !context.resolver.index.is_subtype(&name, ONE_OF_ENUM) {
        return;
    }
    let call = unparenthesized(selector);
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(target) = receiver(call) else { return };
    let constants = Constants::new(context);
    let Some(chain) = constants.expression(target) else { return };
    let Some(info) = context.resolver.index.get(&name) else { return };
    let getters: HashSet<String> = info.fields.iter().filter(|field| field.flags & flag::ENUM != 0).map(|field| getter(&field.name)).collect();
    let mut allowed: HashSet<String> = HashSet::new();
    for case in cases(node) {
        if is_default(context, case) {
            break;
        }
        allowed.extend(case_names(context, case));
        walk(case, |inner| {
            if inner.kind() != "method_invocation" {
                return;
            }
            let Some(called_on) = receiver(inner) else { return };
            if constants.expression(called_on).is_none_or(|found| found.key != chain.key) {
                return;
            }
            let Some(method) = inner.child_by_field_name("name").map(|name| context.text(name)) else { return };
            if !allowed.contains(method) && getters.contains(method) {
                let message = format!("{method} is guaranteed to return the default instance, given this is within a switch over a one_of.");
                context.report_fixed("WrongOneof", inner, position(inner), &message, &[]);
            }
        });
        if !can_fall_through(context, case) {
            allowed.clear();
        }
    }
}
