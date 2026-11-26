//! ThreeLetterTimeZoneID: `TimeZone.getTimeZone` with a deprecated three-letter id.
use super::Context;
use super::call_match::static_on_class;
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use crate::engine::source::parent;
use crate::java::types::model::Type;
use tree_sitter::Node;

const SUMMARY: &str = "Three-letter time zone identifiers are deprecated, may be ambiguous, and might not do what you intend; the full IANA time zone ID should be used instead.";

/// The documented `ZoneId.SHORT_IDS`, without the three fixed offsets that the check handles itself.
const SHORT_IDS: &[(&str, &str)] = &[
    ("ACT", "Australia/Darwin"),
    ("AET", "Australia/Sydney"),
    ("AGT", "America/Argentina/Buenos_Aires"),
    ("ART", "Africa/Cairo"),
    ("AST", "America/Anchorage"),
    ("BET", "America/Sao_Paulo"),
    ("BST", "Asia/Dhaka"),
    ("CAT", "Africa/Harare"),
    ("CNT", "America/St_Johns"),
    ("CST", "America/Chicago"),
    ("CTT", "Asia/Shanghai"),
    ("EAT", "Africa/Addis_Ababa"),
    ("ECT", "Europe/Paris"),
    ("IET", "America/Indiana/Indianapolis"),
    ("IST", "Asia/Kolkata"),
    ("JST", "Asia/Tokyo"),
    ("MIT", "Pacific/Apia"),
    ("NET", "Asia/Yerevan"),
    ("NST", "Pacific/Auckland"),
    ("PLT", "Asia/Karachi"),
    ("PNT", "America/Phoenix"),
    ("PRT", "America/Puerto_Rico"),
    ("PST", "America/Los_Angeles"),
    ("SST", "Pacific/Guadalcanal"),
    ("VST", "Asia/Ho_Chi_Minh"),
];

/// The "X Standard Time" ids that observe daylight saving time, with their raw offset in whole hours.
const OBSERVING: &[(&str, i64)] = &[("AST", -9), ("CST", -6), ("NST", 12), ("PST", -8)];

fn observes(zone: &str, kind: &str, fixed: &str) -> String {
    format!("This {kind} will observe daylight savings. If this is intended, use {zone} instead; otherwise use {fixed}.")
}

fn non_daylight(joda: bool, daylight: &str, fixed: &str) -> (String, Vec<String>) {
    if joda {
        let message = format!("{SUMMARY}\n\n{}", observes(daylight, "DateTimeZone", fixed));
        return (message, vec![daylight.to_string(), fixed.to_string()]);
    }
    let message = format!("{SUMMARY}\n\nThis TimeZone will not observe daylight savings. If this is intended, use {fixed} instead; to observe daylight savings, use {daylight}.");
    (message, vec![fixed.to_string(), daylight.to_string()])
}

fn replacement(id: &str, joda: bool) -> Option<(String, Vec<String>)> {
    match id {
        "EST" => return Some(non_daylight(joda, "America/New_York", "Etc/GMT+5")),
        "HST" => return Some(non_daylight(joda, "Pacific/Honolulu", "Etc/GMT+10")),
        "MST" => return Some(non_daylight(joda, "America/Denver", "Etc/GMT+7")),
        _ => {}
    }
    let zone = SHORT_IDS.iter().find(|(short, _)| *short == id)?.1;
    if let Some((_, hours)) = OBSERVING.iter().find(|(short, _)| *short == id) {
        let fixed = format!("Etc/GMT{:+}", -hours);
        let message = format!("{SUMMARY}\n\n{}", observes(zone, "TimeZone", &fixed));
        return Some((message, vec![zone.to_string(), fixed]));
    }
    Some((SUMMARY.to_string(), vec![zone.to_string()]))
}

fn in_joda_context(context: &Context, call: Node) -> bool {
    let Some(outer) = parent(call).filter(|list| list.kind() == "argument_list").and_then(parent).filter(|outer| outer.kind() == "method_invocation") else { return false };
    static_on_class(context, outer, "org.joda.time.DateTimeZone", &["forTimeZone"])
        && context.resolver.resolve_call(outer).is_some_and(|resolved| resolved.method.parameters == [Type::class("java.util.TimeZone")])
}

pub fn three_letter_time_zone_id(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "java.util.TimeZone", &["getTimeZone"]) {
        return;
    }
    if context.resolver.resolve_call(call).is_none_or(|resolved| resolved.method.parameters != [Type::class("java.lang.String")]) {
        return;
    }
    let Some(first) = arguments(call).first().copied() else { return };
    let Some(Const::Str(id)) = constant(context, first) else { return };
    let Some((message, replacements)) = replacement(&id, in_joda_context(context, call)) else { return };
    let fixes: Vec<Fix> = replacements.iter().map(|zone| Fix::replace(first.start_byte(), first.end_byte(), format!("\"{zone}\""))).collect();
    context.report_fixed("ThreeLetterTimeZoneID", call, preferred(context, call), &message, &fixes);
}
