//! The calls and comparisons FindBadEndOfStreamCheck looks for.
use super::super::super::{Context, calls, names};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use super::{READER, STREAM, Value};
use crate::java::flow::cfg::unwrap;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

pub(super) fn read_call(context: &Context, call: Node) -> Option<String> {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "read") {
        return None;
    }
    let found = context.resolver.resolve_call(call)?;
    if found.method.is_static || found.method.returns != Type::Primitive("int") {
        return None;
    }
    let by = enclosing_types(context.resolver.scope, call).first().cloned().unwrap_or_default();
    let owner = calls::owner(context, call, &by)?;
    let class = if owner == STREAM || owner == READER { owner } else if found.declaring == STREAM { found.declaring.clone() } else { return None };
    let listed: Vec<String> = found.method.parameters.iter().map(|kind| names::simple(context, kind)).collect();
    Some(format!("{class}.read({})", listed.join(", ")))
}

/// The comparison's constant when it is one SpotBugs takes for an end of stream test of a counted cast value.
pub(super) fn tested(context: &Context, comparison: Node, values: &HashMap<usize, Value>, active: &HashSet<Option<String>>) -> Option<(i64, String, &'static str)> {
    let operator = context.text(comparison.child_by_field_name("operator")?);
    let value = |side: &str| values.get(&unwrap(comparison.child_by_field_name(side)?).id()).cloned();
    let (left, right) = (value("left")?, value("right")?);
    let cast = |value: &Value| match value {
        Value::Cast { home, call, kind } if active.contains(home) => Some((call.clone(), *kind)),
        _ => None,
    };
    let number = |value: &Value| match value {
        Value::Number { value, fixed } => Some((*value, *fixed)),
        _ => None,
    };
    let (constant, (call, kind)) = match operator {
        "==" | "!=" => match (cast(&left), number(&right), cast(&right), number(&left)) {
            (Some(found), Some((-1, _)), _, _) | (_, _, Some(found), Some((-1, _))) => (-1, found),
            _ => return None,
        },
        "<" | ">=" => (0, cast(&left).filter(|_| number(&right) == Some((0, true)))?),
        ">" | "<=" => (0, cast(&right).filter(|_| number(&left).is_some_and(|(value, _)| value == 0))?),
        _ => return None,
    };
    Some((constant, call, kind))
}
