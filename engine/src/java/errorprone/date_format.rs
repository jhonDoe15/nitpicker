//! Checks on date patterns and Joda-Time: MisusedDayOfYear, MisusedWeekYear, JodaToSelf and LocalDateTemporalAmount.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::lookup::{field_declarator, field_of};
use super::parts::{arguments, is_exactly, only_argument};
use super::shape::{constant_text, preferred};
use super::Context;
use tree_sitter::Node;

const JAVA_FORMAT: &str = "java.text.SimpleDateFormat";
const ICU_FORMAT: &str = "com.ibm.icu.text.SimpleDateFormat";
const STRING: &str = "java.lang.String";
const ICU_SYMBOLS: &str = "com.ibm.icu.text.DateFormatSymbols";
const ICU_LOCALE: &str = "com.ibm.icu.util.ULocale";

const CONSTRUCTORS: [(&str, &[&str]); 9] = [
    (JAVA_FORMAT, &[STRING]),
    (JAVA_FORMAT, &[STRING, "java.text.DateFormatSymbols"]),
    (JAVA_FORMAT, &[STRING, "java.util.Locale"]),
    (ICU_FORMAT, &[STRING]),
    (ICU_FORMAT, &[STRING, ICU_SYMBOLS]),
    (ICU_FORMAT, &[STRING, ICU_SYMBOLS, ICU_LOCALE]),
    (ICU_FORMAT, &[STRING, "java.util.Locale"]),
    (ICU_FORMAT, &[STRING, STRING, ICU_LOCALE]),
    (ICU_FORMAT, &[STRING, ICU_LOCALE]),
];

/// `MisusedDateFormat.parseDateFormat`: quoted text goes to `literal`, everything else to `special`.
fn parse(format: &str, mut special: impl FnMut(char), mut literal: impl FnMut(char)) {
    let chars: Vec<char> = format.chars().collect();
    let mut at = 0;
    while at < chars.len() {
        if chars[at] == '\'' {
            special('\'');
            at += 1;
            while at < chars.len() {
                literal(chars[at]);
                if chars[at] == '\'' {
                    if chars.get(at + 1) == Some(&'\'') {
                        special('\'');
                        at += 1;
                    } else {
                        break;
                    }
                }
                at += 1;
            }
        } else {
            special(chars[at]);
        }
        at += 1;
    }
}

fn contains(pattern: &str, wanted: char) -> bool {
    let mut found = false;
    parse(pattern, |special| found |= special == wanted, |_| {});
    found
}

fn replace_char(pattern: &str, from: char, to: char) -> String {
    let built = std::cell::RefCell::new(String::new());
    parse(pattern, |special| built.borrow_mut().push(if special == from { to } else { special }), |literal| built.borrow_mut().push(literal));
    built.into_inner()
}

fn day_of_year(pattern: &str) -> Option<String> {
    (contains(pattern, 'D') && contains(pattern, 'M')).then(|| replace_char(pattern, 'D', 'd'))
}

fn week_year(pattern: &str) -> Option<String> {
    (contains(pattern, 'Y') && !contains(pattern, 'w')).then(|| replace_char(pattern, 'Y', 'y'))
}

fn replace_argument(context: &Context, pattern: Node, replacement: &str) -> Fix {
    let quoted = format!("\"{replacement}\"");
    if super::shape::folded_strings(pattern) {
        return Fix::replace(pattern.start_byte(), pattern.end_byte(), quoted);
    }
    let Some((declaring, field)) = field_of(context, pattern) else { return Fix::new() };
    let root = context.file.tree.root_node();
    let Some((_, declarator)) = field_declarator(context, root, &declaring.name, &field.name) else { return Fix::new() };
    match declarator.child_by_field_name("value").filter(|value| value.kind() == "string_literal") {
        Some(value) => Fix::replace(value.start_byte(), value.end_byte(), quoted),
        None => Fix::new(),
    }
}

fn rewritten(context: &Context, check: &'static str, rewrite: fn(&str) -> Option<String>, node: Node, pattern: Node) {
    let Some(value) = constant_text(context, pattern) else { return };
    let Some(replacement) = rewrite(&value) else { return };
    let message = if check == "MisusedDayOfYear" {
        "Use of 'DD' (day of year) in a date pattern with 'MM' (month of year) is not likely to be intentional, as it would lead to dates like 'March 73rd'."
    } else {
        "Use of \"YYYY\" (week year) in a date pattern without \"ww\" (week in year). You probably meant to use \"yyyy\" (year) instead."
    };
    let fix = replace_argument(context, pattern, &replacement);
    context.report_fixed(check, node, preferred(node), message, &[fix]);
}

fn misused_date_format(context: &Context, node: Node, check: &'static str, rewrite: fn(&str) -> Option<String>) {
    match node.kind() {
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
            let matches = match name {
                "applyPattern" | "applyLocalizedPattern" => [JAVA_FORMAT, ICU_FORMAT].iter().any(|class| instance_on_exact_class(context, node, class, &[name])),
                "ofPattern" => static_on_class(context, node, "java.time.format.DateTimeFormatter", &["ofPattern"]),
                _ => false,
            };
            if let Some(pattern) = arguments(node).first().copied().filter(|_| matches) {
                rewritten(context, check, rewrite, node, pattern);
            }
        }
        "object_creation_expression" => {
            let Some(pattern) = arguments(node).first().copied() else { return };
            let Some(class) = super::parts::class_of(context, node).filter(|class| class == JAVA_FORMAT || class == ICU_FORMAT) else { return };
            let Some(call) = context.resolver.resolve_constructor(node) else { return };
            let listed: Vec<String> = call.method.parameters.iter().map(|kind| kind.name()).collect();
            if CONSTRUCTORS.iter().any(|(owner, parameters)| *owner == class && parameters.iter().copied().eq(listed.iter().map(String::as_str))) {
                rewritten(context, check, rewrite, node, pattern);
            }
        }
        _ => {}
    }
}

pub fn misused_day_of_year(context: &Context, node: Node) {
    misused_date_format(context, node, "MisusedDayOfYear", day_of_year);
}

pub fn misused_week_year(context: &Context, node: Node) {
    misused_date_format(context, node, "MisusedWeekYear", week_year);
}

const JODA_TYPES: [&str; 5] = ["DateTime", "Duration", "Instant", "Interval", "Period"];
const JODA_NO_METHOD: [&str; 3] = ["LocalDate", "LocalDateTime", "LocalTime"];

pub fn inside_joda(context: &Context) -> bool {
    let package = context.resolver.scope.package.as_str();
    package == "org.joda.time" || package.starts_with("org.joda.time.")
}

fn joda_message(symbol: &str) -> String {
    format!("Use of {symbol} is a no-op and is not allowed.")
}

pub fn joda_to_self(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
            let Some(kind) = JODA_TYPES.iter().find(|kind| name == format!("to{kind}")) else { return };
            let Some(receiver) = node.child_by_field_name("object") else { return };
            if !instance_on_exact_class(context, node, &format!("org.joda.time.{kind}"), &[name]) || inside_joda(context) {
                return;
            }
            if context.resolver.resolve_call(node).is_none_or(|call| !call.method.parameters.is_empty()) {
                return;
            }
            let fix = Fix::replace(receiver.end_byte(), node.end_byte(), "");
            context.report_fixed("JodaToSelf", node, preferred(node), &joda_message(&format!("{name}()")), &[fix]);
        }
        "object_creation_expression" => {
            let Some(class) = super::parts::class_of(context, node) else { return };
            let simple = class.strip_prefix("org.joda.time.").unwrap_or("");
            if !JODA_TYPES.contains(&simple) && !JODA_NO_METHOD.contains(&simple) {
                return;
            }
            let Some(argument) = only_argument(node) else { return };
            let Some(call) = context.resolver.resolve_constructor(node) else { return };
            if call.method.parameters.len() != 1 || call.method.parameters[0].name() != "java.lang.Object" || inside_joda(context) {
                return;
            }
            let (Some(from), Some(to)) = (context.resolver.type_of(argument), node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written))) else { return };
            if from.erased() != to.erased() {
                return;
            }
            let fix = Fix::replace(node.start_byte(), node.end_byte(), context.text(argument));
            context.report_fixed("JodaToSelf", node, preferred(node), &joda_message(&format!("{simple}(java.lang.Object)")), &[fix]);
        }
        _ => {}
    }
}

pub fn local_date_temporal_amount(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !instance_on_exact_class(context, node, "java.time.LocalDate", &["plus", "minus"]) {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    if call.method.parameters.len() != 1 || call.method.parameters[0].name() != "java.time.temporal.TemporalAmount" {
        return;
    }
    if arguments(node).first().is_some_and(|argument| is_exactly(context, *argument, "java.time.Duration") == Some(true)) {
        let message = "LocalDate.plus() and minus() does not work with Durations. LocalDate represents civil time (years/months/days), so java.time.Period is the appropriate thing to add or subtract instead.";
        context.report_fixed("LocalDateTemporalAmount", node, preferred(node), message, &[]);
    }
}
