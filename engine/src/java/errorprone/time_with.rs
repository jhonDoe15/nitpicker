//! Calls and constructors of `java.time` and Joda-Time that do not do what they look like: `withNanos`, `new Instant()` and the like.
use super::call_match::instance_on_exact_class;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::lookup::field_of;
use super::parts::{class_of, only_argument};
use super::positions::preferred as preferred_at;
use super::symbol_key::same_symbol;
use super::time_checks::nearby_scope;
use super::Context;
use crate::engine::source::{children, parent};
use crate::java::types::model::flag;
use tree_sitter::Node;

/// `Matchers.packageStartsWith`: the package or one of its subpackages.
fn package_starts_with(context: &Context, prefix: &str) -> bool {
    let package = context.resolver.scope.package.as_str();
    package.strip_prefix(prefix).is_some_and(|rest| rest.is_empty() || rest.starts_with('.'))
}

fn single_parameter(context: &Context, call: Node, name: &str) -> bool {
    context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters.len() == 1 && resolved.method.parameters[0].name() == name)
}

fn receiver_text<'f>(context: &'f Context, call: Node) -> Option<&'f str> {
    call.child_by_field_name("object").map(|receiver| context.text(receiver))
}

pub fn java_duration_with_nanos(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !instance_on_exact_class(context, call, "java.time.Duration", &["withNanos"]) {
        return;
    }
    if !single_parameter(context, call, "int") || package_starts_with(context, "java.time") {
        return;
    }
    let (Some(argument), Some(receiver)) = (only_argument(call), receiver_text(context, call)) else { return };
    let mut fix = Fix::new();
    let class = qualify_type(context, call, "java.time.Duration", &mut fix);
    let fix = fix.and(call.start_byte(), argument.start_byte(), format!("{class}.ofSeconds({receiver}.getSeconds(), "));
    context.report_fixed("JavaDurationWithNanos", call, preferred_at(context, call), "Use of java.time.Duration.withNanos(int) is not allowed.", &[fix]);
}

pub fn java_duration_with_seconds(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !instance_on_exact_class(context, call, "java.time.Duration", &["withSeconds"]) {
        return;
    }
    if !single_parameter(context, call, "long") || package_starts_with(context, "java.time") {
        return;
    }
    let (Some(argument), Some(receiver)) = (only_argument(call), receiver_text(context, call)) else { return };
    let mut fix = Fix::new();
    let class = qualify_type(context, call, "java.time.Duration", &mut fix);
    let fix = fix.and(call.start_byte(), call.end_byte(), format!("{class}.ofSeconds({}, {receiver}.getNano())", context.text(argument)));
    context.report_fixed("JavaDurationWithSeconds", call, preferred_at(context, call), "Use of java.time.Duration.withSeconds(long) is not allowed.", &[fix]);
}

pub fn joda_duration_with_millis(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !instance_on_exact_class(context, call, "org.joda.time.Duration", &["withMillis"]) {
        return;
    }
    if !single_parameter(context, call, "long") || package_starts_with(context, "org.joda.time") {
        return;
    }
    let Some(argument) = only_argument(call) else { return };
    let mut fix = Fix::new();
    let class = qualify_type(context, call, "org.joda.time.Duration", &mut fix);
    let fix = fix.and(call.start_byte(), argument.start_byte(), format!("{class}.millis("));
    let message = "Use of duration.withMillis(long) is not allowed. Please use Duration.millis(long) instead.";
    context.report_fixed("JodaDurationWithMillis", call, preferred_at(context, call), message, &[fix]);
}

/// `NearbyCallers.containsCallToSameReceiverNearby` without proto chains: a call of one of the methods on the same variable.
fn same_receiver_nearby(context: &Context, call: Node, class: &str, names: &[&str]) -> bool {
    let primary = call.child_by_field_name("object");
    nearby_scope(call).into_iter().any(|tree| scan(context, tree, primary, class, names))
}

fn scan(context: &Context, node: Node, primary: Option<Node>, class: &str, names: &[&str]) -> bool {
    if node.kind() == "lambda_expression" {
        return false;
    }
    if children(node).into_iter().any(|part| scan(context, part, primary, class, names)) {
        return true;
    }
    if node.kind() != "method_invocation" || !instance_on_exact_class(context, node, class, names) {
        return false;
    }
    match (primary, node.child_by_field_name("object")) {
        (Some(receiver), Some(other)) => same_symbol(context, receiver, other),
        _ => false,
    }
}

fn get_nano(context: &Context, call: Node, check: &'static str, class: &str, name: &str, others: &[&str], message: &str) {
    if call.kind() != "method_invocation" || !instance_on_exact_class(context, call, class, &[name]) || same_receiver_nearby(context, call, class, others) {
        return;
    }
    context.report_fixed(check, call, preferred_at(context, call), message, &[]);
}

pub fn java_instant_get_seconds_get_nano(context: &Context, call: Node) {
    let message = "instant.getNano() only accesses the underlying nanosecond adjustment from the whole second.";
    get_nano(context, call, "JavaInstantGetSecondsGetNano", "java.time.Instant", "getNano", &["getEpochSecond"], message);
}

pub fn java_local_date_time_get_nano(context: &Context, call: Node) {
    let message = "localDateTime.getNano() only access the nanos-of-second field. It's rare to only use getNano() without a nearby getSecond() call.";
    get_nano(context, call, "JavaLocalDateTimeGetNano", "java.time.LocalDateTime", "getNano", &["getSecond"], message);
}

pub fn java_local_time_get_nano(context: &Context, call: Node) {
    let message = "localTime.getNano() only accesses the nanos-of-second field. It's rare to only use getNano() without a nearby getSecond() call.";
    get_nano(context, call, "JavaLocalTimeGetNano", "java.time.LocalTime", "getNano", &["getSecond"], message);
}

pub fn java_period_get_days(context: &Context, call: Node) {
    let message = "period.getDays() only accesses the \"days\" portion of the Period, and doesn't represent the total span of time of the period. Consider using org.threeten.extra.Days to extract the difference between two civil dates if you want the whole time.";
    get_nano(context, call, "JavaPeriodGetDays", "java.time.Period", "getDays", &["getMonths", "getYears", "getTotalMonths"], message);
}

pub fn joda_constructors(context: &Context, creation: Node) {
    if creation.kind() != "object_creation_expression" || package_starts_with(context, "org.joda.time") {
        return;
    }
    if children(creation).into_iter().any(|part| part.kind() == "class_body") {
        return;
    }
    let Some(class) = class_of(context, creation) else { return };
    if !matches!(class.as_str(), "org.joda.time.Duration" | "org.joda.time.Instant" | "org.joda.time.DateTime") {
        return;
    }
    let Some(resolved) = context.resolver.resolve_constructor(creation) else { return };
    let parameters: Vec<String> = resolved.method.parameters.iter().map(|kind| kind.name()).collect();
    let parameters: Vec<&str> = parameters.iter().map(String::as_str).collect();
    let Some(identifier) = creation.child_by_field_name("type").map(|written| context.text(written)) else { return };
    let argument = only_argument(creation);
    let up_to_argument = |text: String| argument.map(|first| Fix::replace(creation.start_byte(), first.start_byte(), text));
    let fix = match (class.as_str(), parameters.as_slice()) {
        ("org.joda.time.Duration", ["long"]) => up_to_argument(format!("{identifier}.millis(")),
        ("org.joda.time.Instant" | "org.joda.time.DateTime", []) => Some(Fix::replace(creation.start_byte(), creation.end_byte(), format!("{identifier}.now()"))),
        ("org.joda.time.Instant", ["long"]) => up_to_argument(format!("{identifier}.ofEpochMilli(")),
        ("org.joda.time.DateTime", ["org.joda.time.Chronology"] | ["org.joda.time.DateTimeZone"]) => up_to_argument(format!("{identifier}.now(")),
        _ => None,
    };
    if let Some(fix) = fix {
        context.report_fixed("JodaConstructors", creation, super::parts::new_keyword(creation), "Use of certain JodaTime constructors are not allowed.", &[fix]);
    }
}

const DATE_TIME_CONSTANTS: [&str; 14] = [
    "HOURS_PER_DAY", "HOURS_PER_WEEK", "MILLIS_PER_DAY", "MILLIS_PER_HOUR", "MILLIS_PER_MINUTE", "MILLIS_PER_SECOND", "MILLIS_PER_WEEK", "MINUTES_PER_DAY",
    "MINUTES_PER_HOUR", "MINUTES_PER_WEEK", "SECONDS_PER_DAY", "SECONDS_PER_HOUR", "SECONDS_PER_MINUTE", "SECONDS_PER_WEEK",
];

/// An identifier that is an expression naming a variable, not a member name, a declared name or part of an import.
pub(super) fn names_variable(node: Node) -> bool {
    let Some(up) = parent(node) else { return false };
    let own = |field: &str| up.child_by_field_name(field) == Some(node);
    match up.kind() {
        "field_access" => !own("field"),
        "method_invocation" | "variable_declarator" | "formal_parameter" | "method_declaration" | "class_declaration" | "element_value_pair" | "method_reference" => !own("name"),
        "scoped_identifier" | "scoped_type_identifier" | "import_declaration" | "package_declaration" | "labeled_statement" | "break_statement" | "continue_statement" => false,
        _ => true,
    }
}

pub fn joda_date_time_constants(context: &Context, node: Node) {
    let name = match node.kind() {
        "identifier" if names_variable(node) => context.text(node),
        "field_access" => node.child_by_field_name("field").map(|field| context.text(field)).unwrap_or_default(),
        _ => return,
    };
    if !DATE_TIME_CONSTANTS.contains(&name) {
        return;
    }
    let Some((declaring, field)) = field_of(context, node) else { return };
    if declaring.name != "org.joda.time.DateTimeConstants" || field.name != name || field.flags & flag::STATIC == 0 {
        return;
    }
    let message = "Using the `_PER_` constants in `DateTimeConstants` is problematic because they encourage manual date/time math.";
    context.report_fixed("JodaDateTimeConstants", node, preferred_at(context, node), message, &[]);
}
