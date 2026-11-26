//! RandomCast, RandomModInteger and StringBuilderInitWithChar.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::java_quote::{character_value, quote};
use super::operators::operator;
use super::parts::{arguments, class_of, preferred};
use super::Context;
use crate::engine::source::parent;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn random_number(context: &Context, call: Node) -> bool {
    instance_on_exact_class(context, call, "java.util.Random", &["nextFloat", "nextDouble"]) || static_on_class(context, call, "java.lang.Math", &["random"])
}

pub fn random_cast(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| !matches!(context.text(name), "nextFloat" | "nextDouble" | "random")) {
        return;
    }
    let mut above = parent(node);
    while let Some(up) = above.filter(|up| up.kind() == "parenthesized_expression") {
        above = parent(up);
    }
    let Some(cast) = above.filter(|up| up.kind() == "cast_expression") else { return };
    let integral = cast.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).is_some_and(|kind| matches!(kind, Type::Primitive("int" | "long")));
    if integral && random_number(context, node) {
        let message = "Casting a random number in the range [0.0, 1.0) to an integer or long always results in 0.";
        context.report_fixed("RandomCast", node, preferred(node), message, &[]);
    }
}

pub fn random_mod_integer(context: &Context, node: Node) {
    if node.kind() != "binary_expression" || operator(node).is_none_or(|own| context.text(own) != "%") {
        return;
    }
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    if left.kind() != "method_invocation" || left.child_by_field_name("name").is_none_or(|name| context.text(name) != "nextInt") || !context.resolver.matches_sig(left, "java.util.Random#nextInt()") {
        return;
    }
    let receiver = left.child_by_field_name("object").map(|object| context.text(object)).unwrap_or("null");
    let fix = Fix::replace(node.start_byte(), node.end_byte(), format!("{receiver}.nextInt({})", context.text(right)));
    context.report_fixed("RandomModInteger", node, operator(node).map_or(node.start_byte(), |own| own.start_byte()), "Use Random.nextInt(int).  Random.nextInt() % n can have negative results", &[fix]);
}

pub fn string_builder_init_with_char(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression" || class_of(context, node).as_deref() != Some("java.lang.StringBuilder") {
        return;
    }
    let args = arguments(node);
    let [argument] = args.as_slice() else { return };
    if context.resolver.type_of(*argument) != Some(Type::Primitive("char")) {
        return;
    }
    let fix = match argument.kind() {
        "character_literal" => match character_value(context.text(*argument)) {
            Some(value) => Fix::replace(argument.start_byte(), argument.end_byte(), format!("\"{}\"", quote(&value.to_string()))),
            None => return,
        },
        _ => Fix::replace(node.start_byte(), node.end_byte(), format!("new StringBuilder().append({})", context.text(*argument))),
    };
    let message = "StringBuilder does not have a char constructor; this invokes the int constructor.";
    context.report_fixed("StringBuilderInitWithChar", node, preferred(node), message, &[fix]);
}
