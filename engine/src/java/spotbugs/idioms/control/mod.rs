//! UCF_USELESS_CONTROL_FLOW and UCF_USELESS_CONTROL_FLOW_NEXT_LINE: a conditional jump whose target is the next
//! instruction, as javac writes for an `if` whose branches make no code. SpotBugs takes the first line after the
//! jump, in code order, that is below the jump's line, and reports only when it is one line below (NEXT_LINE,
//! priority 1) or two lines below (priority 2). Lines are javac's: the jump sits on the last line javac marked in
//! the condition (the `if`, then each call at its `(`).
use super::super::classes::lines::statement_start;
use super::super::{Context, folds, place};
use super::Compiled;
use crate::engine::source::{named_children, parent};
use crate::java::types::scope::TYPE_DECLARATIONS;
use lines::{jump_line, table};
use tree_sitter::Node;

mod lines;

pub const USELESS: &str = "UCF_USELESS_CONTROL_FLOW";
pub const NEXT_LINE: &str = "UCF_USELESS_CONTROL_FLOW_NEXT_LINE";

fn parts(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// Whether javac writes no instruction for a statement, or only a jump to where the code after `statement`
/// goes anyway (`allowed` is the switch a `break` may leave).
fn empty(context: &Context, statement: Option<Node>, allowed: Option<Node>, continued: Option<Node>) -> bool {
    let Some(statement) = statement else { return true };
    match statement.kind() {
        ";" | "empty_statement" => true,
        "block" => parts(statement).into_iter().all(|part| empty(context, Some(part), allowed, continued)),
        "local_variable_declaration" => crate::java::helpers::declarators(statement).iter().all(|declarator| declarator.child_by_field_name("value").is_none()),
        "if_statement" => match folds::fixed(context, statement.child_by_field_name("condition")) {
            Some(true) => empty(context, statement.child_by_field_name("consequence"), allowed, continued),
            Some(false) => empty(context, statement.child_by_field_name("alternative"), allowed, continued),
            None => false,
        },
        "break_statement" => allowed.is_some() && parts(statement).is_empty() && innermost_breakable(statement) == allowed,
        "continue_statement" => continued.is_some() && parts(statement).is_empty() && innermost_loop(statement) == continued,
        kind => TYPE_DECLARATIONS.contains(&kind),
    }
}

fn innermost_breakable(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        if matches!(at.kind(), "switch_expression" | "switch_statement" | "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement") {
            return Some(at);
        }
        if matches!(at.kind(), "lambda_expression" | "class_body" | "method_declaration" | "constructor_declaration") {
            return None;
        }
        current = parent(at);
    }
    None
}

fn innermost_loop(node: Node) -> Option<Node> {
    let mut current = innermost_breakable(node);
    while let Some(at) = current.filter(|at| matches!(at.kind(), "switch_expression" | "switch_statement")) {
        current = innermost_breakable(at);
    }
    current
}

/// The `for` with an update or the `do` whose body ends with the `if`: a `continue` there jumps where the `if`
/// falls to anyway, so javac writes no jump for it.
fn continuing_loop<'a>(context: &Context, statement: Node<'a>) -> Option<Node<'a>> {
    let holder = parent(statement)?;
    let looped = if holder.kind() == "block" { parent(holder)? } else { holder };
    let mut cursor = looped.walk();
    let fits = looped.kind() == "do_statement" || (looped.kind() == "for_statement" && looped.children_by_field_name("update", &mut cursor).next().is_some());
    if !fits || looped.child_by_field_name("body").is_none_or(|body| body.id() != holder.id() && body.id() != statement.id()) {
        return None;
    }
    let after = holder.kind() == "block" && parts(holder).into_iter().skip_while(|part| part.id() != statement.id()).skip(1).any(|part| statement_start(context, part).is_some());
    (!after).then_some(looped)
}

/// The switch whose end the `if` falls to when it is the last code of the switch's last group.
fn ending_switch<'a>(context: &Context, statement: Node<'a>) -> Option<Node<'a>> {
    let group = parent(statement).filter(|group| group.kind() == "switch_block_statement_group")?;
    let block = parent(group)?;
    let last_group = parts(block).into_iter().filter(|part| part.kind() == "switch_block_statement_group").last()?;
    let after = parts(group).into_iter().skip_while(|part| part.id() != statement.id()).skip(1).any(|part| statement_start(context, part).is_some());
    (last_group.id() == group.id() && !after).then(|| parent(block)).flatten().filter(|switch| switched(*switch))
}

/// A `switch` written as a statement.
fn switched(switch: Node) -> bool {
    const HOLDERS: &[&str] = &["block", "expression_statement", "switch_block_statement_group", "labeled_statement", "constructor_body", "if_statement", "while_statement", "for_statement", "do_statement", "enhanced_for_statement"];
    switch.kind() == "switch_statement" || (switch.kind() == "switch_expression" && parent(switch).is_some_and(|holder| HOLDERS.contains(&holder.kind())))
}

/// The loop an `if` leaves on both branches when it is the last code of the loop's body: the rest of the body and
/// the loop's update are then dead, so javac writes the exit right after.
fn exiting_loop<'a>(context: &Context, statement: Node<'a>) -> Option<Node<'a>> {
    const LOOPS: &[&str] = &["while_statement", "for_statement", "do_statement"];
    let holder = parent(statement)?;
    let looped = if LOOPS.contains(&holder.kind()) {
        holder
    } else {
        let looped = parent(holder).filter(|looped| holder.kind() == "block" && LOOPS.contains(&looped.kind()))?;
        let after = parts(holder).into_iter().skip_while(|part| part.id() != statement.id()).skip(1).any(|part| statement_start(context, part).is_some());
        if after {
            return None;
        }
        looped
    };
    let both = statement.child_by_field_name("alternative").is_some();
    let leaves = |branch: Option<Node>| branch.is_some_and(|branch| leaves_to(branch, looped));
    (both && leaves(statement.child_by_field_name("consequence")) && leaves(statement.child_by_field_name("alternative"))).then_some(looped)
}

fn leaves_to(branch: Node, looped: Node) -> bool {
    match branch.kind() {
        "break_statement" => parts(branch).is_empty() && innermost_breakable(branch) == Some(looped),
        "block" => {
            let inner = parts(branch);
            inner.len() == 1 && leaves_to(inner[0], looped)
        }
        _ => false,
    }
}

/// Whether javac points the `if`'s jump past the next instruction: when the code that follows is a `goto` it
/// writes anyway (the jump back at the end of a `while` or of a `for` without update, the jump over an `else`, a
/// `break` or `continue`), it jumps straight to that `goto`'s target.
fn away(context: &Context, statement: Node) -> bool {
    let Some(holder) = parent(statement) else { return false };
    match holder.kind() {
        "block" | "switch_block_statement_group" | "constructor_body" => {
            let next = parts(holder).into_iter().skip_while(|part| part.id() != statement.id()).skip(1).filter(|part| part.kind() != "switch_label").find(|part| statement_start(context, *part).is_some() || matches!(part.kind(), "break_statement" | "continue_statement"));
            match next {
                Some(next) => matches!(next.kind(), "break_statement" | "continue_statement"),
                None if holder.kind() == "block" => away(context, holder),
                None => false,
            }
        }
        "if_statement" => {
            let in_then = holder.child_by_field_name("consequence").is_some_and(|then| then.id() == statement.id());
            (in_then && holder.child_by_field_name("alternative").is_some()) || away(context, holder)
        }
        "labeled_statement" => away(context, holder),
        "switch_rule" => {
            let last = parent(holder).and_then(|rules| parts(rules).into_iter().filter(|part| part.kind() == "switch_rule").last());
            match last {
                Some(last) if last.id() == holder.id() => parent(holder).and_then(parent).is_some_and(|switch| away(context, switch)),
                _ => true,
            }
        }
        "while_statement" => holder.child_by_field_name("body").is_some_and(|body| body.id() == statement.id()),
        "for_statement" => {
            let mut cursor = holder.walk();
            let updated = holder.children_by_field_name("update", &mut cursor).next().is_some();
            !updated && holder.child_by_field_name("body").is_some_and(|body| body.id() == statement.id())
        }
        _ => false,
    }
}

fn patterned(node: Node) -> bool {
    (node.kind() == "instanceof_expression" && named_children(node).len() > 2) || named_children(node).into_iter().any(patterned)
}

pub fn check(context: &Context, methods: &[Compiled]) {
    if !context.wants(&[USELESS, NEXT_LINE]) {
        return;
    }
    for method in methods {
        let mut reported: Vec<&str> = Vec::new();
        for statement in method.nodes.iter().copied().filter(|node| node.kind() == "if_statement") {
            let Some(condition) = statement.child_by_field_name("condition") else { continue };
            if folds::fixed(context, Some(condition)).is_some() || patterned(condition) {
                continue;
            }
            let exited = exiting_loop(context, statement);
            let allowed = exited.or_else(|| ending_switch(context, statement));
            let continued = continuing_loop(context, statement);
            let (consequence, alternative) = (statement.child_by_field_name("consequence"), statement.child_by_field_name("alternative"));
            if !empty(context, consequence, allowed, continued) || !empty(context, alternative, allowed, continued) {
                continue;
            }
            if exited.is_none() && away(context, statement) {
                continue;
            }
            let line = jump_line(context, statement, condition);
            let after = statement.end_byte();
            let Some((_, target)) = table(context, method).into_iter().filter(|(at, other)| *at >= after && *other > line).min() else { continue };
            let (pattern, priority, text) = match target.checked_sub(line) {
                Some(1) => (NEXT_LINE, 1, "Useless control flow to next line in"),
                Some(2) => (USELESS, 2, "Useless control flow in"),
                _ => continue,
            };
            if reported.contains(&pattern) {
                continue;
            }
            reported.push(pattern);
            let message = format!("{text} {}", method.label);
            context.report_listed(pattern, statement, line, message, place::function(&method.label), priority, vec![method.label.clone()]);
        }
    }
}
