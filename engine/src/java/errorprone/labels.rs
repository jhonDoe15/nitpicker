//! UnusedLabel and UnnecessaryBreakInSwitch.
use super::fixes::Fix;
use super::Context;
use crate::engine::source::{named_children, walk};
use std::collections::HashMap;
use tree_sitter::Node;

fn real_children<'t>(node: Node<'t>) -> Vec<Node<'t>> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

pub fn unused_label(context: &Context, root: Node) {
    let mut labels: HashMap<&str, Node> = HashMap::new();
    let mut order: Vec<&str> = Vec::new();
    walk(root, |node| {
        if node.kind() != "labeled_statement" || context.suppressed("UnusedLabel", node) {
            return;
        }
        if let Some(label) = real_children(node).first().filter(|label| label.kind() == "identifier") {
            let name = context.text(*label);
            if labels.insert(name, node).is_none() {
                order.push(name);
            }
        }
    });
    walk(root, |node| {
        if matches!(node.kind(), "break_statement" | "continue_statement") {
            if let Some(label) = real_children(node).into_iter().find(|part| part.kind() == "identifier") {
                labels.remove(context.text(label));
            }
        }
    });
    for name in order {
        let Some(label) = labels.get(name) else { continue };
        let Some(statement) = real_children(*label).last().copied() else { continue };
        let fix = Fix::replace(label.start_byte(), statement.start_byte(), "");
        context.report_fixed("UnusedLabel", *label, label.start_byte(), "This label is unused.", &[fix]);
    }
}

fn unnecessary_breaks<'t>(node: Node<'t>, found: &mut Vec<Node<'t>>) {
    match node.kind() {
        "break_statement" => {
            if !real_children(node).iter().any(|part| part.kind() == "identifier") {
                found.push(node);
            }
        }
        "block" => {
            if let Some(last) = real_children(node).last() {
                unnecessary_breaks(*last, found);
            }
        }
        "if_statement" => {
            for field in ["consequence", "alternative"] {
                if let Some(part) = node.child_by_field_name(field) {
                    unnecessary_breaks(part, found);
                }
            }
        }
        _ => {}
    }
}

pub fn unnecessary_break_in_switch(context: &Context, node: Node) {
    if node.kind() != "switch_rule" {
        return;
    }
    let Some(body) = real_children(node).into_iter().find(|part| !matches!(part.kind(), "switch_label")) else { return };
    let mut found = Vec::new();
    unnecessary_breaks(body, &mut found);
    for statement in found {
        let fix = Fix::replace(statement.start_byte(), statement.end_byte(), "");
        context.report_fixed("UnnecessaryBreakInSwitch", statement, statement.start_byte(), "This break is unnecessary, fallthrough does not occur in -> switches", &[fix]);
    }
}
