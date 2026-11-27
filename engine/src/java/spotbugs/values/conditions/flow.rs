//! Follows the values of one body through its graph and judges each comparison with a constant on the way: one
//! that the values left, or the variable's type, decide either way.
use super::super::super::Context;
use super::keys::{Key, key};
use super::ranges::{Kind, Op, Set};
use super::state::State;
use crate::engine::source::{children, parent};
use crate::java::flow::cfg::{Cfg, Exit, unwrap};
use crate::java::types::constant::Constant;
use std::collections::HashSet;
use tree_sitter::Node;

pub struct Test {
    pub key: Key,
    pub op: Op,
    pub value: i128,
}

/// A comparison whose result is known.
pub struct Verdict<'t> {
    pub test: Node<'t>,
    pub block: Option<usize>,
    pub key: Key,
    pub op: Op,
    pub value: i128,
    pub always: bool,
    /// Decided by the variable's type alone.
    pub typed: bool,
    /// Another test compared the value with the same constant before.
    pub repeated: bool,
}

/// `x < 3`, `3 > x`, `flag`, `flag == true`, with the variable of a followed kind and the other side a constant.
pub fn test(context: &Context, node: Node) -> Option<Test> {
    let node = unwrap(node);
    if node.kind() != "binary_expression" {
        let found = key(context, node).filter(|found| found.kind == Kind::Boolean)?;
        return Some(Test { key: found, op: Op::Ne, value: 0 });
    }
    let op = Op::parse(context.text(node.child_by_field_name("operator")?))?;
    let (left, right) = (node.child_by_field_name("left")?, node.child_by_field_name("right")?);
    if let Some(found) = key(context, left) {
        let value = constant(context, right, found.kind)?;
        return Some(Test { key: found, op, value });
    }
    let found = key(context, right)?;
    let value = constant(context, left, found.kind)?;
    Some(Test { key: found, op: op.swapped(), value })
}

fn constant(context: &Context, node: Node, kind: Kind) -> Option<i128> {
    let node = unwrap(node);
    if kind == Kind::Boolean {
        return match node.kind() {
            "true" => Some(1),
            "false" => Some(0),
            _ => None,
        };
    }
    if node.kind() == "character_literal" {
        let image = context.text(node);
        if let Some(hex) = image.strip_prefix("'\\").and_then(|rest| rest.trim_start_matches('u').strip_suffix('\'')).filter(|_| image.contains("\\u")) {
            return i128::from_str_radix(hex, 16).ok();
        }
    }
    match context.resolver.constant_number(node)? {
        Constant::Int(value) => Some(value.into()),
        Constant::Char(value) => Some(value.into()),
        Constant::Long(value) if kind == Kind::Long => Some(value.into()),
        _ => None,
    }
}

/// What a test tells: its verdict, and the state on the side where it holds and where it fails. A side the values
/// rule out still runs on, with no value left, which decides no test and adds nothing where paths meet.
fn judge<'t>(state: &State, test: &Test, node: Node<'t>, block: Option<usize>) -> (Option<State>, Option<State>, Option<Verdict<'t>>) {
    let domain = Set::of(test.key.kind);
    let holding = test.op.holding(test.value);
    let fact = state.fact(&test.key);
    let known = fact.and_then(|fact| fact.set.clone()).unwrap_or_else(|| domain.clone());
    let (yes, no) = (known.and(&holding), known.without(&holding));
    let typed = domain.and(&holding).is_empty() || domain.without(&holding).is_empty();
    let narrowed = fact.is_some_and(|fact| fact.set.is_some());
    let repeated = fact.is_some_and(|fact| fact.constants.iter().any(|(value, at)| *value == test.value && *at != node.id()));
    let decided = (yes.is_empty() || no.is_empty()) && (typed || narrowed) && !known.is_empty();
    let verdict = decided.then(|| Verdict {
        test: node,
        block,
        key: test.key.clone(),
        op: test.op,
        value: test.value,
        always: no.is_empty(),
        typed,
        repeated,
    });
    let side = |set: Set| {
        let mut next = state.clone();
        next.narrow(&test.key, set, (test.value, node.id()));
        Some(next)
    };
    (side(yes), side(no), verdict)
}

/// Applies a step that is not a test to the state.
fn apply(context: &Context, state: &mut State, step: Node) {
    match step.kind() {
        "variable_declarator" => {
            let Some(name) = step.child_by_field_name("name") else { return };
            store(context, state, context.text(name), step.child_by_field_name("value"));
        }
        "assignment_expression" => {
            let Some(left) = step.child_by_field_name("left").map(unwrap) else { return };
            let plain = step.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=");
            target(context, state, left, step.child_by_field_name("right").filter(|_| plain));
        }
        "update_expression" => {
            if let Some(operand) = children(step).into_iter().find(|part| part.is_named()) {
                target(context, state, unwrap(operand), None);
            }
        }
        "enhanced_for_statement" => {
            if let Some(name) = step.child_by_field_name("name") {
                state.store_local(context.text(name));
            }
        }
        "catch_formal_parameter" => {
            if let Some(name) = step.child_by_field_name("name") {
                state.store_local(context.text(name));
            }
        }
        "method_invocation" | "object_creation_expression" if state.has_fields() && super::calls::changes(context, step) => {
            state.call(super::calls::rewritten(context));
        }
        "parenthesized_expression" if state.has_fields() && parent(step).is_some_and(|holder| holder.kind() == "synchronized_statement") => {
            state.call(super::calls::rewritten(context));
        }
        "binary_expression" => {
            if let Some(found) = test(context, step) {
                state.remember(&found.key, (found.value, step.id()));
            }
        }
        _ => {}
    }
}

fn target(context: &Context, state: &mut State, left: Node, value: Option<Node>) {
    match left.kind() {
        "identifier" if matches!(context.resolver.binding(left, context.text(left)), Some(crate::java::types::expr::Binding::Local(_))) => {
            store(context, state, context.text(left), value);
        }
        "identifier" | "field_access" => {
            let named = left.child_by_field_name("field").unwrap_or(left);
            let field = super::super::super::fields::field_key(context, left).unwrap_or_else(|| ("?".to_string(), context.text(named).to_string()));
            state.store_field(&field);
        }
        _ => {}
    }
}

fn store(context: &Context, state: &mut State, local: &str, value: Option<Node>) {
    let held = value.and_then(|value| key(context, value));
    state.store_local(local);
    if let Some(held) = held {
        state.copy(local, &held);
    }
}

/// Every test of the body whose result is known, with the block it ends, once per test.
pub fn verdicts<'t>(context: &Context, graph: &Cfg<'t>) -> Vec<Verdict<'t>> {
    let count = graph.blocks.len();
    let mut entry: Vec<Option<State>> = vec![None; count];
    entry[0] = Some(State::default());
    for _ in 0..64 {
        let mut changed = false;
        for block in 0..count {
            let Some(start) = entry[block].clone() else { continue };
            let (state, _) = run(context, graph, block, &start);
            let mut next = Vec::new();
            match &graph.blocks[block].exit {
                Exit::End => {}
                Exit::Jump(to) => next.push((*to, Some(state.clone()))),
                Exit::Branch(node, holds, fails) => match test(context, *node) {
                    Some(parsed) => {
                        let (yes, no, _) = judge(&state, &parsed, *node, Some(block));
                        next.push((*holds, yes));
                        next.push((*fails, no));
                    }
                    None => {
                        next.push((*holds, Some(state.clone())));
                        next.push((*fails, Some(state.clone())));
                    }
                },
                Exit::Any(all) => next.extend(all.iter().map(|to| (*to, Some(state.clone())))),
            }
            for catch in graph.blocks[block].catches.iter().flatten() {
                next.push((catch.block, Some(start.join(&state))));
            }
            for (to, value) in next {
                let Some(value) = value else { continue };
                let merged = entry[to].as_ref().map_or_else(|| value.clone(), |old| old.join(&value));
                if entry[to].as_ref() != Some(&merged) {
                    entry[to] = Some(merged);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    verdicts_final(context, graph, entry)
}

/// The state after a block's steps, and the verdicts of the comparisons it uses as values.
fn run<'t>(context: &Context, graph: &Cfg<'t>, block: usize, start: &State) -> (State, Vec<Verdict<'t>>) {
    let mut state = start.clone();
    let mut found = Vec::new();
    let ending = match &graph.blocks[block].exit {
        Exit::Branch(node, ..) => Some(node.id()),
        _ => None,
    };
    for step in &graph.blocks[block].steps {
        if Some(step.id()) == ending {
            continue;
        }
        if let Some(value) = value_test(context, *step) {
            found.extend(judge(&state, &value, *step, None).2);
        }
        apply(context, &mut state, *step);
    }
    (state, found)
}

fn verdicts_final<'t>(context: &Context, graph: &Cfg<'t>, entry: Vec<Option<State>>) -> Vec<Verdict<'t>> {
    let mut found: Vec<Verdict<'t>> = Vec::new();
    let mut seen = HashSet::new();
    for (block, start) in entry.iter().enumerate() {
        let Some(start) = start else { continue };
        let (state, values) = run(context, graph, block, start);
        found.extend(values.into_iter().filter(|verdict| seen.insert((verdict.test.id(), block))));
        let Exit::Branch(node, ..) = &graph.blocks[block].exit else { continue };
        if let Some(parsed) = test(context, *node) {
            found.extend(judge(&state, &parsed, *node, Some(block)).2);
        }
    }
    found
}

/// A comparison javac compiles to a value, not to a jump the statement follows.
fn value_test(context: &Context, step: Node) -> Option<Test> {
    let comparison = step.kind() == "binary_expression"
        && step.child_by_field_name("operator").is_some_and(|operator| Op::parse(context.text(operator)).is_some());
    comparison.then(|| test(context, step)).flatten()
}
