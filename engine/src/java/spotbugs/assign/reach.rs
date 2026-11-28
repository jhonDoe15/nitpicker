//! Which code javac writes: a statement that cannot complete leaves no code after it, and a loop whose body never
//! gets back to its condition (no end reached, no `continue`) has no jump back, so no loop head.
use super::super::Context;
use crate::engine::source::{children, named_children, parent};
use tree_sitter::Node;

const LOOPS: &[&str] = &["while_statement", "for_statement", "enhanced_for_statement", "do_statement"];

fn label(context: &Context, node: Node) -> Option<String> {
    named_children(node).into_iter().find(|part| part.kind() == "identifier").map(|part| context.text(part).to_string())
}

/// The label of a loop: the one of the labeled statement it is the body of.
pub fn loop_label(context: &Context, node: Node) -> Option<String> {
    parent(node).filter(|holder| holder.kind() == "labeled_statement").and_then(|holder| label(context, holder))
}

fn always(context: &Context, condition: Option<Node>) -> bool {
    condition.is_none_or(|condition| context.text(condition).replace(['(', ')', ' '], "") == "true")
}

/// A `break` (or `continue`) in `body` that leaves the statement it belongs to: unlabeled ones not inside a nested
/// loop (or switch, for `break`), labeled ones naming `wanted`.
fn jumps(context: &Context, body: Node, kind: &str, wanted: Option<&str>) -> bool {
    let nested = |node: Node| LOOPS.contains(&node.kind()) || (kind == "break_statement" && matches!(node.kind(), "switch_expression" | "switch_statement"));
    fn find(context: &Context, node: Node, kind: &str, wanted: Option<&str>, inside: bool, nested: &dyn Fn(Node) -> bool) -> bool {
        if matches!(node.kind(), "lambda_expression" | "class_body" | "class_declaration") {
            return false;
        }
        if node.kind() == kind {
            return match label(context, node) {
                Some(name) => wanted == Some(name.as_str()),
                None => !inside,
            };
        }
        let inside = inside || nested(node);
        named_children(node).into_iter().any(|part| find(context, part, kind, wanted, inside, nested))
    }
    find(context, body, kind, wanted, false, &nested)
}

/// Whether the body of a loop gets back to its condition (or update).
pub fn loops_back(context: &Context, node: Node) -> bool {
    let Some(body) = node.child_by_field_name("body") else { return true };
    let wanted = loop_label(context, node);
    completes(context, body) || jumps(context, body, "continue_statement", wanted.as_deref())
}

fn breaks(context: &Context, node: Node) -> bool {
    let wanted = loop_label(context, node);
    node.child_by_field_name("body").is_some_and(|body| jumps(context, body, "break_statement", wanted.as_deref()))
}

/// Whether a statement can complete normally, as javac decides what code is reachable.
pub fn completes(context: &Context, node: Node) -> bool {
    let field = |name: &str| node.child_by_field_name(name);
    match node.kind() {
        "block" | "constructor_body" => named_children(node).into_iter().all(|part| completes(context, part)),
        "return_statement" | "throw_statement" | "break_statement" | "continue_statement" | "yield_statement" => false,
        "if_statement" => match field("alternative") {
            Some(alternative) => field("consequence").is_none_or(|part| completes(context, part)) || completes(context, alternative),
            None => true,
        },
        "while_statement" | "for_statement" => !always(context, field("condition")) || breaks(context, node),
        "do_statement" => breaks(context, node) || (!always(context, field("condition")) && loops_back(context, node)),
        "labeled_statement" => {
            let body = named_children(node).into_iter().rfind(|part| part.kind() != "identifier");
            let name = label(context, node);
            body.is_none_or(|body| completes(context, body) || jumps(context, body, "break_statement", name.as_deref()))
        }
        "synchronized_statement" => field("body").is_none_or(|body| completes(context, body)),
        "try_statement" | "try_with_resources_statement" => {
            let catches = named_children(node).into_iter().filter(|part| part.kind() == "catch_clause");
            let finally = named_children(node).into_iter().find(|part| part.kind() == "finally_clause").and_then(|part| named_children(part).into_iter().next());
            let body = field("body").is_none_or(|body| completes(context, body));
            let caught = catches.into_iter().any(|part| part.child_by_field_name("body").is_none_or(|body| completes(context, body)));
            (body || caught) && finally.is_none_or(|finally| completes(context, finally))
        }
        "switch_statement" => switch_completes(context, node),
        _ => true,
    }
}

fn switch_completes<'t>(context: &Context, node: Node<'t>) -> bool {
    let Some(body) = node.child_by_field_name("body") else { return true };
    let groups = named_children(body);
    let defaulted = groups.iter().any(|group| children(*group).into_iter().any(|part| part.kind() == "switch_label" && context.text(part).starts_with("default")));
    if !defaulted || jumps(context, body, "break_statement", None) {
        return true;
    }
    let parts = |group: Node<'t>| named_children(group).into_iter().filter(|part| part.kind() != "switch_label").collect::<Vec<_>>();
    match groups.last() {
        None => true,
        Some(last) if last.kind() == "switch_rule" => groups.iter().any(|rule| parts(*rule).iter().all(|part| part.kind() != "throw_statement" && (part.kind() != "block" || completes(context, *part)))),
        Some(last) => parts(*last).iter().all(|part| completes(context, *part)),
    }
}
