//! TruthContainsExactlyElementsInUsage: `containsExactlyElementsIn` on an iterable made right there.
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::owners::{is_descendant, receiver_name};
use super::parts::arguments;
use super::positions::preferred;
use super::Context;
use crate::engine::source::named_children;
use tree_sitter::Node;

const NEW_ITERABLES: [(&str, &str); 5] = [
    ("com.google.common.collect.Lists", "newArrayList"),
    ("com.google.common.collect.ImmutableList", "of"),
    ("java.util.Arrays", "asList"),
    ("java.util.Collections", "singletonList"),
    ("java.util.List", "of"),
];

/// The elements of an iterable made on the spot: the arguments of a factory call, or the initializer of an array.
fn new_iterable_elements<'t>(context: &Context, expression: Node<'t>) -> Option<Vec<Node<'t>>> {
    match expression.kind() {
        "method_invocation" if NEW_ITERABLES.iter().any(|(owner, name)| static_on_class(context, expression, owner, &[name])) => Some(arguments(expression)),
        "array_creation_expression" => {
            let initializer = expression.child_by_field_name("value")?;
            Some(named_children(initializer).into_iter().filter(|part| !part.kind().ends_with("comment")).collect())
        }
        _ => None,
    }
}

pub fn truth_contains_exactly_elements_in_usage(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "containsExactlyElementsIn") {
        return;
    }
    if !receiver_name(context, call, false).is_some_and(|owner| is_descendant(context, &owner, &["com.google.common.truth.IterableSubject"])) {
        return;
    }
    let (Some(iterable), Some(name)) = (arguments(call).first().copied(), call.child_by_field_name("name")) else { return };
    let Some(elements) = new_iterable_elements(context, iterable) else { return };
    let mut fix = Fix::replace(name.start_byte(), name.end_byte(), "containsExactly");
    fix = match (elements.first(), elements.last()) {
        (Some(first), Some(last)) => fix.delete(iterable.start_byte(), first.start_byte()).delete(last.end_byte(), iterable.end_byte()),
        _ => fix.delete(iterable.start_byte(), iterable.end_byte()),
    };
    let message = "containsExactly is preferred over containsExactlyElementsIn when creating new iterables.";
    context.report_fixed("TruthContainsExactlyElementsInUsage", call, preferred(context, call), message, &[fix]);
}
