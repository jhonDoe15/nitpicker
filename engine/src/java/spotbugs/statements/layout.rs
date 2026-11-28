//! How javac lays out the code of a switch's cases: the kind of the last instruction before each case, and where
//! forward jumps land. A `break` at the very end emits nothing, a loop's exit is chained to the `break` after it, a
//! `finally` or `synchronized` block ends with the handler that rethrows.
use super::super::Context;
use crate::engine::source::{children, named_children};
use std::cell::RefCell;
use tree_sitter::Node;

/// The kind of the last instruction emitted so far.
#[derive(Clone, Copy, PartialEq)]
pub(super) enum Last {
    /// The switch instruction itself: nothing of the cases yet.
    Start,
    /// An instruction that runs on into what follows, on a line.
    Runs(usize),
    /// A jump back to a loop's start inside the switch, on a line.
    Back(usize),
    /// A forward jump.
    Jumps,
    /// A return or a throw.
    Returns,
}

/// What javac's code generator knows after a statement: the last instruction, whether the code after it can be
/// reached by running on, and whether jumps wait for the next instruction to land on.
#[derive(Clone, Copy)]
pub(super) struct State {
    pub(super) last: Last,
    pub(super) alive: bool,
    pub(super) pending: bool,
}

pub(super) struct Layout<'c, 'a> {
    pub(super) context: &'c Context<'a>,
    /// The `break` that ends the whole switch emits nothing.
    pub(super) final_break: Option<usize>,
    /// Where the switch ends, as a source offset.
    pub(super) end: usize,
    /// Where each forward jump emitted so far lands, as a source offset; past the switch is `usize::MAX`.
    pub(super) targets: &'c RefCell<Vec<usize>>,
}

pub(super) fn statements(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment") && part.kind() != "switch_label").collect()
}

fn declares(block: Node) -> bool {
    children(block).iter().any(|part| matches!(part.kind(), "local_variable_declaration" | "class_declaration" | "record_declaration"))
}

impl Layout<'_, '_> {
    fn line(&self, node: Node) -> usize {
        self.context.line(node)
    }

    fn runs(&self, _state: State, node: Node) -> State {
        crate::engine::source::walk(node, |part| {
            if part.kind() == "ternary_expression" {
                self.targets.borrow_mut().push(part.end_byte());
            }
        });
        State { last: Last::Runs(self.line(node)), alive: true, pending: false }
    }

    /// A forward jump to a source offset; nothing when the code is not reachable.
    pub(super) fn jump(&self, state: State, target: usize) -> State {
        if !state.alive {
            return State { pending: false, ..state };
        }
        self.targets.borrow_mut().push(target);
        State { last: Last::Jumps, alive: false, pending: false }
    }

    /// Where a labelled `break` lands: after its statement inside the switch, or past the switch.
    fn labelled_target(&self, node: Node, label: &str) -> usize {
        let mut at = node.parent();
        while let Some(holder) = at {
            let named = holder.kind() == "labeled_statement" && holder.named_child(0).is_some_and(|name| self.context.text(name) == label);
            if named {
                return if holder.end_byte() <= self.end { holder.end_byte() } else { usize::MAX };
            }
            at = holder.parent();
        }
        usize::MAX
    }

    /// A `continue`: back to a loop's start, or forward to the update of a `for` loop or the test of a `do`.
    fn continue_statement(&self, node: Node, state: State) -> State {
        let mut at = node.parent();
        let mut inner = node;
        while let Some(holder) = at {
            if matches!(holder.kind(), "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement") {
                let forward = holder.kind() == "do_statement" || (holder.kind() == "for_statement" && holder.child_by_field_name("update").is_some());
                let inside = holder.end_byte() <= self.end;
                if !forward {
                    let last = if inside { Last::Back(self.line(node)) } else { Last::Jumps };
                    return if state.alive { State { last, alive: false, pending: false } } else { State { pending: false, ..state } };
                }
                let target = if inside {
                    holder.end_byte()
                } else if ends_body(holder, inner) {
                    self.end
                } else {
                    usize::MAX
                };
                return self.jump(state, target);
            }
            if holder.kind() == "switch_expression" && holder.child_by_field_name("body").is_some_and(|body| body.end_byte() == self.end) {
                inner = holder;
            }
            at = holder.parent();
        }
        state
    }

    fn block(&self, node: Node, state: State) -> State {
        let mut state = state;
        for part in statements(node) {
            state = self.statement(part, state);
        }
        if declares(node) && state.pending {
            state.alive = true;
            state.pending = false;
        }
        state
    }

    pub(super) fn statement(&self, node: Node, state: State) -> State {
        match node.kind() {
            "block" => self.block(node, state),
            "expression_statement" | "assert_statement" => self.runs(state, node),
            "local_variable_declaration" => match children(node).iter().any(|part| part.child_by_field_name("value").is_some()) {
                true => self.runs(state, node),
                false => state,
            },
            "return_statement" | "throw_statement" | "yield_statement" => State { last: Last::Returns, alive: false, pending: false },
            "synchronized_statement" | "try_with_resources_statement" => State { last: Last::Returns, alive: false, pending: false },
            "try_statement" => self.try_statement(node, state),
            "break_statement" => {
                if self.final_break == Some(node.id()) {
                    return state;
                }
                let target = match named_children(node).into_iter().find(|part| part.kind() == "identifier") {
                    Some(label) => self.labelled_target(node, self.context.text(label)),
                    None if self.own_break(node) => self.end,
                    None => self.loop_end(node),
                };
                self.jump(state, target)
            }
            "continue_statement" => self.continue_statement(node, state),
            "labeled_statement" => named_children(node).into_iter().filter(|part| part.kind() != "identifier").fold(state, |state, part| self.statement(part, state)),
            "if_statement" => self.if_statement(node, state),
            "while_statement" | "for_statement" => self.loop_statement(node, state),
            "enhanced_for_statement" => {
                let after = self.loop_statement(node, state);
                State { alive: after.alive || after.pending, pending: false, ..after }
            }
            "do_statement" => {
                if let Some(body) = node.child_by_field_name("body") {
                    self.statement(body, state);
                }
                let condition = node.child_by_field_name("condition").unwrap_or(node);
                State { last: Last::Runs(self.line(condition)), alive: true, pending: false }
            }
            "switch_expression" => self.nested_switch(node, state),
            ";" | "local_class_declaration" | "class_declaration" | "record_declaration" | "interface_declaration" | "enum_declaration" => state,
            _ => self.runs(state, node),
        }
    }

    fn loop_end(&self, node: Node) -> usize {
        let mut at = node.parent();
        while let Some(holder) = at {
            if matches!(holder.kind(), "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement" | "switch_expression") {
                return holder.end_byte();
            }
            at = holder.parent();
        }
        usize::MAX
    }

    /// Whether a `break` leaves the switch being laid out, not a loop or switch inside it.
    fn own_break(&self, node: Node) -> bool {
        let mut at = node.parent();
        while let Some(holder) = at {
            match holder.kind() {
                "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement" => return false,
                "switch_expression" => return true,
                _ => at = holder.parent(),
            }
        }
        false
    }

    fn if_statement(&self, node: Node, state: State) -> State {
        let condition = self.runs(state, node.child_by_field_name("condition").unwrap_or(node));
        let then = node.child_by_field_name("consequence").map_or(condition, |part| self.statement(part, condition));
        match node.child_by_field_name("alternative") {
            None => State { pending: true, alive: then.alive, ..then },
            Some(other) => {
                let skip = then.alive;
                if skip {
                    self.targets.borrow_mut().push(node.end_byte());
                }
                let after_then = State { alive: false, pending: true, last: if skip { Last::Jumps } else { then.last } };
                if skip && jumps_only(other) {
                    self.targets.borrow_mut().pop();
                    self.statement(other, State { alive: true, ..after_then });
                    return State { last: then.last, alive: false, pending: true };
                }
                let other = self.statement(other, after_then);
                State { pending: other.pending || skip || then.pending, ..other }
            }
        }
    }

    fn loop_statement(&self, node: Node, state: State) -> State {
        let entered = match node.child_by_field_name("condition") {
            Some(condition) => self.runs(state, condition),
            None => State { alive: true, ..state },
        };
        let before = self.targets.borrow().len();
        let body = node.child_by_field_name("body").map_or(entered, |body| self.statement(body, entered));
        let direct = node.kind() == "do_statement" || (node.kind() == "for_statement" && node.child_by_field_name("update").is_some());
        if let Some(looped) = node.child_by_field_name("body").filter(|_| !direct) {
            let text = self.context.text(looped);
            let base = looped.start_byte();
            let mut targets = self.targets.borrow_mut();
            let kept: Vec<usize> = targets.split_off(before).into_iter().filter(|target| {
                !(base..looped.end_byte()).contains(target) || !text[target - base..].chars().all(|c| c.is_whitespace() || c == '}')
            }).collect();
            targets.extend(kept);
        }
        let condition = node.child_by_field_name("condition").map(|condition| self.context.text(condition).replace(['(', ')', ' '], ""));
        let infinite = node.kind() != "enhanced_for_statement" && condition.is_none_or(|condition| condition == "true");
        let mut exits = !infinite;
        crate::engine::source::walk(node, |part| exits |= part.kind() == "break_statement" && !self.own_break(part));
        let closing = node.child_by_field_name("body").and_then(|body| self.closing_line(body));
        let back = match node.child_by_field_name("update") {
            Some(update) => self.line(update),
            None if closing.is_some() => closing.unwrap_or(0),
            None => match body.last {
                Last::Runs(line) | Last::Back(line) => line,
                _ => self.line(node),
            },
        };
        let _ = state;
        let last = if body.alive || body.pending { Last::Back(back) } else { body.last };
        let declared = node.kind() == "for_statement" && node.child_by_field_name("init").is_some_and(|init| init.kind() == "local_variable_declaration");
        if declared && exits {
            return State { last, alive: true, pending: false, ..body };
        }
        State { last, alive: false, pending: exits, ..body }
    }

    fn closing_line(&self, node: Node) -> Option<usize> {
        match node.kind() {
            "block" if declares(node) => Some(self.context.line_at(node.end_byte().saturating_sub(1))),
            "block" => statements(node).last().and_then(|last| self.closing_line(*last)),
            "if_statement" => node.child_by_field_name("alternative").or(node.child_by_field_name("consequence")).and_then(|part| self.closing_line(part)),
            _ => None,
        }
    }

    fn try_statement(&self, node: Node, state: State) -> State {
        if node.child_by_field_name("finally").is_some() || children(node).iter().any(|part| part.kind() == "finally_clause") {
            return State { last: Last::Returns, alive: false, pending: false };
        }
        let body = node.child_by_field_name("body").map_or(state, |body| self.statement(body, state));
        if body.alive {
            self.targets.borrow_mut().push(node.end_byte());
        }
        let mut after = State { alive: false, pending: false, last: if body.alive { Last::Jumps } else { body.last } };
        let mut skipped = body.alive || body.pending;
        let clauses: Vec<Node> = children(node).into_iter().filter(|part| part.kind() == "catch_clause").collect();
        for (at, clause) in clauses.iter().enumerate() {
            if at > 0 && after.alive {
                self.targets.borrow_mut().push(node.end_byte());
            }
            skipped |= after.alive || after.pending;
            let caught = children(*clause).into_iter().find(|part| part.kind() == "catch_formal_parameter").unwrap_or(*clause);
            let handler = State { last: Last::Runs(self.line(caught)), alive: true, pending: false, ..after };
            after = clause.child_by_field_name("body").map_or(handler, |body| self.statement(body, handler));
        }
        State { pending: after.pending || skipped, ..after }
    }

    fn nested_switch(&self, node: Node, state: State) -> State {
        let started = self.runs(state, node);
        let Some(body) = node.child_by_field_name("body") else { return started };
        let inner = Layout { context: self.context, final_break: final_break(body), end: body.end_byte(), targets: self.targets };
        let groups = children(body).into_iter().filter(|part| matches!(part.kind(), "switch_block_statement_group" | "switch_rule")).collect::<Vec<_>>();
        let mut current = State { last: Last::Start, ..started };
        for group in &groups {
            current = State { alive: true, pending: false, ..current };
            current = inner.group(*group, current, group.id() == groups.last().map_or(0, |last| last.id()));
        }
        State { pending: true, ..current }
    }

    pub(super) fn group(&self, group: Node, state: State, last_group: bool) -> State {
        if group.kind() == "switch_rule" {
            let body = named_children(group).into_iter().find(|part| part.kind() != "switch_label");
            let after = body.map_or(state, |body| self.statement(body, state));
            return if last_group { after } else { self.jump(after, self.end) };
        }
        statements(group).into_iter().fold(state, |state, part| self.statement(part, state))
    }
}

/// A `break` or `continue`, alone or in blocks: right after a jump it emits nothing, javac chains it instead.
fn jumps_only(node: Node) -> bool {
    match node.kind() {
        "break_statement" | "continue_statement" => true,
        "block" => {
            let inner = statements(node);
            !inner.is_empty() && inner.into_iter().all(jumps_only)
        }
        _ => false,
    }
}

/// Whether a statement is the last thing a loop's body runs, so that what follows it is the loop's update.
fn ends_body(looped: Node, statement: Node) -> bool {
    let mut at = statement;
    while let Some(holder) = at.parent() {
        if holder.id() == looped.id() {
            return true;
        }
        if holder.kind() != "block" || statements(holder).last().is_none_or(|last| last.id() != at.id()) {
            return false;
        }
        at = holder;
    }
    false
}

/// The `break` written last in a switch, which javac drops since it would jump to the next instruction.
pub(super) fn final_break(body: Node) -> Option<usize> {
    let last = children(body).into_iter().filter(|part| matches!(part.kind(), "switch_block_statement_group" | "switch_rule")).last()?;
    let mut statement = statements(last).into_iter().last()?;
    while statement.kind() == "block" {
        statement = statements(statement).into_iter().last()?;
    }
    (statement.kind() == "break_statement" && named_children(statement).iter().all(|part| part.kind() != "identifier")).then_some(statement.id())
}

pub(super) fn is_default(group: Node) -> bool {
    children(group).into_iter().filter(|part| part.kind() == "switch_label").any(|label| children(label).iter().any(|part| part.kind() == "default"))
}
