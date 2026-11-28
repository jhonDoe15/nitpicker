//! PreconditionsCheckNotNullRepeated, PrimitiveArrayPassedToVarargsMethod, PrimitiveAtomicReference and the proto
//! `getSeconds` / `getNanos` checks.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::lookup::field_of;
use super::owners::{is_descendant, receiver_name};
use super::parts::arguments;
use super::positions::preferred;
use super::symbol_key::same_symbol;
use super::time_checks::nearby_scope;
use super::Context;
use crate::engine::source::children;
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub fn preconditions_check_not_null_repeated(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "com.google.common.base.Preconditions", &["checkNotNull"]) {
        return;
    }
    let args = arguments(call);
    if args.len() < 2 {
        return;
    }
    for argument in args.iter().skip(1) {
        if !same_symbol(context, args[0], *argument) {
            continue;
        }
        let source = context.text(args[0]);
        let message = format!("Including `{source}` in the failure message isn't helpful, since its value will always be `null`.");
        let fixes = if args.len() == 2 { vec![Fix::replace(argument.start_byte(), argument.end_byte(), format!("\"{source} must not be null\""))] } else { Vec::new() };
        context.report_fixed("PreconditionsCheckNotNullRepeated", call, preferred(context, *argument), &message, &fixes);
        return;
    }
}

pub fn primitive_array_passed_to_varargs_method(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if !resolved.method.varargs {
        return;
    }
    let args = arguments(call);
    let Some(Type::Array(component)) = resolved.method.parameters.last().cloned() else { return };
    if args.len() != resolved.method.parameters.len() {
        return;
    }
    let Some(last) = args.last() else { return };
    let Some(argument) = context.resolver.type_of(*last) else { return };
    if !matches!(&argument, Type::Array(element) if matches!(**element, Type::Primitive(_))) {
        return;
    }
    if Type::Array(component.clone()) == argument || *component == argument {
        return;
    }
    context.report_fixed("PrimitiveArrayPassedToVarargsMethod", call, preferred(context, call), "Passing a primitive array to a varargs method is usually wrong", &[]);
}

const BOXES: [&str; 8] =
    ["java.lang.Integer", "java.lang.Long", "java.lang.Boolean", "java.lang.Character", "java.lang.Byte", "java.lang.Short", "java.lang.Float", "java.lang.Double"];

/// `Types.unboxedType(t)` is not NONE: a box class, or a type variable that has one as a bound.
fn unboxes(context: &Context, at: Node, kind: &Type) -> bool {
    match kind {
        Type::Class(name, _) => BOXES.contains(&name.as_str()),
        Type::Variable(name) => {
            let Some(parameter) = crate::java::types::scope::type_parameter(context.file, at, name) else { return false };
            children(parameter).into_iter().filter(|part| part.kind() == "type_bound").flat_map(children).filter(|part| part.is_named()).any(|bound| {
                context.resolver.class_name(bound, context.text(bound)).is_some_and(|class| BOXES.contains(&class.as_str()))
            })
        }
        _ => false,
    }
}

pub fn primitive_atomic_reference(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| !matches!(context.text(name), "compareAndSet" | "weakCompareAndSet")) {
        return;
    }
    if !receiver_name(context, call, false).is_some_and(|owner| is_descendant(context, &owner, &["java.util.concurrent.atomic.AtomicReference"])) {
        return;
    }
    let args = arguments(call);
    if args.first().is_none_or(|first| first.kind() == "null_literal") {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    let Some(Type::Class(_, arguments)) = context.resolver.type_of(receiver) else { return };
    let Some(first) = arguments.first() else { return };
    if !unboxes(context, call, first) {
        return;
    }
    let message = "Using compareAndSet with boxed primitives is dangerous, as reference rather than value equality is used. Consider using AtomicInteger, AtomicLong, AtomicBoolean from JDK or AtomicDouble from Guava instead.";
    context.report_fixed("PrimitiveAtomicReference", call, preferred(context, call), message, &[]);
}

fn is_variable(context: &Context, node: Node) -> bool {
    match node.kind() {
        "this" => true,
        "identifier" => matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Local(_) | Binding::Field(..))),
        "field_access" => field_of(context, node).is_some(),
        _ => false,
    }
}

/// `ASTHelpers.getRootAssignable`: the variable a chain of calls and field accesses starts from.
fn root_assignable<'t>(context: &Context, call: Node<'t>) -> Option<Node<'t>> {
    let mut expression = call.child_by_field_name("object")?;
    while expression.kind() == "method_invocation" {
        expression = expression.child_by_field_name("object")?;
    }
    is_variable(context, expression).then_some(expression)
}

/// An immutable proto getter: `get...` without parameters on a generated message.
fn is_proto_getter(context: &Context, call: Node) -> bool {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !name.strip_prefix("get").is_some_and(|rest| !rest.is_empty() && !matches!(rest, "CachedSize" | "SerializedSize")) {
        return false;
    }
    arguments(call).is_empty()
        && receiver_name(context, call, false).is_some_and(|owner| is_descendant(context, &owner, &["com.google.protobuf.GeneratedMessage", "com.google.protobuf.GeneratedMessageLite"]))
}

/// One link of a getter chain: a method, or the variable the chain starts at.
enum Link<'t> {
    Method(String),
    Other(Node<'t>),
    Nothing,
}

fn link_of<'t>(context: &Context, node: Node<'t>) -> Link<'t> {
    match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node).map_or(Link::Nothing, |found| Link::Method(format!("{}.{}{:?}", found.declaring, found.method.name, found.method.parameters))),
        "identifier" | "field_access" | "this" => Link::Other(node),
        _ => Link::Nothing,
    }
}

fn build_chain<'t>(context: &Context, call: Node<'t>) -> Option<Vec<Link<'t>>> {
    let mut chain = Vec::new();
    let mut expression = call;
    loop {
        if !is_proto_getter(context, expression) {
            return None;
        }
        let Some(next) = expression.child_by_field_name("object") else {
            chain.push(link_of(context, expression));
            return Some(chain);
        };
        chain.push(link_of(context, next));
        if next.kind() != "method_invocation" {
            return Some(chain);
        }
        expression = next;
    }
}

fn same_chain(context: &Context, first: &[Link], second: &[Link]) -> bool {
    first.len() == second.len()
        && first.iter().zip(second).all(|pair| match pair {
            (Link::Method(a), Link::Method(b)) => a == b,
            (Link::Other(a), Link::Other(b)) => same_symbol(context, *a, *b),
            (Link::Nothing, Link::Nothing) => true,
            _ => false,
        })
}

fn proto_chains_match(context: &Context, primary: Node, secondary: Node) -> bool {
    let (Some(first), Some(second)) = (root_assignable(context, primary), root_assignable(context, secondary)) else { return false };
    if !same_symbol(context, first, second) {
        return false;
    }
    match (build_chain(context, primary), build_chain(context, secondary)) {
        (Some(a), Some(b)) => same_chain(context, &a, &b),
        _ => false,
    }
}

fn scan(context: &Context, node: Node, primary: Node, class: &str, seconds: &str) -> bool {
    if node.kind() == "lambda_expression" {
        return false;
    }
    if children(node).into_iter().any(|part| scan(context, part, primary, class, seconds)) {
        return true;
    }
    if node.kind() != "method_invocation" || !instance_on_exact_class(context, node, class, &[seconds]) {
        return false;
    }
    let Some(other) = node.child_by_field_name("object") else { return false };
    if primary.child_by_field_name("object").is_some_and(|receiver| same_symbol(context, receiver, other)) {
        return true;
    }
    proto_chains_match(context, primary, node)
}

fn proto_get_nanos(context: &Context, call: Node, check: &'static str, class: &str, message: &str) {
    if call.kind() != "method_invocation" || !instance_on_exact_class(context, call, class, &["getNanos"]) {
        return;
    }
    if nearby_scope(call).into_iter().any(|tree| scan(context, tree, call, class, "getSeconds")) {
        return;
    }
    context.report_fixed(check, call, preferred(context, call), message, &[]);
}

pub fn proto_duration_get_seconds_get_nano(context: &Context, call: Node) {
    let message = "getNanos() only accesses the underlying nanosecond-adjustment of the duration.";
    proto_get_nanos(context, call, "ProtoDurationGetSecondsGetNano", "com.google.protobuf.Duration", message);
}

pub fn proto_timestamp_get_seconds_get_nano(context: &Context, call: Node) {
    let message = "getNanos() only accesses the underlying nanosecond-adjustment of the instant.";
    proto_get_nanos(context, call, "ProtoTimestampGetSecondsGetNano", "com.google.protobuf.Timestamp", message);
}
