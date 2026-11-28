//! PeriodFrom and PeriodGetTemporalUnit: `java.time.Period` calls that either do nothing or always throw.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::parts::{arguments, preferred};
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub fn period_from(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !static_on_class(context, node, "java.time.Period", &["from"]) {
        return;
    }
    let Some(first) = arguments(node).first().copied() else { return };
    let message = "Period.from(Period) returns itself; from(Duration) throws a runtime exception.";
    let class = match context.resolver.type_of(first) {
        Some(Type::Class(name, _)) => name,
        _ => return,
    };
    let fixes = match class.as_str() {
        "java.time.Duration" => Vec::new(),
        "java.time.Period" => vec![Fix::replace(node.start_byte(), node.end_byte(), context.text(first))],
        _ => return,
    };
    context.report_fixed("PeriodFrom", node, preferred(node), message, &fixes);
}

/// The constants of `ChronoUnit` that `Period.get` rejects: all but YEARS, MONTHS and DAYS.
const INVALID_UNITS: [&str; 13] =
    ["NANOS", "MICROS", "MILLIS", "SECONDS", "MINUTES", "HOURS", "HALF_DAYS", "WEEKS", "DECADES", "CENTURIES", "MILLENNIA", "ERAS", "FOREVER"];

pub fn period_get_temporal_unit(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !instance_on_exact_class(context, node, "java.time.Period", &["get"]) {
        return;
    }
    let args = arguments(node);
    let [unit] = args.as_slice() else { return };
    if !context.resolver.resolve_call(node).is_some_and(|call| call.method.parameters.len() == 1 && call.method.parameters[0].name() == "java.time.temporal.TemporalUnit") {
        return;
    }
    let constant = match unit.kind() {
        "identifier" => context.text(*unit),
        "field_access" => unit.child_by_field_name("field").map(|field| context.text(field)).unwrap_or_default(),
        _ => return,
    };
    if INVALID_UNITS.contains(&constant) {
        context.report_fixed("PeriodGetTemporalUnit", node, preferred(node), "Period.get() only works with YEARS, MONTHS, or DAYS.", &[]);
    }
}
