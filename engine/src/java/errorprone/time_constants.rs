//! InvalidTimeZoneID, InvalidZoneId and InvalidJavaTimeConstant: `java.time` and `TimeZone` calls with a constant that always fails.
use super::Context;
use super::call_consts::package_starts_with;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use super::zone_ids::{time_zone_valid, zone_id_valid};
use crate::java::types::model::Type;
use tree_sitter::Node;

fn string_argument<'t>(context: &Context, call: Node<'t>, parameter_count: usize) -> Option<(Node<'t>, String)> {
    let list = arguments(call);
    let first = list.first().copied().filter(|_| list.len() == parameter_count)?;
    match constant(context, first)? {
        Const::Str(text) => Some((first, text)),
        _ => None,
    }
}

pub fn invalid_time_zone_id(context: &Context, call: Node) {
    if !static_on_class(context, call, "java.util.TimeZone", &["getTimeZone"]) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.parameters != [Type::class("java.lang.String")] {
        return;
    }
    let Some((argument, value)) = string_argument(context, call, 1) else { return };
    if time_zone_valid(&value) {
        return;
    }
    let mut fixes = Vec::new();
    let underscores = value.replace(' ', "_");
    if time_zone_valid(&underscores) {
        fixes.push(Fix::replace(argument.start_byte(), argument.end_byte(), format!("\"{underscores}\"")));
    }
    let message = "Invalid time zone identifier. TimeZone.getTimeZone(String) will silently return GMT instead of the time zone you intended.";
    context.report_fixed("InvalidTimeZoneID", call, preferred(context, call), message, &fixes);
}

pub fn invalid_zone_id(context: &Context, call: Node) {
    if !static_on_class(context, call, "java.time.ZoneId", &["of"]) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.parameters != [Type::class("java.lang.String")] {
        return;
    }
    let Some((_, value)) = string_argument(context, call, 1) else { return };
    if !zone_id_valid(&value) {
        context.report_fixed("InvalidZoneId", call, preferred(context, call), "Invalid zone identifier. ZoneId.of(String) will throw exception at runtime.", &[]);
    }
}

/// A `ChronoField`: its display name, the text of its range, and the range.
type Field = (&'static str, &'static str, i64, i64);

const NANO_OF_SECOND: Field = ("NanoOfSecond", "0 - 999999999", 0, 999_999_999);
const NANO_OF_DAY: Field = ("NanoOfDay", "0 - 86399999999999", 0, 86_399_999_999_999);
const SECOND_OF_MINUTE: Field = ("SecondOfMinute", "0 - 59", 0, 59);
const SECOND_OF_DAY: Field = ("SecondOfDay", "0 - 86399", 0, 86_399);
const MINUTE_OF_HOUR: Field = ("MinuteOfHour", "0 - 59", 0, 59);
const HOUR_OF_DAY: Field = ("HourOfDay", "0 - 23", 0, 23);
const DAY_OF_WEEK: Field = ("DayOfWeek", "1 - 7", 1, 7);
const DAY_OF_MONTH: Field = ("DayOfMonth", "1 - 28/31", 1, 31);
const DAY_OF_YEAR: Field = ("DayOfYear", "1 - 365/366", 1, 366);
const EPOCH_DAY: Field = ("EpochDay", "-365243219162 - 365241780471", -365_243_219_162, 365_241_780_471);
const MONTH_OF_YEAR: Field = ("MonthOfYear", "1 - 12", 1, 12);
const YEAR: Field = ("Year", "-999999999 - 999999999", -999_999_999, 999_999_999);

const INT: &str = "int";
const LONG: &str = "long";
const MONTH: &str = "java.time.Month";

/// Class, whether the method is static, name, and the type and field of each parameter.
type Api = (&'static str, bool, &'static str, &'static [(&'static str, Field)]);

const APIS: &[Api] = &[
    ("java.time.DayOfWeek", true, "of", &[(INT, DAY_OF_WEEK)]),
    ("java.time.Month", true, "of", &[(INT, MONTH_OF_YEAR)]),
    ("java.time.Year", true, "of", &[(INT, YEAR)]),
    ("java.time.Year", false, "atDay", &[(INT, DAY_OF_YEAR)]),
    ("java.time.Year", false, "atMonth", &[(INT, MONTH_OF_YEAR)]),
    ("java.time.YearMonth", true, "of", &[(INT, YEAR), (INT, MONTH_OF_YEAR)]),
    ("java.time.YearMonth", true, "of", &[(INT, YEAR), (MONTH, MONTH_OF_YEAR)]),
    ("java.time.YearMonth", false, "atDay", &[(INT, DAY_OF_MONTH)]),
    ("java.time.YearMonth", false, "withMonth", &[(INT, MONTH_OF_YEAR)]),
    ("java.time.YearMonth", false, "withYear", &[(INT, YEAR)]),
    ("java.time.MonthDay", true, "of", &[(INT, MONTH_OF_YEAR), (INT, DAY_OF_MONTH)]),
    ("java.time.MonthDay", true, "of", &[(MONTH, MONTH_OF_YEAR), (INT, DAY_OF_MONTH)]),
    ("java.time.MonthDay", false, "atYear", &[(INT, YEAR)]),
    ("java.time.MonthDay", false, "withDayOfMonth", &[(INT, DAY_OF_MONTH)]),
    ("java.time.MonthDay", false, "withMonth", &[(INT, MONTH_OF_YEAR)]),
    ("java.time.LocalTime", true, "of", &[(INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR)]),
    ("java.time.LocalTime", true, "of", &[(INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR), (INT, SECOND_OF_MINUTE)]),
    ("java.time.LocalTime", true, "of", &[(INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR), (INT, SECOND_OF_MINUTE), (INT, NANO_OF_SECOND)]),
    ("java.time.LocalTime", true, "ofNanoOfDay", &[(LONG, NANO_OF_DAY)]),
    ("java.time.LocalTime", true, "ofSecondOfDay", &[(LONG, SECOND_OF_DAY)]),
    ("java.time.LocalTime", false, "withHour", &[(INT, HOUR_OF_DAY)]),
    ("java.time.LocalTime", false, "withMinute", &[(INT, MINUTE_OF_HOUR)]),
    ("java.time.LocalTime", false, "withNano", &[(INT, NANO_OF_SECOND)]),
    ("java.time.LocalTime", false, "withSecond", &[(INT, SECOND_OF_MINUTE)]),
    ("java.time.LocalDate", true, "of", &[(INT, YEAR), (INT, MONTH_OF_YEAR), (INT, DAY_OF_MONTH)]),
    ("java.time.LocalDate", true, "of", &[(INT, YEAR), (MONTH, MONTH_OF_YEAR), (INT, DAY_OF_MONTH)]),
    ("java.time.LocalDate", true, "ofEpochDay", &[(LONG, EPOCH_DAY)]),
    ("java.time.LocalDate", true, "ofYearDay", &[(INT, YEAR), (INT, DAY_OF_YEAR)]),
    ("java.time.LocalDate", false, "withDayOfMonth", &[(INT, DAY_OF_MONTH)]),
    ("java.time.LocalDate", false, "withDayOfYear", &[(INT, DAY_OF_YEAR)]),
    ("java.time.LocalDate", false, "withMonth", &[(INT, MONTH_OF_YEAR)]),
    ("java.time.LocalDate", false, "withYear", &[(INT, YEAR)]),
    ("java.time.LocalDateTime", true, "of", &[(INT, YEAR), (INT, MONTH_OF_YEAR), (INT, DAY_OF_MONTH), (INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR)]),
    ("java.time.LocalDateTime", true, "of", &[(INT, YEAR), (MONTH, MONTH_OF_YEAR), (INT, DAY_OF_MONTH), (INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR)]),
    ("java.time.LocalDateTime", true, "of", &[(INT, YEAR), (INT, MONTH_OF_YEAR), (INT, DAY_OF_MONTH), (INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR), (INT, SECOND_OF_MINUTE)]),
    ("java.time.LocalDateTime", true, "of", &[(INT, YEAR), (MONTH, MONTH_OF_YEAR), (INT, DAY_OF_MONTH), (INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR), (INT, SECOND_OF_MINUTE)]),
    ("java.time.LocalDateTime", true, "of", &[(INT, YEAR), (INT, MONTH_OF_YEAR), (INT, DAY_OF_MONTH), (INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR), (INT, SECOND_OF_MINUTE), (INT, NANO_OF_SECOND)]),
    ("java.time.LocalDateTime", true, "of", &[(INT, YEAR), (MONTH, MONTH_OF_YEAR), (INT, DAY_OF_MONTH), (INT, HOUR_OF_DAY), (INT, MINUTE_OF_HOUR), (INT, SECOND_OF_MINUTE), (INT, NANO_OF_SECOND)]),
    ("java.time.LocalDateTime", false, "withDayOfMonth", &[(INT, DAY_OF_MONTH)]),
    ("java.time.LocalDateTime", false, "withDayOfYear", &[(INT, DAY_OF_YEAR)]),
    ("java.time.LocalDateTime", false, "withHour", &[(INT, HOUR_OF_DAY)]),
    ("java.time.LocalDateTime", false, "withMinute", &[(INT, MINUTE_OF_HOUR)]),
    ("java.time.LocalDateTime", false, "withMonth", &[(INT, MONTH_OF_YEAR)]),
    ("java.time.LocalDateTime", false, "withNano", &[(INT, NANO_OF_SECOND)]),
    ("java.time.LocalDateTime", false, "withSecond", &[(INT, SECOND_OF_MINUTE)]),
    ("java.time.LocalDateTime", false, "withYear", &[(INT, YEAR)]),
];

pub fn invalid_java_time_constant(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !APIS.iter().any(|api| api.2 == name) || package_starts_with(context, "java.") || package_starts_with(context, "tck.java.") {
        return;
    }
    let Some(receiver) = receiver_class(context, call) else { return };
    if !APIS.iter().any(|api| api.0 == receiver && api.2 == name) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let formals: Vec<String> = resolved.method.parameters.iter().map(Type::name).collect();
    let list = arguments(call);
    for (owner, is_static, method, parameters) in APIS {
        let matched = *owner == receiver
            && *method == name
            && parameters.len() == formals.len()
            && parameters.iter().zip(&formals).all(|((kind, _), formal)| kind == formal)
            && if *is_static { static_on_class(context, call, owner, &[name]) } else { instance_on_exact_class(context, call, owner, &[name]) };
        if !matched {
            continue;
        }
        for (argument, (_, (display, range, low, high))) in list.iter().zip(*parameters) {
            let value = match constant(context, *argument) {
                Some(Const::Int(number)) => i64::from(number),
                Some(Const::Long(number)) => number,
                _ => continue,
            };
            if value < *low || value > *high {
                let message = format!("Invalid value for {display} (valid values {range}): {value}");
                return context.report_fixed("InvalidJavaTimeConstant", call, preferred(context, *argument), &message, &[]);
            }
        }
        return;
    }
}
