//! Whether javac drops the code a node sits in: behind an `if`, `&&`, `||` or `c ? a : b` whose outcome it knows.
//! Each node's answer is kept, so a file costs one pass over the nodes that hold loads.
use super::super::Context;
use super::super::compare::reach::known;
use crate::engine::source::parent;
use std::collections::HashMap;
use tree_sitter::Node;

/// Whether javac drops `node` itself from the code of its holder.
fn skips(context: &Context, holder: Node, node: Node) -> bool {
    let is = |field: &str| holder.child_by_field_name(field).is_some_and(|part| part.id() == node.id());
    let left = || holder.child_by_field_name("left").and_then(|left| known(context, left));
    match holder.kind() {
        "binary_expression" if is("right") => match holder.child_by_field_name("operator").map(|operator| operator.kind()) {
            Some("&&") => left() == Some(false),
            Some("||") => left() == Some(true),
            _ => false,
        },
        "if_statement" | "ternary_expression" => {
            let test = holder.child_by_field_name("condition").and_then(|condition| known(context, condition));
            (is("consequence") && test == Some(false)) || (is("alternative") && test == Some(true))
        }
        _ => false,
    }
}

fn boundary(node: Node) -> bool {
    matches!(node.kind(), "lambda_expression" | "class_body")
}

/// Whether javac drops the code `node` sits in; `seen` keeps the answer for each node met.
pub fn dropped(context: &Context, node: Node, seen: &mut HashMap<usize, bool>) -> bool {
    let mut chain = Vec::new();
    let mut current = node;
    let mut above = false;
    loop {
        if let Some(found) = seen.get(&current.id()) {
            above = *found;
            break;
        }
        chain.push(current);
        match parent(current) {
            Some(holder) if !boundary(holder) => current = holder,
            _ => break,
        }
    }
    for part in chain.into_iter().rev() {
        let skipped = parent(part).filter(|holder| !boundary(*holder)).is_some_and(|holder| skips(context, holder, part));
        above = above || skipped;
        seen.insert(part.id(), above);
    }
    above
}
