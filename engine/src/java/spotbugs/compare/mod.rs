//! RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN: `==` or `!=` between two `Boolean` objects, or a `Boolean` and an
//! object of one of its supertypes. Measured on test code: types as the compiled code has them (a local holds the
//! type of what was stored in it, a field too, and its declared type when the values disagree; a type variable is
//! never taken for `Boolean`); priority 2; on the line javac
//! gives the comparison; named after the method around it, the lambda's own method for a lambda. Comparisons of
//! one method that SpotBugs names the same place for are one finding, on the first one's line.
mod values;

use super::{Context, names, place};
use super::observed::observed;
use crate::engine::source::{ancestor, walk};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

const PATTERN: &str = "RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN";
const BOOLEAN: &str = "java.lang.Boolean";

/// The class of a compared value as SpotBugs has it.
fn class_of(context: &Context, value: Node) -> Option<String> {
    let value = unwrap(value);
    let Type::Class(declared, _) = context.resolver.type_of(value)? else { return None };
    let index = context.resolver.index;
    if declared != BOOLEAN && !index.is_subtype(BOOLEAN, &declared) {
        return None;
    }
    if !matches!(value.kind(), "identifier" | "field_access") {
        return Some(declared);
    }
    let bound = (value.kind() == "identifier").then(|| context.resolver.binding(value, context.text(value))).flatten();
    let generic = super::observed::generic_parameter(context, value, context.text(value));
    let local = !generic && matches!(bound, Some(Binding::Local(Some(ref kind))) if !matches!(kind, Type::Variable(_)));
    match observed(context, value) {
        Some(Type::Class(name, _)) => Some(name),
        None if local => Some(declared),
        _ => None,
    }
}

fn boolean_pair(context: &Context, left: Node, right: Node) -> bool {
    let (Some(first), Some(second)) = (class_of(context, left), class_of(context, right)) else { return false };
    let index = context.resolver.index;
    let wider = |one: &str, other: &str| one == BOOLEAN && (other == BOOLEAN || index.is_subtype(BOOLEAN, other));
    wider(&first, &second) || wider(&second, &first)
}

pub fn ref_comparisons(context: &Context) {
    if !context.wants(&[PATTERN]) {
        return;
    }
    let mut seen = std::collections::HashSet::new();
    walk(context.file.tree.root_node(), |node| {
        if node.kind() != "binary_expression" {
            return;
        }
        let operator = node.child_by_field_name("operator").map(|operator| operator.kind());
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
        if !matches!(operator, Some("==" | "!=")) || !boolean_pair(context, left, right) {
            return;
        }
        let line = super::attributes::line_of(context, node, true);
        let class = enclosing_types(context.resolver.scope, node).into_iter().next();
        let Some(class) = class.filter(|_| ancestor(node, &["class_body", "interface_body", "enum_body"]).is_some()) else { return };
        for label in place::methods(context, node) {
            let found = values::place(context, &names::binary(context, &class), &label, left, right);
            if !seen.insert((label.clone(), found.clone())) {
                continue;
            }
            let message = format!("Suspicious comparison of Boolean references in {label}");
            context.report_listed(PATTERN, node, line, message, found, 2, vec![label]);
        }
    });
}
