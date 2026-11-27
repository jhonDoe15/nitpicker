//! SA_LOCAL_DOUBLE_ASSIGNMENT, measured on test code: `x = x = value` for a local variable or parameter that takes
//! one slot (not `long` or `double`), parentheses or not, always priority 2. Three or more in a row are not
//! reported. One finding per variable and line of a method.
use super::super::idioms::Compiled;
use super::super::nulls::redundant::line_before;
use super::super::{Context, place};
use crate::engine::source::parent;
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

pub const DOUBLE: &str = "SA_LOCAL_DOUBLE_ASSIGNMENT";

/// The local variable a plain `=` stores into, when the node is one.
fn stored(context: &Context, node: Node) -> Option<String> {
    let node = unwrap(node);
    let plain = node.kind() == "assignment_expression" && node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=");
    let left = node.child_by_field_name("left").map(unwrap).filter(|left| plain && left.kind() == "identifier")?;
    let name = context.text(left);
    matches!(context.resolver.binding(left, name), Some(Binding::Local(_))).then(|| name.to_string())
}

fn inner<'a>(node: Node<'a>) -> Option<Node<'a>> {
    node.child_by_field_name("right").map(unwrap)
}

fn outer<'a>(node: Node<'a>) -> Option<Node<'a>> {
    let mut above = parent(node)?;
    while above.kind() == "parenthesized_expression" {
        above = parent(above)?;
    }
    Some(above)
}

pub fn check<'a>(context: &Context<'a>, method: &Compiled<'a>) {
    let mut seen = HashSet::new();
    for node in method.nodes.iter().copied().filter(|node| node.kind() == "assignment_expression") {
        let Some(name) = stored(context, node) else { continue };
        let Some(second) = inner(node).filter(|second| stored(context, *second).as_ref() == Some(&name)) else { continue };
        let third = inner(second).is_some_and(|third| stored(context, third).as_ref() == Some(&name));
        let above = outer(node).is_some_and(|above| stored(context, above).as_ref() == Some(&name) && inner(above).is_some_and(|part| part.id() == node.id()));
        let wide = node.child_by_field_name("left").and_then(|left| context.resolver.type_of(left)).is_some_and(|kind| matches!(kind, Type::Primitive("long" | "double")));
        if third || above || wide {
            continue;
        }
        let line = line_before(context, node, node.end_byte());
        if !seen.insert((name.clone(), line)) {
            continue;
        }
        let message = format!("Double assignment of {name} in {}", method.label);
        context.report_listed(DOUBLE, node, line, message, place::variable(&method.label, &name), 2, vec![name, method.label.clone()]);
    }
}
