//! ListRemoveAmbiguous: `List.remove` on a list of `Integer` where the reader cannot tell index from element.
use super::Context;
use super::call_match::static_on_class;
use super::comments::{find_comments, text_of_comment};
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::nodes::{position, unparenthesized};
use super::positions::arguments;
use crate::java::types::model::Type;
use tree_sitter::Node;

const LIST: &str = "java.util.List";
const INTEGER: &str = "java.lang.Integer";
const MESSAGE: &str = "Ambiguous call to List.remove; clarify if index-based or value-based removal was intended by adding a comment";

fn is_instance_call(context: &Context, call: Node, owner: &str, name: &str) -> bool {
    call.kind() == "method_invocation"
        && call.child_by_field_name("name").is_some_and(|written| context.text(written) == name)
        && context.resolver.resolve_call(call).is_some_and(|found| !found.method.is_static && context.resolver.index.is_subtype(&found.receiver.erased().name(), owner))
}

fn is_size_minus_one(context: &Context, argument: Node, receiver: Option<Node>) -> bool {
    let argument = unparenthesized(argument);
    if argument.kind() != "binary_expression" || argument.child_by_field_name("operator").is_none_or(|operator| context.text(operator) != "-") {
        return false;
    }
    let (Some(left), Some(right)) = (argument.child_by_field_name("left"), argument.child_by_field_name("right")) else { return false };
    let (left, right) = (unparenthesized(left), unparenthesized(right));
    if constant(context, right) != Some(Const::Int(1)) || !is_instance_call(context, left, LIST, "size") {
        return false;
    }
    if context.resolver.resolve_call(left).is_none_or(|found| !found.method.parameters.is_empty()) {
        return false;
    }
    same_receiver(context, receiver, left.child_by_field_name("object"))
}

fn same_receiver(context: &Context, first: Option<Node>, second: Option<Node>) -> bool {
    let (Some(first), Some(second)) = (first, second) else { return first.is_none() && second.is_none() };
    let (first, second) = (unparenthesized(first), unparenthesized(second));
    let names = |node: Node| matches!(node.kind(), "identifier" | "field_access");
    if names(first) && names(second) {
        return super::symbol_key::same_symbol(context, first, second);
    }
    context.text(first) == context.text(second)
}

fn sequenced_fix(context: &Context, call: Node, argument: Node) -> Option<Fix> {
    let receiver = call.child_by_field_name("object");
    let prefix = receiver.map_or(String::new(), |receiver| format!("{}.", context.text(receiver)));
    let name = if constant(context, argument) == Some(Const::Int(0)) {
        "removeFirst"
    } else if is_size_minus_one(context, argument, receiver) {
        "removeLast"
    } else {
        return None;
    };
    Some(Fix::replace(call.start_byte(), call.end_byte(), format!("{prefix}{name}()")))
}

pub fn list_remove_ambiguous(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "remove") {
        return;
    }
    if node.child_by_field_name("object").is_none() {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let method = &resolved.method;
    let index = context.resolver.index;
    let int = [Type::Primitive("int")];
    let object = [Type::class("java.lang.Object")];
    let (is_index, is_object) = (method.parameters == int, method.parameters == object);
    if method.is_static || (!is_index && !is_object) || !index.is_subtype(&resolved.receiver.erased().name(), LIST) {
        return;
    }
    let list = arguments(node);
    let [argument] = list[..] else { return };
    let expected = if is_index { "index" } else { "element" };
    let start = node.child_by_field_name("name").map_or(node.start_byte(), |name| name.end_byte());
    let commented = find_comments(context, node, &list, start);
    if commented.first().is_some_and(|first| first.before.iter().any(|comment| text_of_comment(comment).trim() == expected)) {
        return;
    }
    if static_on_class(context, argument, INTEGER, &["valueOf"]) || is_instance_call(context, argument, INTEGER, "intValue") {
        return;
    }
    let Some(kind) = context.resolver.type_of(argument) else { return };
    let unboxed = match &kind {
        Type::Class(name, _) if name == INTEGER => Type::Primitive("int"),
        other => other.clone(),
    };
    if unboxed != Type::Primitive("int") || resolved.raw {
        return;
    }
    let Some(found) = index.arguments_as(&resolved.receiver, LIST) else { return };
    let [element] = &found[..] else { return };
    if !matches!(element, Type::Class(name, given) if given.is_empty() && matches!(name.as_str(), INTEGER | "java.lang.Number")) {
        return;
    }
    let fix = if kind == Type::Primitive("int") {
        sequenced_fix(context, node, argument).unwrap_or_else(|| Fix::new().insert(argument.start_byte(), "/* index */ "))
    } else {
        Fix::new().insert(argument.start_byte(), "/* element */ ")
    };
    context.report_fixed("ListRemoveAmbiguous", node, position(node), MESSAGE, &[fix]);
}
