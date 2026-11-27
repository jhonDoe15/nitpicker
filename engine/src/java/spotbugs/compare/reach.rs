//! Whether javac leaves a comparison SpotBugs sees. A comparison whose two outcomes jump to the same place
//! (`if (a == b) {}`, a loop whose body only breaks out of it), one in code javac drops for a constant condition,
//! and the update of a `for` loop whose body never reaches it leave none.
use super::super::Context;
use crate::engine::source::{children, named_children, parent};
use tree_sitter::Node;

const LOOPS: &[&str] = &["while_statement", "do_statement", "for_statement", "enhanced_for_statement"];

/// Where control goes after a statement: `after` a statement, or `continue` of a loop.
#[derive(PartialEq, Clone, Copy)]
enum Point {
    After(usize),
    Continue(usize),
    Back(usize),
    Code,
}

/// A loop that javac closes with a jump back to its condition, which a `continue` does not share.
fn back(node: Node) -> bool {
    match node.kind() {
        "while_statement" | "enhanced_for_statement" => true,
        "for_statement" => node.child_by_field_name("update").is_none(),
        _ => false,
    }
}

/// Whether javac emits no code for a statement.
fn empty(context: &Context, node: Node) -> bool {
    match node.kind() {
        ";" | "empty_statement" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" => true,
        kind if kind.ends_with("comment") => true,
        "block" => named_children(node).into_iter().all(|part| empty(context, part)),
        "labeled_statement" => named_children(node).into_iter().skip(1).all(|part| empty(context, part)),
        "local_variable_declaration" => {
            let mut cursor = node.walk();
            let declarators: Vec<Node> = node.children_by_field_name("declarator", &mut cursor).collect();
            declarators.iter().all(|declarator| declarator.child_by_field_name("value").is_none())
        }
        "if_statement" => match super::super::folds::fixed(context, node.child_by_field_name("condition")) {
            Some(test) => node.child_by_field_name(if test { "consequence" } else { "alternative" }).is_none_or(|branch| empty(context, branch)),
            None => false,
        },
        _ => false,
    }
}

fn last_of(context: &Context, holder: Node) -> Option<usize> {
    named_children(holder).into_iter().filter(|part| !empty(context, *part)).next_back().map(|last| last.id())
}

fn after(context: &Context, node: Node) -> Point {
    let Some(holder) = parent(node) else { return Point::After(node.id()) };
    match holder.kind() {
        "labeled_statement" | "expression_statement" => after(context, holder),
        "if_statement" if holder.child_by_field_name("condition").is_none_or(|condition| condition.id() != node.id()) => after(context, holder),
        kind if LOOPS.contains(&kind) && holder.child_by_field_name("body").is_some_and(|body| body.id() == node.id()) => {
            if back(holder) { Point::Back(holder.id()) } else { Point::Continue(holder.id()) }
        }
        "block" if parent(holder).is_some_and(|outer| !outer.kind().ends_with("_declaration") && outer.kind() != "lambda_expression") => {
            if last_of(context, holder) == Some(node.id()) { after(context, holder) } else { Point::After(node.id()) }
        }
        "switch_block_statement_group" => {
            let block = parent(holder);
            let last_group = block.is_some_and(|block| named_children(block).into_iter().filter(|part| part.kind() == "switch_block_statement_group").next_back().is_some_and(|group| group.id() == holder.id()));
            match block.and_then(parent) {
                Some(switch) if last_group && last_of(context, holder) == Some(node.id()) && matches!(switch.kind(), "switch_statement" | "switch_expression") => after(context, switch),
                _ => Point::After(node.id()),
            }
        }
        _ => Point::After(node.id()),
    }
}

fn target_of(context: &Context, jump: Node) -> Point {
    let label = named_children(jump).into_iter().find(|part| part.kind() == "identifier").map(|label| context.text(label).to_string());
    let mut at = parent(jump);
    while let Some(node) = at {
        let labelled = node.kind() == "labeled_statement" && named_children(node).first().is_some_and(|name| Some(context.text(*name).to_string()) == label);
        let breaks = jump.kind() == "break_statement";
        if label.is_none() && (LOOPS.contains(&node.kind()) || (breaks && matches!(node.kind(), "switch_statement" | "switch_expression"))) {
            return if breaks { after(context, node) } else if back(node) { Point::Code } else { Point::Continue(node.id()) };
        }
        if labelled {
            let inner = named_children(node).into_iter().nth(1).unwrap_or(node);
            return if breaks { after(context, node) } else if back(inner) { Point::Code } else { Point::Continue(inner.id()) };
        }
        at = parent(node);
    }
    Point::Code
}

/// Where a branch leads before running any code; `follow` when it runs nothing.
fn leads(context: &Context, branch: Option<Node>, follow: Point) -> Point {
    let Some(branch) = branch else { return follow };
    match branch.kind() {
        ";" | "empty_statement" => follow,
        _ if empty(context, branch) => follow,
        "block" => leads(context, named_children(branch).into_iter().find(|part| !empty(context, *part)), Point::Code),
        "break_statement" | "continue_statement" => target_of(context, branch),
        _ => Point::Code,
    }
}

/// Whether the statement is inside a `finally` block, which javac copies to each way out of the `try`.
fn finally(node: Node) -> bool {
    let mut at = parent(node);
    while let Some(holder) = at {
        match holder.kind() {
            "finally_clause" => return true,
            "lambda_expression" | "class_body" => return false,
            _ => at = parent(holder),
        }
    }
    false
}

/// The outcome javac knows a condition has without testing it, as it folds `&&`, `||` and `!` of constants.
fn known(context: &Context, node: Node) -> Option<bool> {
    let operator = node.child_by_field_name("operator").map(|operator| operator.kind());
    let sides = || (node.child_by_field_name("left").and_then(|left| known(context, left)), node.child_by_field_name("right").and_then(|right| known(context, right)));
    match (node.kind(), operator) {
        ("parenthesized_expression", _) => known(context, named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"))?),
        ("unary_expression", _) if context.text(node).starts_with('!') => known(context, node.child_by_field_name("operand")?).map(|value| !value),
        ("binary_expression", Some("&&")) => match sides() {
            (Some(false), _) | (_, Some(false)) => Some(false),
            (Some(true), Some(true)) => Some(true),
            _ => None,
        },
        ("binary_expression", Some("||")) => match sides() {
            (Some(true), _) | (_, Some(true)) => Some(true),
            (Some(false), Some(false)) => Some(false),
            _ => None,
        },
        _ => super::super::folds::fixed(context, Some(node)),
    }
}

/// Whether the comparison is in code javac drops: behind a condition it knows the outcome of.
pub fn dead(context: &Context, comparison: Node) -> bool {
    let mut node = comparison;
    while let Some(holder) = parent(node) {
        let is = |field: &str| holder.child_by_field_name(field).is_some_and(|part| part.id() == node.id());
        let operator = holder.child_by_field_name("operator").map(|operator| operator.kind());
        let skipped = match holder.kind() {
            "lambda_expression" | "class_body" => return false,
            "binary_expression" if is("right") => match operator {
                Some("&&") => holder.child_by_field_name("left").and_then(|left| known(context, left)) == Some(false),
                Some("||") => holder.child_by_field_name("left").and_then(|left| known(context, left)) == Some(true),
                _ => false,
            },
            "if_statement" => {
                let test = holder.child_by_field_name("condition").and_then(|condition| known(context, condition));
                (is("consequence") && test == Some(false)) || (is("alternative") && test == Some(true))
            }
            _ => false,
        };
        if skipped {
            return true;
        }
        node = holder;
    }
    false
}

/// Whether both outcomes of the comparison go to the same place.
pub fn idle(context: &Context, comparison: Node) -> bool {
    let mut node = comparison;
    loop {
        let Some(holder) = parent(node) else { return false };
        let last = holder.kind() == "binary_expression"
            && holder.child_by_field_name("right").is_some_and(|right| right.id() == node.id())
            && holder.child_by_field_name("operator").is_some_and(|operator| matches!(operator.kind(), "&&" | "||"));
        let first = holder.kind() == "binary_expression" && holder.child_by_field_name("left").is_some_and(|left| left.id() == node.id());
        let operator = holder.child_by_field_name("operator").map(|operator| operator.kind());
        let fixed = super::super::folds::fixed(context, holder.child_by_field_name("right"));
        if first && matches!((operator, fixed), (Some("&&"), Some(false)) | (Some("||"), Some(true))) {
            return true;
        }
        if holder.kind() == "parenthesized_expression" || last || (holder.kind() == "unary_expression" && context.text(holder).starts_with('!')) {
            node = holder;
            continue;
        }
        if holder.child_by_field_name("condition").is_none_or(|condition| condition.id() != node.id()) {
            return false;
        }
        return match holder.kind() {
            "if_statement" => {
                let follow = after(context, holder);
                let alternative = holder.child_by_field_name("alternative");
                let then = leads(context, holder.child_by_field_name("consequence"), follow);
                let then = if alternative.is_some() && matches!(then, Point::Back(_)) { Point::Code } else { then };
                then != Point::Code && then == leads(context, alternative, follow) && !finally(holder)
            }
            "while_statement" | "for_statement" => leads(context, holder.child_by_field_name("body"), Point::Continue(holder.id())) == after(context, holder) && !finally(holder),
            _ => false,
        };
    }
}

fn ends(node: Node) -> bool {
    match node.kind() {
        "break_statement" | "return_statement" | "throw_statement" => true,
        "block" => named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).next_back().is_some_and(ends),
        _ => false,
    }
}

fn continues(node: Node) -> bool {
    match node.kind() {
        "continue_statement" => true,
        "lambda_expression" | "class_body" => false,
        kind if LOOPS.contains(&kind) => named_children(node).into_iter().any(|part| part.kind() != "block" && continues(part)) || node.child_by_field_name("body").is_some_and(labelled_continue),
        _ => named_children(node).into_iter().any(continues),
    }
}

fn labelled_continue(node: Node) -> bool {
    match node.kind() {
        "continue_statement" => named_children(node).into_iter().any(|part| part.kind() == "identifier"),
        "lambda_expression" | "class_body" => false,
        _ => named_children(node).into_iter().any(labelled_continue),
    }
}

/// Whether the comparison sits in the update of a `for` loop, or the condition of a `do` loop, that is never reached.
pub fn unreached(comparison: Node) -> bool {
    let mut inner = comparison;
    let mut at = parent(comparison);
    while let Some(node) = at {
        if matches!(node.kind(), "lambda_expression" | "class_body") {
            return false;
        }
        let tail = match node.kind() {
            "for_statement" => children(node).iter().enumerate().any(|(index, child)| child.id() == inner.id() && node.field_name_for_child(index as u32) == Some("update")),
            "do_statement" => node.child_by_field_name("condition").is_some_and(|condition| condition.id() == inner.id()),
            _ => false,
        };
        if tail {
            let body = node.child_by_field_name("body");
            return body.is_some_and(|body| ends(body) && !continues(body));
        }
        inner = node;
        at = parent(node);
    }
    false
}
