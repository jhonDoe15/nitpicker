//! DurationFrom, DurationGetTemporalUnit, DurationTemporalUnit and DurationToLongTimeUnit.
use super::Context;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use crate::java::types::model::Type;
use tree_sitter::Node;

const DURATION: &str = "java.time.Duration";
const TEMPORAL_UNIT: &str = "java.time.temporal.TemporalUnit";
const TIME_UNIT: &str = "java.util.concurrent.TimeUnit";

/// The name an enum constant is written with: `SECONDS` or `ChronoUnit.SECONDS`.
fn enum_name<'f>(context: &'f Context, node: Node) -> Option<&'f str> {
    match node.kind() {
        "identifier" => Some(context.text(node)),
        "field_access" => node.child_by_field_name("field").map(|field| context.text(field)),
        _ => None,
    }
}

fn parameters_are(context: &Context, call: Node, expected: &[Type]) -> bool {
    context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters == expected)
}

pub fn duration_from(context: &Context, call: Node) {
    if !static_on_class(context, call, DURATION, &["from"]) {
        return;
    }
    let Some(first) = arguments(call).first().copied() else { return };
    let message = "Duration.from(Duration) returns itself; from(Period) throws a runtime exception.";
    match context.resolver.type_of(first) {
        Some(Type::Class(name, _)) if name == "java.time.Period" => context.report_fixed("DurationFrom", call, preferred(context, call), message, &[]),
        Some(Type::Class(name, _)) if name == DURATION => {
            let fix = Fix::replace(call.start_byte(), call.end_byte(), context.text(first));
            context.report_fixed("DurationFrom", call, preferred(context, call), message, &[fix]);
        }
        _ => {}
    }
}

fn suggestion(unit: &str) -> Option<&'static str> {
    match unit {
        "DAYS" => Some(".toDays()"),
        "HOURS" => Some(".toHours()"),
        "MINUTES" => Some(".toMinutes()"),
        "MILLIS" => Some(".toMillis()"),
        _ => None,
    }
}

const CHRONO_UNITS: [&str; 16] = [
    "NANOS", "MICROS", "MILLIS", "SECONDS", "MINUTES", "HOURS", "HALF_DAYS", "DAYS", "WEEKS", "MONTHS", "YEARS", "DECADES", "CENTURIES", "MILLENNIA", "ERAS", "FOREVER",
];

pub fn duration_get_temporal_unit(context: &Context, call: Node) {
    if !instance_on_exact_class(context, call, DURATION, &["get"]) || !parameters_are(context, call, &[Type::class(TEMPORAL_UNIT)]) {
        return;
    }
    let [argument] = arguments(call)[..] else { return };
    let Some(unit) = enum_name(context, argument).filter(|unit| CHRONO_UNITS.contains(unit) && !matches!(*unit, "SECONDS" | "NANOS")) else { return };
    let message = "Duration.get() only works with SECONDS or NANOS.";
    let fix = suggestion(unit).zip(call.child_by_field_name("object")).map(|(text, receiver)| Fix::replace(call.start_byte(), call.end_byte(), format!("{}{text}", context.text(receiver))));
    context.report_fixed("DurationGetTemporalUnit", call, preferred(context, call), message, fix.as_slice());
}

const ESTIMATED: [&str; 8] = ["WEEKS", "MONTHS", "YEARS", "DECADES", "CENTURIES", "MILLENNIA", "ERAS", "FOREVER"];

pub fn duration_temporal_unit(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| !matches!(context.text(name), "of" | "plus" | "minus")) {
        return;
    }
    let parameters = [Type::Primitive("long"), Type::class(TEMPORAL_UNIT)];
    let matched = static_on_class(context, call, DURATION, &["of"]) || instance_on_exact_class(context, call, DURATION, &["plus", "minus"]);
    if !matched || context.resolver.scope.package.starts_with("java.") || !parameters_are(context, call, &parameters) {
        return;
    }
    let Some(unit) = arguments(call).get(1).and_then(|argument| enum_name(context, *argument)) else { return };
    if ESTIMATED.contains(&unit) {
        context.report_fixed("DurationTemporalUnit", call, preferred(context, call), "Duration APIs only work for DAYS or exact durations.", &[]);
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Instance,
    Static,
    Descendant,
}

const JAVA_DURATIONS: &str = "com.google.common.time.Durations";
const JAVA_INSTANTS: &str = "com.google.common.time.Instants";
const JODA_DURATION: &str = "org.joda.time.Duration";

const MATCHERS: [(Kind, &str, &str, &str); 26] = [
    (Kind::Instance, DURATION, "toNanos", "NANOSECONDS"),
    (Kind::Instance, DURATION, "toMillis", "MILLISECONDS"),
    (Kind::Instance, DURATION, "toSeconds", "SECONDS"),
    (Kind::Instance, DURATION, "getSeconds", "SECONDS"),
    (Kind::Instance, DURATION, "toMinutes", "MINUTES"),
    (Kind::Instance, DURATION, "toHours", "HOURS"),
    (Kind::Instance, DURATION, "toDays", "DAYS"),
    (Kind::Instance, "java.time.Instant", "toEpochMilli", "MILLISECONDS"),
    (Kind::Instance, "java.time.Instant", "getEpochSecond", "SECONDS"),
    (Kind::Static, JAVA_DURATIONS, "toNanosSaturated", "NANOSECONDS"),
    (Kind::Static, JAVA_DURATIONS, "toMicros", "MICROSECONDS"),
    (Kind::Static, JAVA_DURATIONS, "toMicrosSaturated", "MICROSECONDS"),
    (Kind::Static, JAVA_DURATIONS, "toMillisSaturated", "MILLISECONDS"),
    (Kind::Static, JAVA_INSTANTS, "toEpochNanos", "NANOSECONDS"),
    (Kind::Static, JAVA_INSTANTS, "toEpochNanosSaturated", "NANOSECONDS"),
    (Kind::Static, JAVA_INSTANTS, "toEpochMicros", "MICROSECONDS"),
    (Kind::Static, JAVA_INSTANTS, "toEpochMicrosSaturated", "MICROSECONDS"),
    (Kind::Static, JAVA_INSTANTS, "toEpochMillisSaturated", "MILLISECONDS"),
    (Kind::Instance, JODA_DURATION, "getStandardSeconds", "SECONDS"),
    (Kind::Instance, JODA_DURATION, "getStandardMinutes", "MINUTES"),
    (Kind::Instance, JODA_DURATION, "getStandardHours", "HOURS"),
    (Kind::Instance, JODA_DURATION, "getStandardDays", "DAYS"),
    (Kind::Descendant, "org.joda.time.ReadableDuration", "getMillis", "MILLISECONDS"),
    (Kind::Descendant, "org.joda.time.ReadableInstant", "getMillis", "MILLISECONDS"),
    (Kind::Instance, "com.google.protobuf.Duration", "getSeconds", "SECONDS"),
    (Kind::Instance, "com.google.protobuf.Timestamp", "getSeconds", "SECONDS"),
];

const UNITS: [&str; 7] = ["NANOSECONDS", "MICROSECONDS", "MILLISECONDS", "SECONDS", "MINUTES", "HOURS", "DAYS"];

fn expected_unit(context: &Context, call: Node) -> Option<&'static str> {
    if call.kind() != "method_invocation" {
        return None;
    }
    let name = context.text(call.child_by_field_name("name")?);
    MATCHERS.iter().filter(|(_, _, method, _)| *method == name).find_map(|(kind, owner, method, unit)| {
        let found = match kind {
            Kind::Instance => instance_on_exact_class(context, call, owner, &[method]),
            Kind::Static => static_on_class(context, call, owner, &[method]),
            Kind::Descendant => context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && context.resolver.index.is_subtype(&resolved.receiver.name(), owner)),
        };
        found.then_some(*unit)
    })
}

fn describe(context: &Context, call: Node, unit_node: Node, unit: &str) {
    let fix = Fix::replace(unit_node.start_byte(), unit_node.end_byte(), format!("TimeUnit.{unit}")).with_imports();
    let message = "Unit mismatch when decomposing a Duration or Instant to call a <long, TimeUnit> API";
    context.report_fixed("DurationToLongTimeUnit", call, preferred(context, call), message, &[fix]);
}

/// The unit the decomposing call on the first argument stands for, when it differs from the unit written beside it.
fn mismatch(context: &Context, first: Node, unit: &str) -> Option<String> {
    if let Some(expected) = expected_unit(context, first) {
        if expected != unit {
            return Some(expected.to_string());
        }
    }
    if instance_on_exact_class(context, first, TIME_UNIT, &["convert"]) && parameters_are(context, first, &[Type::class(DURATION)]) {
        let source = first.child_by_field_name("object").and_then(|receiver| enum_name(context, receiver)).filter(|name| UNITS.contains(name));
        return source.filter(|source| *source != unit).map(str::to_string);
    }
    None
}

pub fn duration_to_long_time_unit(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let list = arguments(call);
    for pair in list.windows(2) {
        let (first, unit_node) = (pair[0], pair[1]);
        let Some(unit) = enum_name(context, unit_node).filter(|unit| UNITS.contains(unit)) else { continue };
        if first.kind() != "method_invocation" {
            continue;
        }
        let Some(expected) = mismatch(context, first, unit) else { continue };
        if context.resolver.type_of(first) == Some(Type::Primitive("long")) && context.resolver.type_of(unit_node).is_some_and(|kind| kind.name() == TIME_UNIT) {
            return describe(context, call, unit_node, &expected);
        }
    }
}
