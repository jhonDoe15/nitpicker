//! Checks on `java.time` and `TimeUnit` calls: TimeUnitConversionChecker, JavaTimeDefaultTimeZone and the `Duration` pair.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::lookup::same_variable;
use super::positions::{arguments, preferred};
use crate::engine::source::{children, named_children, parent};
use tree_sitter::Node;

const UNITS: [(&str, i64); 7] =
    [("NANOSECONDS", 1), ("MICROSECONDS", 1_000), ("MILLISECONDS", 1_000_000), ("SECONDS", 1_000_000_000), ("MINUTES", 60_000_000_000), ("HOURS", 3_600_000_000_000), ("DAYS", 86_400_000_000_000)];
const CONVERSIONS: [(&str, &str); 7] =
    [("toDays", "DAYS"), ("toHours", "HOURS"), ("toMinutes", "MINUTES"), ("toSeconds", "SECONDS"), ("toMillis", "MILLISECONDS"), ("toMicros", "MICROSECONDS"), ("toNanos", "NANOSECONDS")];

const CONVERSION: &str = "This TimeUnit conversion looks buggy: converting from a smaller unit to a larger unit (and passing a constant), converting to/from the same TimeUnit, or converting TimeUnits where the result is statically known to be 0 or 1 are all buggy patterns.";
const GET_NANO: &str = "duration.getNano() only accesses the underlying nanosecond adjustment from the whole second.";
const TO_SECONDS: &str = "Prefer duration.toSeconds() over duration.getSeconds()";

const NOW_STATIC: [&str; 13] = [
    "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime",
    "java.time.Year", "java.time.YearMonth", "java.time.ZonedDateTime", "java.time.chrono.JapaneseDate", "java.time.chrono.MinguoDate",
    "java.time.chrono.HijrahDate", "java.time.chrono.ThaiBuddhistDate",
];
const DATE_NOW_INSTANCE: [&str; 6] = [
    "java.time.chrono.Chronology", "java.time.chrono.HijrahChronology", "java.time.chrono.IsoChronology", "java.time.chrono.JapaneseChronology",
    "java.time.chrono.MinguoChronology", "java.time.chrono.ThaiBuddhistChronology",
];

fn scale(name: &str) -> i64 {
    UNITS.iter().find(|(unit, _)| *unit == name).map_or(1, |(_, scale)| *scale)
}

fn rank(name: &str) -> usize {
    UNITS.iter().position(|(unit, _)| *unit == name).unwrap_or_default()
}

/// `TimeUnit.to...`: converts and saturates like the JDK.
fn convert(from: &str, to: &str, duration: i64) -> i64 {
    let (source, target) = (scale(from), scale(to));
    if source >= target {
        let ratio = source / target;
        let limit = i64::MAX / ratio;
        if duration > limit {
            i64::MAX
        } else if duration < -limit {
            i64::MIN
        } else {
            duration * ratio
        }
    } else {
        duration / (target / source)
    }
}

fn parse_long(text: &str) -> Option<i64> {
    let digits = text.strip_prefix('-').unwrap_or(text);
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

fn replace_with(call: Node, unit: &str, replacement: &str) -> Fix {
    Fix::new().insert(call.end_byte(), format!(" /* {} */", unit.to_lowercase())).and(call.start_byte(), call.end_byte(), replacement)
}

fn last_name<'f>(context: &'f Context, node: Node) -> Option<&'f str> {
    match node.kind() {
        "identifier" => Some(context.text(node)),
        "field_access" => node.child_by_field_name("field").map(|field| context.text(field)),
        "method_invocation" => node.child_by_field_name("name").map(|name| context.text(name)),
        _ => None,
    }
}

pub fn time_unit_conversion(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let Some((_, target)) = CONVERSIONS.iter().find(|(method, _)| *method == name) else { return };
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.is_static || resolved.receiver.erased().name() != "java.util.concurrent.TimeUnit" {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    let Some(unit) = last_name(context, receiver).and_then(|written| UNITS.iter().find(|(known, _)| *known == written)).map(|(known, _)| *known) else { return };
    let Some(first) = arguments(call).first().copied() else { return };
    let constant = parse_long(context.text(first));
    if let Some(constant) = constant {
        let converted = convert(unit, target, constant);
        if converted == 0 || converted == 1 || constant == converted {
            let fix = replace_with(call, target, &format!("{converted}L"));
            return context.report_fixed("TimeUnitConversionChecker", call, preferred(context, call), CONVERSION, &[fix]);
        }
        if rank(unit) < rank(target) {
            return context.report_fixed("TimeUnitConversionChecker", call, preferred(context, call), CONVERSION, &[]);
        }
    }
    if unit == *target {
        let fix = replace_with(call, target, context.text(first));
        context.report_fixed("TimeUnitConversionChecker", call, preferred(context, call), CONVERSION, &[fix]);
    }
}

fn package_starts_with(context: &Context, prefix: &str) -> bool {
    context.resolver.scope.package.starts_with(prefix)
}

pub fn java_time_default_time_zone(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !arguments(call).is_empty() || package_starts_with(context, "java.time") {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !matches!(name, "now" | "dateNow" | "systemDefaultZone") {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let owner = resolved.declaring.as_str();
    let listed = match name {
        "now" => resolved.method.is_static && NOW_STATIC.contains(&owner),
        "dateNow" => !resolved.method.is_static && DATE_NOW_INSTANCE.contains(&owner),
        _ => resolved.method.is_static && owner == "java.time.Clock",
    };
    if !listed {
        return;
    }
    let mut fix = Fix::new();
    let zone = qualify_type(context, call, "java.time.ZoneId", &mut fix);
    let code = format!("{zone}.systemDefault()");
    let clock = name == "systemDefaultZone" && resolved.method.parameters.is_empty() && owner == "java.time.Clock";
    let method = if clock { "system" } else { name };
    match call.child_by_field_name("object") {
        Some(receiver) => fix = fix.and(receiver.end_byte(), call.end_byte(), format!(".{method}({code})")),
        None => {
            if clock {
                fix = fix.with_imports();
            }
            fix = fix.and(call.start_byte(), call.end_byte(), format!("{method}({code})"));
        }
    }
    let simple = owner.rsplit('.').next().unwrap_or(owner);
    let message = format!("{simple}.{name}() is not allowed because it silently uses the system default time-zone. You must pass an explicit time-zone (e.g., ZoneId.of(\"America/Los_Angeles\")) to this method.");
    context.report_fixed("JavaTimeDefaultTimeZone", call, preferred(context, call), &message, &[fix]);
}

fn duration_call(context: &Context, call: Node, name: &str) -> bool {
    call.kind() == "method_invocation"
        && call.child_by_field_name("name").is_some_and(|called| context.text(called) == name)
        && arguments(call).is_empty()
        && call.child_by_field_name("object").is_some()
        && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && resolved.receiver.erased().name() == "java.time.Duration")
}

fn nearby_scope<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let mut current = parent(call);
    while let Some(at) = current {
        match at.kind() {
            "block" | "constructor_body" => return vec![at],
            "lambda_expression" => return at.child_by_field_name("body").into_iter().collect(),
            "class_body" => {
                let mut found = Vec::new();
                for member in named_children(at) {
                    if matches!(member.kind(), "field_declaration" | "constant_declaration") {
                        for declarator in crate::java::helpers::declarators(member) {
                            found.extend(declarator.child_by_field_name("value"));
                        }
                    }
                }
                return found;
            }
            _ => {}
        }
        current = parent(at);
    }
    Vec::new()
}

fn contains_same_receiver(context: &Context, call: Node, secondary: &str) -> bool {
    let primary = call.child_by_field_name("object");
    let mut found = false;
    for tree in nearby_scope(call) {
        scan(context, tree, true, primary, secondary, &mut found);
    }
    found
}

fn scan(context: &Context, node: Node, top: bool, primary: Option<Node>, secondary: &str, found: &mut bool) {
    if *found || (!top && node.kind() == "lambda_expression") {
        return;
    }
    for part in children(node) {
        scan(context, part, false, primary, secondary, found);
    }
    let matching = node.kind() == "method_invocation" && duration_call(context, node, secondary) && (secondary != "getNano" || !package_starts_with(context, "java."));
    if matching {
        if let (Some(receiver), Some(other)) = (primary, node.child_by_field_name("object")) {
            if same_variable(context, receiver, other) {
                *found = true;
            }
        }
    }
}

pub fn duration_get_seconds_get_nano(context: &Context, call: Node) {
    if package_starts_with(context, "java.") || !duration_call(context, call, "getNano") {
        return;
    }
    if !contains_same_receiver(context, call, "getSeconds") {
        context.report_fixed("JavaDurationGetSecondsGetNano", call, preferred(context, call), GET_NANO, &[]);
    }
}

pub fn duration_get_seconds_to_seconds(context: &Context, call: Node) {
    if !duration_call(context, call, "getSeconds") {
        return;
    }
    if !contains_same_receiver(context, call, "getNano") {
        let Some(name) = call.child_by_field_name("name") else { return };
        let fix = Fix::replace(name.start_byte(), name.end_byte(), "toSeconds");
        context.report_fixed("JavaDurationGetSecondsToToSeconds", call, preferred(context, call), TO_SECONDS, &[fix]);
    }
}

