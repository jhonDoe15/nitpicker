//! FromTemporalAccessor and InstantTemporalUnit: `java.time` calls that cannot work or do nothing.
use super::Context;
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::java::types::model::Type;
use tree_sitter::Node;

const TEMPORAL_ACCESSOR: &str = "java.time.temporal.TemporalAccessor";

/// Each `java.time` type with the types whose `from(TemporalAccessor)` cannot take it.
const BAD_VALUE_FROM: &[(&str, &[&str])] = &[
    ("java.time.DayOfWeek", &["java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("java.time.Instant", &["java.time.DayOfWeek", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("java.time.LocalDate", &["java.time.Instant", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm"]),
    ("java.time.LocalDateTime", &["java.time.Instant", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.ZonedDateTime", "java.time.ZoneOffset"]),
    ("java.time.LocalTime", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("java.time.Month", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("java.time.MonthDay", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfYear", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("java.time.OffsetDateTime", &[]),
    ("java.time.OffsetTime", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("java.time.Year", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("java.time.YearMonth", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.YearWeek"]),
    ("java.time.ZonedDateTime", &[]),
    ("java.time.ZoneOffset", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("org.threeten.extra.AmPm", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("org.threeten.extra.DayOfMonth", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("org.threeten.extra.DayOfYear", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("org.threeten.extra.Quarter", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.YearQuarter", "org.threeten.extra.YearWeek"]),
    ("org.threeten.extra.YearQuarter", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.YearWeek"]),
    ("org.threeten.extra.YearWeek", &["java.time.DayOfWeek", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.ZoneOffset", "org.threeten.extra.AmPm", "org.threeten.extra.DayOfMonth", "org.threeten.extra.DayOfYear", "org.threeten.extra.Quarter", "org.threeten.extra.YearQuarter"]),
];

fn static_from(context: &Context, call: Node) -> bool {
    call.child_by_field_name("name").is_some_and(|name| context.text(name) == "from")
        && context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static && resolved.method.parameters == [Type::class(TEMPORAL_ACCESSOR)])
}

pub fn from_temporal_accessor(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_from(context, call) {
        return;
    }
    let package = context.resolver.scope.package.as_str();
    if ["java.time", "org.threeten.extra", "tck.java.time"].iter().any(|prefix| package.starts_with(prefix)) {
        return;
    }
    let Some(receiver) = receiver_class(context, call) else { return };
    if !receiver.starts_with("java.time") && !receiver.starts_with("org.threeten.extra") {
        return;
    }
    let list = arguments(call);
    let Some(argument) = list.first().filter(|_| list.len() == 1) else { return };
    let Some(given) = context.resolver.type_of(*argument).map(|kind| kind.erased().name()) else { return };
    if given == TEMPORAL_ACCESSOR {
        return;
    }
    let message = "Certain combinations of javaTimeType.from(TemporalAccessor) will always throw a DateTimeException or return the parameter directly.";
    let result = context.resolver.type_of(call).map(|kind| kind.erased().name());
    if result.as_deref() == Some(given.as_str()) {
        let fix = Fix::replace(call.start_byte(), call.end_byte(), context.text(*argument));
        context.report_fixed("FromTemporalAccessor", call, preferred(context, call), message, &[fix]);
        return;
    }
    let bad = BAD_VALUE_FROM.iter().any(|(key, targets)| *key == given && targets.contains(&receiver.as_str()));
    if bad {
        context.report_fixed("FromTemporalAccessor", call, preferred(context, call), message, &[]);
    }
}

const INVALID_UNITS: [&str; 8] = ["WEEKS", "MONTHS", "YEARS", "DECADES", "CENTURIES", "MILLENNIA", "ERAS", "FOREVER"];

fn invalid_unit(context: &Context, argument: Node) -> bool {
    let name = match argument.kind() {
        "identifier" => Some(context.text(argument)),
        "field_access" => argument.child_by_field_name("field").map(|field| context.text(field)),
        _ => None,
    };
    name.is_some_and(|name| INVALID_UNITS.contains(&name))
}

pub fn instant_temporal_unit(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !matches!(call.child_by_field_name("name").map(|name| context.text(name)), Some("minus" | "plus" | "until")) {
        return;
    }
    let list = arguments(call);
    if list.len() != 2 || super::call_consts::package_starts_with(context, "java.") || receiver_class(context, call).as_deref() != Some("java.time.Instant") {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let method = &resolved.method;
    let unit = Type::class("java.time.temporal.TemporalUnit");
    let first = match method.name.as_str() {
        "until" => Type::class("java.time.temporal.Temporal"),
        _ => Type::Primitive("long"),
    };
    if method.is_static || method.parameters != [first, unit] || !invalid_unit(context, list[1]) {
        return;
    }
    let message = "Instant APIs only work for NANOS, MICROS, MILLIS, SECONDS, MINUTES, HOURS, HALF_DAYS and DAYS.";
    context.report_fixed("InstantTemporalUnit", call, preferred(context, call), message, &[]);
}
