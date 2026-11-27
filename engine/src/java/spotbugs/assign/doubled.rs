//! SA_LOCAL_DOUBLE_ASSIGNMENT, measured on test code: `x = x = value` for a local variable or parameter that takes
//! one slot (not `long` or `double`), parentheses or not, always priority 2, when nothing uses its value (a
//! statement, or the init or update of a `for`) and the stores of local variables chained right after it are even
//! in number: `x = x = y = z = 1` is reported, `x = x = y = 1` and `x = x = x = 1` are not. A store counts when it
//! is `=`, or a compound one but `+=` or `-=` of a number into an `int`, `short`, `byte` or `char`; the chain stops
//! at anything else (a cast, an operator, a field, an array, a `long` or `double`, `y++`). One finding per
//! variable and line of a method.
use super::super::idioms::Compiled;
use super::super::nulls::redundant::line_before;
use super::super::{Context, place};
use crate::engine::source::parent;
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

pub const DOUBLE: &str = "SA_LOCAL_DOUBLE_ASSIGNMENT";

fn operator<'s>(context: &'s Context, node: Node) -> Option<&'s str> {
    node.child_by_field_name("operator").map(|operator| context.text(operator))
}

fn wide(context: &Context, node: Node) -> bool {
    context.resolver.type_of(node).is_some_and(|kind| matches!(kind, Type::Primitive("long" | "double")))
}

/// The local variable an assignment stores into, when it is one that takes one slot.
fn local<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    let node = unwrap(node);
    let left = node.child_by_field_name("left").map(unwrap).filter(|left| node.kind() == "assignment_expression" && left.kind() == "identifier")?;
    let bound = matches!(context.resolver.binding(left, context.text(left)), Some(Binding::Local(_)));
    (bound && !wide(context, left)).then_some(left)
}

/// The local variable a plain `=` stores into.
fn stored(context: &Context, node: Node) -> Option<String> {
    let left = local(context, node).filter(|_| operator(context, unwrap(node)) == Some("="))?;
    Some(context.text(left).to_string())
}

fn inner<'a>(node: Node<'a>) -> Option<Node<'a>> {
    node.child_by_field_name("right").map(unwrap)
}

/// The stores of local variables chained in a value.
fn chained(context: &Context, node: Node) -> usize {
    let node = unwrap(node);
    let Some(left) = local(context, node) else { return 0 };
    match operator(context, node) {
        Some("=") => 1 + inner(node).map_or(0, |right| chained(context, right)),
        Some("+=" | "-=") if inner(node).is_some_and(|right| right.kind().ends_with("integer_literal"))
            && matches!(context.resolver.type_of(left), Some(Type::Primitive("int" | "short" | "byte" | "char"))) => 0,
        _ => 1,
    }
}

/// Whether nothing uses the value of the expression.
fn unused(context: &Context, node: Node) -> bool {
    let mut at = node;
    while let Some(above) = parent(at).filter(|above| above.kind() == "parenthesized_expression") {
        at = above;
    }
    let Some(above) = parent(at) else { return false };
    match above.kind() {
        "expression_statement" => true,
        "for_statement" => {
            let mut cursor = above.walk();
            let update = above.children_by_field_name("update", &mut cursor).any(|part| part.id() == at.id());
            above.child_by_field_name("condition").is_none_or(|condition| condition.id() != at.id()) && (!update || super::flow::reach::loops_back(context, above))
        }
        _ => false,
    }
}

pub fn check<'a>(context: &Context<'a>, method: &Compiled<'a>) {
    let mut seen = HashSet::new();
    for node in method.nodes.iter().copied().filter(|node| node.kind() == "assignment_expression") {
        let Some(name) = stored(context, node) else { continue };
        let Some(second) = inner(node).filter(|second| stored(context, *second).as_ref() == Some(&name)) else { continue };
        if !unused(context, node) || inner(second).is_some_and(|rest| chained(context, rest) % 2 == 1) {
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
