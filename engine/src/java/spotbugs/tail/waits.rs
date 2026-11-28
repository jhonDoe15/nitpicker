//! WaitInLoop rebuilt from what SpotBugs 4.9.8 reports on test code. Only the first `wait` or `await` call of a
//! method in code order counts: `wait()`, `wait(long)` or `wait(long, int)` on any object, or `await()` or
//! `awaitUninterruptibly()` written against `java.util.concurrent.locks.Condition` itself (not a class or
//! interface below it; the timed `await` forms do not count). When no loop holds that call (its body, its
//! condition, the update of a `for`; not the setup of a `for`, the iterable of a `for`-each, nor a `do` loop
//! ending in `while (false)`), it is WA_NOT_IN_LOOP for `wait`, priority 2 for `wait()` and 3 (hidden) for the
//! timed forms, and WA_AWAIT_NOT_IN_LOOP for `await`, priority 2. Lambdas and classes inside are methods of
//! their own. A loop counts only when some path from the call reaches its jump back: not past a `return`, `throw`,
//! or a `break` or `continue` that leaves it. NO_NOTIFY_NOT_NOTIFYALL is priority 3 in every case measured, so it is never reported.
use super::super::idioms::Compiled;
use super::super::idioms::encoding::written_owner;
use super::super::taint::lines;
use super::super::{Context, place};
use super::in_order;
use super::super::folds;
use crate::engine::source::{named_children, parent};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

pub const WAIT: &str = "WA_NOT_IN_LOOP";
pub const AWAIT: &str = "WA_AWAIT_NOT_IN_LOOP";
pub const NOTIFY: &str = "NO_NOTIFY_NOT_NOTIFYALL";

const CONDITION: &str = "java.util.concurrent.locks.Condition";

/// The pattern and priority of a call that waits.
fn waiting(context: &Context, call: Node) -> Option<(&'static str, u8)> {
    if call.kind() != "method_invocation" {
        return None;
    }
    let name = context.text(call.child_by_field_name("name")?);
    if !matches!(name, "wait" | "await" | "awaitUninterruptibly") {
        return None;
    }
    let found = context.resolver.resolve_call(call)?;
    if found.method.is_static {
        return None;
    }
    let parameters: Vec<&str> = found.method.parameters.iter().map(|kind| if let Type::Primitive(name) = kind { *name } else { "" }).collect();
    match (name, parameters.as_slice()) {
        ("wait", []) => Some((WAIT, 2)),
        ("wait", ["long"] | ["long", "int"]) => Some((WAIT, 3)),
        ("await" | "awaitUninterruptibly", []) => {
            let own = enclosing_types(context.resolver.scope, call).into_iter().next()?;
            (written_owner(context, &own, call).as_deref() == Some(CONDITION)).then_some((AWAIT, 2))
        }
        _ => None,
    }
}

/// Whether a loop of the same method runs the node again: some path from it reaches a jump back to the loop.
fn looped(context: &Context, node: Node, method: Node) -> bool {
    let mut current = node;
    while let Some(up) = parent(current) {
        if up == method || matches!(up.kind(), "lambda_expression" | "class_body") {
            return false;
        }
        let looping = match up.kind() {
            "while_statement" => true,
            "do_statement" => folds::fixed(context, up.child_by_field_name("condition")) != Some(false),
            "for_statement" => up.child_by_field_name("init") != Some(current) && !is_init(up, current),
            "enhanced_for_statement" => up.child_by_field_name("body") == Some(current),
            _ => false,
        };
        if looping && returns_to(&context.file.text, node, up) {
            return true;
        }
        current = up;
    }
    false
}

/// How a statement always leaves the code after it, if it does.
enum Exit<'a> {
    Out,
    Break(Option<Node<'a>>),
    Continue(Option<Node<'a>>),
}

fn label_of<'a>(text: &str, statement: Node<'a>) -> Option<Node<'a>> {
    let wanted = label_name(statement, text);
    let mut current = statement;
    while let Some(up) = parent(current) {
        if up.kind() == "labeled_statement" && up.named_child(0).and_then(|name| name.utf8_text(text.as_bytes()).ok()) == Some(wanted.as_str()) {
            return named_children(up).into_iter().find(|part| part.kind() != "identifier");
        }
        current = up;
    }
    None
}

fn label_name(statement: Node, text: &str) -> String {
    named_children(statement).into_iter().find(|part| part.kind() == "identifier").and_then(|name| name.utf8_text(text.as_bytes()).ok()).unwrap_or_default().to_string()
}

/// The loop or switch an unlabelled `break` or `continue` leaves.
fn target<'a>(statement: Node<'a>, breaks: bool) -> Option<Node<'a>> {
    let mut current = statement;
    while let Some(up) = parent(current) {
        let loops = matches!(up.kind(), "while_statement" | "do_statement" | "for_statement" | "enhanced_for_statement");
        if loops || (breaks && up.kind() == "switch_expression") || (breaks && up.kind() == "switch_statement") {
            return Some(up);
        }
        current = up;
    }
    None
}

fn exit<'a>(text: &str, statement: Node<'a>) -> Option<Exit<'a>> {
    let labelled = named_children(statement).into_iter().any(|part| part.kind() == "identifier");
    match statement.kind() {
        "return_statement" | "throw_statement" => Some(Exit::Out),
        "break_statement" => Some(Exit::Break(if labelled { label_of(text, statement) } else { target(statement, true) })),
        "continue_statement" => Some(Exit::Continue(if labelled { label_of(text, statement) } else { target(statement, false) })),
        "block" => named_children(statement).into_iter().find_map(|part| exit(text, part)),
        "if_statement" => {
            let both = [statement.child_by_field_name("consequence")?, statement.child_by_field_name("alternative")?];
            both.iter().all(|side| matches!(exit(text, *side), Some(Exit::Out))).then_some(Exit::Out)
        }
        _ => None,
    }
}

fn inside(node: Node, outer: Node) -> bool {
    outer.start_byte() <= node.start_byte() && node.end_byte() <= outer.end_byte() && node != outer
}

/// Whether code running on from a node can reach the jump back at the end of a loop around it.
fn returns_to(text: &str, node: Node, looping: Node) -> bool {
    let mut current = node;
    loop {
        let Some(up) = parent(current) else { return false };
        if up == looping {
            return true;
        }
        if matches!(up.kind(), "block" | "switch_block_statement_group") {
            let after = named_children(up).into_iter().filter(|part| part.start_byte() >= current.end_byte());
            let mut resumed = None;
            for statement in after {
                match exit(text, statement) {
                    Some(Exit::Out) => return false,
                    Some(Exit::Break(Some(target))) if !inside(target, looping) => return false,
                    Some(Exit::Continue(Some(target))) if target == looping => return true,
                    Some(Exit::Continue(Some(target))) if !inside(target, looping) => return false,
                    Some(Exit::Break(Some(target)) | Exit::Continue(Some(target))) => {
                        resumed = Some(target);
                        break;
                    }
                    Some(Exit::Break(None) | Exit::Continue(None)) => return false,
                    None => {}
                }
            }
            current = resumed.unwrap_or(up);
            continue;
        }
        current = up;
    }
}
/// Whether a child of a `for` statement is one of its setup parts, which tree-sitter lists one by one.
fn is_init(statement: Node, child: Node) -> bool {
    let mut cursor = statement.walk();
    statement.children_by_field_name("init", &mut cursor).any(|init| init == child)
}

pub fn check(context: &Context, methods: &[Compiled]) {
    if !context.wants(&[WAIT, AWAIT]) {
        return;
    }
    for method in methods {
        let Some((call, pattern, priority)) = in_order(&method.nodes).into_iter().find_map(|node| waiting(context, node).map(|(pattern, priority)| (node, pattern, priority))) else { continue };
        if priority > 2 || looped(context, call, method.member) {
            continue;
        }
        let label = &method.label;
        let message = if pattern == WAIT { format!("Wait not in loop in {label}") } else { format!("Condition.await() not in loop in {label}") };
        context.report_listed(pattern, call, lines::line(context, call), message, place::function(label), priority, vec![label.clone()]);
    }
}
