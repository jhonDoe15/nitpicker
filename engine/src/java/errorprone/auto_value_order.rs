//! AutoValueConstructorOrderChecker: arguments of an AutoValue constructor that come in another order than its parameters.
use super::Context;
use super::argsel::{Changes, NOT_PRESENT, argument_name, fits, invocation};
use super::argsel_algo::Hungarian;
use super::argsel_heuristics::creates_no_duplicate;
use super::fixes::Fix;
use crate::engine::source::children;
use tree_sitter::Node;

/// The cost of using an actual for a formal: 0 for the same name, 1 otherwise; an actual without a name only fits its own place.
fn distance(formal: &str, formal_index: usize, actual: &str, actual_index: usize) -> f64 {
    if actual == NOT_PRESENT {
        return if formal_index == actual_index { 0.0 } else { 1.0 };
    }
    if formal == actual { 0.0 } else { 1.0 }
}

pub fn auto_value_constructor_order(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression" {
        return;
    }
    let Some(inv) = invocation(context, node, true) else { return };
    let count = inv.formal_names.len();
    let actual_names: Vec<String> = inv.actuals.iter().map(|argument| argument_name(context, *argument)).collect();
    let symbolic = context.resolver.symbolic();
    let mut costs = vec![vec![0.0; count]; count];
    let mut alternative = false;
    for i in 0..count {
        for j in 0..count {
            if i != j && !fits(context, &symbolic, &inv, i, j) {
                costs[i][j] = f64::INFINITY;
                continue;
            }
            alternative |= i != j;
            costs[i][j] = distance(&inv.formal_names[i], i, &actual_names[j], j);
        }
    }
    if !alternative {
        return;
    }
    let assignment = Hungarian::new(&costs).execute();
    let changed: Vec<usize> = (0..count).filter(|row| assignment[*row] != *row as i64).collect();
    if changed.is_empty() {
        return;
    }
    let pairs: Vec<(usize, usize)> = changed.iter().map(|row| (*row, assignment[*row] as usize)).collect();
    let assigned: Vec<f64> = changed.iter().map(|row| costs[*row][assignment[*row] as usize]).collect();
    let original = changed.iter().map(|row| costs[*row][*row]).collect();
    let changes = Changes { pairs, original, assigned };
    if !changes.assigned.iter().all(|cost| *cost < 1.0) || !creates_no_duplicate(context, &inv, &changes) {
        return;
    }
    let mut fix = Fix::new();
    for (formal, actual) in &changes.pairs {
        let target = inv.actuals[*formal];
        fix = fix.and(target.start_byte(), target.end_byte(), context.text(inv.actuals[*actual]));
    }
    let at = children(node).into_iter().find(|part| part.kind() == "new").map_or(node.start_byte(), |keyword| keyword.start_byte());
    context.report_fixed("AutoValueConstructorOrderChecker", node, at, "Arguments to AutoValue constructor are in the wrong order", &[fix]);
}
