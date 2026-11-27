//! CO_COMPARETO_INCORRECT_FLOATING: a compare method compares the same two `float` or `double` operands, in the same
//! order, twice, as in `a > b ? 1 : a < b ? -1 : 0`. Only comparisons with nothing else on the operand stack count.
//! One finding per pair of operands, on the line of its second comparison, placed as `operands::place` says.
use super::super::Context;
use super::operands;
use crate::engine::source::children;
use std::collections::HashMap;
use tree_sitter::Node;

pub const PATTERN: &str = "CO_COMPARETO_INCORRECT_FLOATING";

/// The method's own expressions in the order javac emits them, without lambdas and classes declared inside.
pub fn own_nodes<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>) {
    for child in children(node) {
        if matches!(child.kind(), "lambda_expression" | "class_body") {
            continue;
        }
        out.push(child);
        own_nodes(child, out);
    }
}

pub fn check<'t>(context: &Context, own: &str, label: &str, body: Node<'t>) {
    let mut nodes = Vec::new();
    own_nodes(body, &mut nodes);
    let mut seen: HashMap<(String, String, &'static str), (usize, Option<(Node<'t>, usize)>)> = HashMap::new();
    let mut order = Vec::new();
    for node in nodes.into_iter().filter(|node| operands::comparison(context, *node)) {
        let Some(kind) = operands::floating(context, node) else { continue };
        if !operands::alone(context, node) {
            continue;
        }
        let sides = ["left", "right"].map(|side| node.child_by_field_name(side).map(|side| operands::identity(context, side, kind)).unwrap_or_default());
        let [left, right] = sides;
        let key = (left, right, kind);
        let entry = seen.entry(key.clone()).or_insert_with(|| {
            order.push(key.clone());
            (0, None)
        });
        entry.0 += 1;
        if entry.0 == 2 {
            entry.1 = Some((node, super::super::compare::lines::line(context, node)));
        }
    }
    for key in order {
        let Some((node, line)) = seen.get(&key).and_then(|entry| entry.1) else { continue };
        let message = format!("{label} incorrectly handles {} value", key.2);
        let shown = operands::place(context, own, node, key.2);
        context.report_listed(PATTERN, node, line, message, shown, 2, vec![label.to_string(), key.2.to_string()]);
    }
}
