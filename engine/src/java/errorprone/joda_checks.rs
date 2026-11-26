//! Joda-Time checks: JodaInstantWithMillis, JodaNewPeriod, JodaPlusMinusLong and JodaTimeConverterManager.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::date_format::inside_joda;
use super::fixes::Fix;
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, class_of, name_text, preferred};
use super::qualify::qualify;
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn parameters_are(context: &Context, call: Node, wanted: &[&str]) -> bool {
    context.resolver.resolve_call(call).is_some_and(|resolved| {
        resolved.method.parameters.len() == wanted.len() && resolved.method.parameters.iter().zip(wanted).all(|(formal, want)| formal.name() == *want)
    })
}

fn call_receiver(call: Node) -> Option<Node> {
    call.child_by_field_name("object")
}

pub fn joda_instant_with_millis(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || name_text(context, node) != "withMillis" {
        return;
    }
    if !instance_on_exact_class(context, node, "org.joda.time.Instant", &["withMillis"]) || !parameters_are(context, node, &["long"]) || inside_joda(context) {
        return;
    }
    let args = arguments(node);
    let [argument] = args.as_slice() else { return };
    let replacement = format!("{}.ofEpochMilli(", qualify(context, node, "org.joda.time.Instant"));
    let fix = Fix::replace(node.start_byte(), argument.start_byte(), replacement).with_imports();
    let message = "Use of instant.withMillis(long) is not allowed. Use Instant.ofEpochMilli(long) instead.";
    context.report_fixed("JodaInstantWithMillis", node, preferred(node), message, &[fix]);
}

const PERIOD_GETTERS: [&str; 6] = ["getMonths", "getWeeks", "getDays", "getHours", "getMinutes", "getSeconds"];
const READABLE_PARTIAL: &str = "org.joda.time.ReadablePartial";
const READABLE_INSTANT: &str = "org.joda.time.ReadableInstant";

fn period_constructor(context: &Context, creation: Node) -> Option<Vec<Type>> {
    if class_of(context, creation).as_deref() != Some("org.joda.time.Period") {
        return None;
    }
    let formals = context.resolver.resolve_constructor(creation)?.method.parameters;
    let names: Vec<String> = formals.iter().map(|formal| formal.erased().name()).collect();
    let matches = |first: &str| names == [first, first];
    (matches("long") || matches(READABLE_PARTIAL) || matches(READABLE_INSTANT)).then_some(formals)
}

pub fn joda_new_period(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let unit = name_text(context, node);
    if !PERIOD_GETTERS.contains(&unit) {
        return;
    }
    let Some(receiver) = call_receiver(node).filter(|receiver| receiver.kind() == "object_creation_expression") else { return };
    if receiver_name(context, node, false).is_none_or(|owner| !is_descendant(context, &owner, &["org.joda.time.Period"])) {
        return;
    }
    let Some(formals) = period_constructor(context, receiver) else { return };
    let (Some(first), Some(second)) = (arguments(receiver).first().copied(), arguments(receiver).get(1).copied()) else { return };
    let (first, second) = (context.text(first), context.text(second));
    let unit = &unit["get".len()..];
    let replacement = if formals[0].clone().unboxed_or_same() == Type::Primitive("long") {
        format!("new {}({first}, {second}).getStandard{unit}()", qualify(context, node, "org.joda.time.Duration"))
    } else {
        let owner = qualify(context, node, &format!("org.joda.time.{unit}"));
        format!("{owner}.{}Between({first}, {second}).get{unit}()", unit.to_lowercase())
    };
    let fix = Fix::replace(node.start_byte(), node.end_byte(), replacement).with_imports();
    let message = "This may have surprising semantics, e.g. new Period(LocalDate.parse(\"1970-01-01\"), LocalDate.parse(\"1970-02-02\")).getDays() == 1, not 32.";
    context.report_fixed("JodaNewPeriod", node, preferred(node), message, &[fix]);
}

const PLUS_MINUS_TYPES: [&str; 4] = ["org.joda.time.DateMidnight", "org.joda.time.DateTime", "org.joda.time.Duration", "org.joda.time.Instant"];

pub fn joda_plus_minus_long(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !matches!(name_text(context, node), "plus" | "minus") {
        return;
    }
    if !PLUS_MINUS_TYPES.iter().any(|owner| instance_on_exact_class(context, node, owner, &["plus", "minus"])) || !parameters_are(context, node, &["long"]) || inside_joda(context) {
        return;
    }
    let Some(argument) = arguments(node).first().copied() else { return };
    let get_millis = argument.kind() == "method_invocation"
        && name_text(context, argument) == "getMillis"
        && receiver_name(context, argument, false).is_some_and(|owner| is_descendant(context, &owner, &["org.joda.time.ReadableDuration"]));
    let replacement = match call_receiver(argument).filter(|_| get_millis) {
        Some(receiver) => context.text(receiver).to_string(),
        None => format!("{}.millis({})", qualify(context, node, "org.joda.time.Duration"), context.text(argument)),
    };
    let fix = Fix::replace(argument.start_byte(), argument.end_byte(), replacement).with_imports();
    let message = "Use of JodaTime's type.plus(long) or type.minus(long) is not allowed (where <type> = {Duration,Instant,DateTime,DateMidnight}). Please use type.plus(Duration.millis(long)) or type.minus(Duration.millis(long)) instead.";
    context.report_fixed("JodaPlusMinusLong", node, preferred(node), message, &[fix]);
}

pub fn joda_time_converter_manager(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !static_on_class(context, node, "org.joda.time.convert.ConverterManager", &["getInstance"]) || inside_joda(context) {
        return;
    }
    let message = "Joda-Time's ConverterManager makes the semantics of DateTime/Instant/etc construction subject to global static state. If you need to define your own converters, use a helper.";
    context.report_fixed("JodaTimeConverterManager", node, preferred(node), message, &[]);
}
