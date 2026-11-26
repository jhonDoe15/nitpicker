//! CanonicalDuration and JodaWithDurationAddedLong.
use super::call_match::instance_on_exact_class;
use super::consts::{constant, Const};
use super::constant_exprs::is_negated_literal;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::parts::arguments;
use super::positions::preferred;
use super::Context;
use crate::engine::source::{parent, walk};
use tree_sitter::Node;

const JAVA_DURATION: &str = "java.time.Duration";
const JODA_DURATION: &str = "org.joda.time.Duration";

/// The class a static method is called on: the qualifier's class, or the declaring class without one.
fn static_owner(context: &Context, call: Node) -> Option<String> {
    let resolved = context.resolver.resolve_call(call).filter(|resolved| resolved.method.is_static)?;
    Some(if call.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring })
}

fn same_method(context: &Context, first: Node, second: Node) -> bool {
    match (context.resolver.resolve_call(first), context.resolver.resolve_call(second)) {
        (Some(a), Some(b)) => a.declaring == b.declaring && a.method.name == b.method.name && a.method.parameters == b.method.parameters,
        _ => false,
    }
}

const EXPRESSIONS: &[&str] = &[
    "method_invocation", "argument_list", "parenthesized_expression", "binary_expression", "unary_expression", "update_expression", "ternary_expression",
    "assignment_expression", "object_creation_expression", "array_creation_expression", "array_access", "field_access", "cast_expression",
    "instanceof_expression", "lambda_expression", "method_reference", "switch_expression", "array_initializer", "dimensions_expr",
    "explicit_constructor_invocation",
];

fn only_literals_and_binaries(context: &Context, node: Node) -> bool {
    if is_negated_literal(context, node) {
        return true;
    }
    if !(node.kind() == "binary_expression" || node.kind().ends_with("_literal") || matches!(node.kind(), "true" | "false")) {
        return false;
    }
    let mut cursor = node.walk();
    let parts: Vec<Node> = node.named_children(&mut cursor).filter(|part| !part.kind().ends_with("comment")).collect();
    parts.into_iter().all(|part| only_literals_and_binaries(context, part))
}

fn number(context: &Context, node: Node) -> Option<Const> {
    if !only_literals_and_binaries(context, node) {
        return None;
    }
    constant(context, node).filter(|value| matches!(value, Const::Int(_) | Const::Long(_) | Const::Float(_) | Const::Double(_)))
}

fn long_value(value: &Const) -> i64 {
    match value {
        Const::Int(value) => i64::from(*value),
        Const::Long(value) => *value,
        Const::Float(value) => *value as i64,
        Const::Double(value) => *value as i64,
        _ => 0,
    }
}

/// Name, nanoseconds per unit, and the factory names of java.time and Joda-Time.
const UNITS: [(&str, i128, &str, Option<&str>); 6] = [
    ("DAYS", 86_400_000_000_000, "ofDays", Some("standardDays")),
    ("HOURS", 3_600_000_000_000, "ofHours", Some("standardHours")),
    ("MINUTES", 60_000_000_000, "ofMinutes", Some("standardMinutes")),
    ("SECONDS", 1_000_000_000, "ofSeconds", Some("standardSeconds")),
    ("MILLIS", 1_000_000, "ofMillis", None),
    ("NANOS", 1, "ofNanos", None),
];

fn all_invocations<'t>(context: &Context<'t>, call: Node<'t>) -> Vec<Node<'t>> {
    let mut top = call;
    while let Some(up) = parent(top).filter(|up| EXPRESSIONS.contains(&up.kind())) {
        top = up;
    }
    let mut found: Vec<Node> = Vec::new();
    walk(top, |node| {
        if node.kind() == "method_invocation" && same_method(context, call, node) {
            found.push(node);
        }
    });
    if found.first().is_some_and(|first| first.id() == call.id()) { found } else { Vec::new() }
}

fn report_all(context: &Context, matched: Node, calls: &[Node], message: &str, fixes: Vec<Fix>) {
    if context.suppressed("CanonicalDuration", matched) {
        return;
    }
    for (call, fix) in calls.iter().zip(fixes) {
        context.report_always_fixed("CanonicalDuration", preferred(context, *call), message, &[fix]);
    }
}

pub fn canonical_duration(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let joda = match static_owner(context, call).as_deref() {
        Some(JAVA_DURATION) => false,
        Some(JODA_DURATION) => true,
        _ => return,
    };
    if arguments(call).len() != 1 {
        return;
    }
    let calls = all_invocations(context, call);
    if calls.is_empty() {
        return;
    }
    let mut values = Vec::new();
    for found in &calls {
        let Some(argument) = arguments(*found).first().copied() else { return };
        let Some(value) = number(context, argument) else { return };
        values.push(value);
    }
    let message = "Duration can be expressed more clearly with different units";
    if values.iter().all(|value| long_value(value) == 0) {
        if !joda {
            return;
        }
        let mut fixes = Vec::new();
        for found in &calls {
            fixes.push(match found.child_by_field_name("object") {
                Some(receiver) => Fix::replace(receiver.end_byte(), found.end_byte(), ".ZERO"),
                None => Fix::replace(found.start_byte(), found.end_byte(), "Duration.ZERO").with_imports(),
            });
        }
        report_all(context, call, &calls, "Duration can be expressed more clearly without units, as Duration.ZERO", fixes);
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let Some(unit_index) = UNITS.iter().position(|unit| if joda { unit.3 == Some(name) } else { unit.2 == name }) else { return };
    let unit = UNITS[unit_index];
    let banned = match unit.0 {
        "HOURS" => Some(24),
        "MINUTES" | "SECONDS" => Some(60),
        _ => None,
    };
    if banned.is_some_and(|ban| values.iter().any(|value| long_value(value) == ban)) {
        return;
    }
    let mut nanos: Vec<i128> = Vec::new();
    for value in &values {
        let total = i128::from(long_value(value)) * unit.1;
        if total / 1_000_000_000 > i128::from(i64::MAX) || total / 1_000_000_000 < i128::from(i64::MIN) {
            return;
        }
        nanos.push(total);
    }
    for next in UNITS.iter().take(unit_index) {
        if joda && next.3.is_none() {
            continue;
        }
        if nanos.iter().all(|total| total % next.1 == 0) {
            let factory = if joda { next.3.unwrap_or_default() } else { next.2 };
            let mut fixes = Vec::new();
            for (found, total) in calls.iter().zip(&nanos) {
                let converted = total / next.1;
                let replacement = format!("{factory}({converted}{})", if i32::try_from(converted).is_ok() { "" } else { "L" });
                fixes.push(match found.child_by_field_name("object") {
                    Some(receiver) => Fix::replace(receiver.end_byte(), found.end_byte(), format!(".{replacement}")),
                    None => Fix::replace(found.start_byte(), found.end_byte(), replacement).with_imports(),
                });
            }
            report_all(context, call, &calls, message, fixes);
            return;
        }
    }
}

const WITH_DURATION_ADDED: [&str; 3] = ["org.joda.time.DateTime", "org.joda.time.Duration", "org.joda.time.Instant"];

pub fn joda_with_duration_added_long(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "withDurationAdded") {
        return;
    }
    if !WITH_DURATION_ADDED.iter().any(|class| instance_on_exact_class(context, call, class, &["withDurationAdded"])) {
        return;
    }
    let package = context.resolver.scope.package.as_str();
    if package == "org.joda.time" || package.starts_with("org.joda.time.") {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.parameters.iter().map(|kind| kind.name()).ne(["long".to_string(), "int".to_string()]) {
        return;
    }
    let list = arguments(call);
    let (Some(receiver), [first, second]) = (call.child_by_field_name("object"), list.as_slice()) else { return };
    let receiver_text = context.text(receiver);
    let scalar = match constant(context, *second) {
        Some(Const::Int(value)) => Some(value),
        _ => None,
    };
    let mut fix = Fix::new();
    if scalar == Some(0) {
        fix = fix.and(call.start_byte(), call.end_byte(), receiver_text);
    } else {
        let is_get_millis = first.kind() == "method_invocation"
            && first.child_by_field_name("name").is_some_and(|name| context.text(name) == "getMillis")
            && arguments(*first).is_empty()
            && receiver_class(context, *first).is_some_and(|owner| context.resolver.index.is_subtype(&owner, "org.joda.time.ReadableDuration"));
        let replacement = match first.child_by_field_name("object").filter(|_| is_get_millis) {
            Some(inner) => context.text(inner).to_string(),
            None => {
                let name = qualify_type(context, call, JODA_DURATION, &mut fix);
                format!("{name}.millis({})", context.text(*first))
            }
        };
        fix = match scalar {
            Some(1) => fix.and(call.start_byte(), call.end_byte(), format!("{receiver_text}.plus({replacement})")),
            Some(-1) => fix.and(call.start_byte(), call.end_byte(), format!("{receiver_text}.minus({replacement})")),
            _ => fix.and(first.start_byte(), first.end_byte(), replacement),
        };
    }
    let message = "Use of JodaTime's type.withDurationAdded(long, int) (where <type> = {Duration,Instant,DateTime}). Please use type.withDurationAdded(Duration.millis(long), int) instead.";
    context.report_fixed("JodaWithDurationAddedLong", call, preferred(context, call), message, &[fix]);
}
