//! Whether one of some calls always runs before a node of the same method. SpotBugs leaves out the paths of
//! exceptions, so a call in a `try` block counts for the code after its `catch` blocks, and a branch that ends in
//! `return`, `throw`, `break` or `continue` never reaches what follows it.
use super::super::super::Context;
use crate::engine::source::{children, parent};
use tree_sitter::Node;

/// The value of an `if` condition that javac folds.
fn constant(context: &Context, node: Node) -> Option<bool> {
    node.child_by_field_name("condition").and_then(|condition| context.resolver.constant_boolean(condition))
}

/// Whether javac leaves the node out: it is in the branch of an `if` that its constant condition never takes.
pub fn dead(context: &Context, node: Node) -> bool {
    let mut at = node;
    while let Some(holder) = parent(at) {
        if holder.kind() == "if_statement" && let Some(holds_true) = constant(context, holder) {
            let taken = if holds_true { "consequence" } else { "alternative" };
            if named(holder, "condition").iter().all(|condition| condition.id() != at.id()) && named(holder, taken).iter().all(|branch| branch.id() != at.id()) {
                return true;
            }
        }
        at = holder;
    }
    false
}

fn named<'t>(node: Node<'t>, name: &str) -> Vec<Node<'t>> {
    let mut cursor = node.walk();
    node.children_by_field_name(name, &mut cursor).collect()
}

fn ends(node: Node) -> bool {
    match node.kind() {
        "return_statement" | "throw_statement" | "break_statement" | "continue_statement" => true,
        "block" => children(node).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")).last().is_some_and(ends),
        "if_statement" => named(node, "consequence").into_iter().chain(named(node, "alternative")).filter(|branch| ends(*branch)).count() == 2,
        _ => false,
    }
}

fn holds_any(context: &Context, nodes: &[Node], calls: &[Node]) -> bool {
    nodes.iter().any(|node| holds(context, *node, calls))
}

/// Whether the switch body always runs a call before it completes normally: it has a default, and each group runs
/// one, leaves the code, or falls through to a group that does.
fn switched(context: &Context, body: Node, calls: &[Node]) -> bool {
    let groups: Vec<Node> = children(body).into_iter().filter(|part| matches!(part.kind(), "switch_block_statement_group" | "switch_rule")).collect();
    let defaulted = groups.iter().any(|group| children(*group).iter().any(|part| part.kind() == "switch_label" && part.child(0).is_some_and(|word| word.kind() == "default")));
    let mut next = false;
    for group in groups.iter().rev() {
        let statements: Vec<Node> = children(*group).into_iter().filter(|part| part.is_named() && part.kind() != "switch_label" && !part.kind().ends_with("comment")).collect();
        let last = statements.last().copied();
        let ok = holds_any(context, &statements, calls)
            || last.is_some_and(|last| ends(last) && last.kind() != "break_statement")
            || (group.kind() == "switch_block_statement_group" && last.is_none_or(|last| last.kind() != "break_statement") && next);
        if !ok {
            return false;
        }
        next = ok;
    }
    defaulted
}

/// Whether running the node to its normal end always runs one of the calls.
fn holds(context: &Context, node: Node, calls: &[Node]) -> bool {
    if calls.iter().any(|call| call.id() == node.id()) {
        return true;
    }
    let field = |name: &str| named(node, name);
    match node.kind() {
        "lambda_expression" | "class_body" | "catch_clause" | "assert_statement" => false,
        "if_statement" if let Some(holds_true) = constant(context, node) => {
            let branch = if holds_true { field("consequence") } else { field("alternative") };
            branch.first().is_some_and(|part| holds(context, *part, calls))
        }
        "if_statement" | "ternary_expression" => {
            let (then, other) = (field("consequence"), field("alternative"));
            let branch = |branch: &Vec<Node>| branch.first().is_some_and(|part| holds(context, *part, calls) || ends(*part));
            holds_any(context, &field("condition"), calls) || (!other.is_empty() && branch(&then) && branch(&other))
        }
        "while_statement" => holds_any(context, &field("condition"), calls),
        "for_statement" => holds_any(context, &field("init"), calls) || holds_any(context, &field("condition"), calls),
        "enhanced_for_statement" => holds_any(context, &field("value"), calls),
        "do_statement" => holds_any(context, &field("body"), calls) || holds_any(context, &field("condition"), calls),
        "binary_expression" if node.child_by_field_name("operator").is_some_and(|operator| matches!(operator.kind(), "&&" | "||")) => holds_any(context, &field("left"), calls),
        "switch_expression" | "switch_statement" => holds_any(context, &field("condition"), calls) || field("body").first().is_some_and(|body| switched(context, *body, calls)),
        _ => children(node).into_iter().any(|part| holds(context, part, calls)),
    }
}

/// What runs before the node inside its holder on every path.
fn earlier<'t>(holder: Node<'t>, node: Node<'t>) -> Vec<Node<'t>> {
    let is = |name: &str| named(holder, name).iter().any(|part| part.id() == node.id());
    let field = |name: &str| named(holder, name);
    match holder.kind() {
        "if_statement" | "ternary_expression" | "while_statement" | "switch_statement" | "switch_expression" if !is("condition") => field("condition"),
        "for_statement" if !is("init") => field("init").into_iter().chain(if is("condition") { Vec::new() } else { field("condition") }).collect(),
        "enhanced_for_statement" if is("body") => field("value"),
        "do_statement" if is("condition") => field("body"),
        "binary_expression" if is("right") && holder.child_by_field_name("operator").is_some_and(|operator| matches!(operator.kind(), "&&" | "||")) => field("left"),
        "if_statement" | "ternary_expression" | "while_statement" | "switch_statement" | "switch_expression" | "for_statement" | "enhanced_for_statement" | "do_statement" | "binary_expression" | "switch_block" => Vec::new(),
        "catch_clause" => Vec::new(),
        "try_statement" | "try_with_resources_statement" if node.kind() == "catch_clause" => Vec::new(),
        _ => children(holder).into_iter().filter(|part| part.end_byte() <= node.start_byte() && part.kind() != "catch_clause").collect(),
    }
}

/// Whether one of the calls always runs before the node, in the code of the method that holds it.
pub fn always(context: &Context, calls: &[Node], at: Node) -> bool {
    if children(at).into_iter().any(|part| holds(context, part, calls)) {
        return true;
    }
    let mut node = at;
    while let Some(holder) = parent(node) {
        if matches!(holder.kind(), "lambda_expression" | "class_body") {
            return false;
        }
        if holds_any(context, &earlier(holder, node), calls) {
            return true;
        }
        node = holder;
    }
    false
}
