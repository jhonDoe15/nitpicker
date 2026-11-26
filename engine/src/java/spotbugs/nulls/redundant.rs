//! What the forward pass knows at a test or a read of a local variable, reported as SpotBugs does:
//! RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE, RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE,
//! RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE and NP_LOAD_OF_KNOWN_NULL_VALUE.
//!
//! As measured, a comparison with `null` of a variable or field whose value is already known is reported by what the
//! way the test rules out leads to: code of its own, a place where other ways meet too (empty), or a `throw`. By what is known and that way (own code / empty /
//! throw): dereferenced before, high / medium / medium; known from an earlier test, high / medium / not
//! reported; created here (`new`, a string, `this`), medium / not / not; known null, medium / not / not.
//! Fields count too, named with their class's full name. A read of a local variable known to be null from a comparison is reported once per such null and method,
//! where it is first read, unless it is handed straight to `return`. Of the tests one value (proved, dereferenced,
//! or created and then tested) makes redundant, only the one with the highest priority is reported, the first on a
//! tie. A test or read in a `finally` body counts
//! only when it is so on every way out.
use super::super::Context;
use super::effects::Unit;
use super::forward::{Flow, Kind, NONNULL, NULL};
use super::{copies, paths};
use crate::engine::source::parent;
use crate::java::flow::cfg::{Cfg, Exit};
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

pub const NONNULL_CHECK: &str = "RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE";
pub const NULL_CHECK: &str = "RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE";
pub const WOULD_THROW: &str = "RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE";
pub const KNOWN_NULL: &str = "NP_LOAD_OF_KNOWN_NULL_VALUE";

#[derive(PartialEq)]
enum Way {
    Own,
    Empty,
    Throw,
}

fn successors(cfg: &Cfg, block: usize) -> Vec<usize> {
    match &cfg.blocks[block].exit {
        Exit::End => Vec::new(),
        Exit::Jump(to) => vec![*to],
        Exit::Branch(_, holds, fails) => vec![*holds, *fails],
        Exit::Any(all) => all.clone(),
    }
}

fn passes_on(cfg: &Cfg, block: usize) -> bool {
    cfg.blocks[block].steps.is_empty() && matches!(cfg.blocks[block].exit, Exit::Jump(_)) && block != cfg.end
}

/// The first block on the way that does something, past blocks that only pass on.
pub fn first_doing(cfg: &Cfg, mut block: usize) -> usize {
    for _ in 0..cfg.blocks.len() {
        match cfg.blocks[block].exit {
            Exit::Jump(to) if passes_on(cfg, block) => block = to,
            _ => break,
        }
    }
    block
}

/// Whether more than one way leads into the block: a place where ways meet.
fn joins(cfg: &Cfg, target: usize) -> bool {
    let mut from = HashSet::new();
    for block in (0..cfg.blocks.len()).filter(|block| !passes_on(cfg, *block)) {
        if successors(cfg, block).into_iter().any(|next| first_doing(cfg, next) == target) {
            from.insert(block);
        }
    }
    from.len() > 1
}

fn throws(cfg: &Cfg, mut block: usize) -> bool {
    for _ in 0..cfg.blocks.len() {
        let current = &cfg.blocks[block];
        if let Some(first) = current.steps.first() {
            const THROWING: &[&str] = &["throw_statement", "assert_statement"];
            return THROWING.contains(&first.kind()) || crate::engine::source::ancestor(*first, THROWING).is_some();
        }
        match current.exit {
            Exit::Jump(to) => block = to,
            _ => return false,
        }
    }
    false
}

fn way(cfg: &Cfg, dead: usize) -> Way {
    let target = first_doing(cfg, dead);
    if joins(cfg, target) {
        Way::Empty
    } else if throws(cfg, target) {
        Way::Throw
    } else {
        Way::Own
    }
}

/// The priority SpotBugs gives, if it reports it at all at medium priority.
fn priority(kind: Kind, way: &Way) -> Option<u8> {
    match (kind, way) {
        (Kind::Dereferenced, Way::Own) | (Kind::Proved, Way::Own) => Some(1),
        (Kind::Dereferenced, _) | (Kind::Proved, Way::Empty) => Some(2),
        (Kind::Created, Way::Own) => Some(2),
        _ => None,
    }
}

fn returned(node: Node) -> bool {
    let mut inner = node;
    while let Some(above) = parent(inner) {
        match above.kind() {
            "parenthesized_expression" | "cast_expression" => inner = above,
            "ternary_expression" if above.child_by_field_name("condition") != Some(inner) => inner = above,
            "return_statement" => return true,
            _ => return false,
        }
    }
    false
}

const STATEMENTS: &[&str] = &[
    "expression_statement", "local_variable_declaration", "return_statement", "throw_statement", "if_statement", "while_statement",
    "for_statement", "enhanced_for_statement", "do_statement", "switch_expression", "assert_statement", "yield_statement",
    "explicit_constructor_invocation", "field_declaration", "lambda_expression", "synchronized_statement",
];

/// Where the condition of a `?:` or a loop starts and the line the compiler marks for it: the line of its
/// operator, or of the condition itself.
fn condition_mark(context: &Context, part: Node) -> Option<(usize, usize)> {
    let field = match part.kind() {
        "ternary_expression" | "while_statement" | "for_statement" | "do_statement" => "condition",
        _ => return None,
    };
    let condition = paths::strip(part.child_by_field_name(field)?);
    let marked = condition.child_by_field_name("operator").filter(|_| condition.kind() == "binary_expression").unwrap_or(condition);
    Some((condition.start_byte(), context.line(marked)))
}

/// The line the compiled code gives a read or a test: the line of the statement, moved on by every method call
/// that finished before it (the compiler marks the line of a call where it is made, after its arguments) and by
/// the condition of a `?:` or a loop it is in or after (marked at its operator).
fn load_line(context: &Context, node: Node) -> usize {
    let Some(statement) = crate::engine::source::ancestor(node, STATEMENTS) else { return context.line(node) };
    let mut last = (statement.start_byte(), context.line(statement));
    crate::engine::source::walk(statement, |part| {
        let call = part.kind() == "method_invocation" && part.end_byte() <= node.start_byte();
        let mark = if call { Some((part.end_byte(), context.line(part.child_by_field_name("name").unwrap_or(part)))) } else { condition_mark(context, part) };
        if let Some((at, line)) = mark.filter(|(at, _)| *at <= node.start_byte() && *at >= last.0) {
            last = (at, line);
        }
    });
    last.1
}

struct Candidate<'a> {
    rank: u8,
    node: Node<'a>,
    line: usize,
    name: String,
    full: String,
}

/// A comparison with `null` of the result of a call that never returns null, reported where the way it rules out
/// is code of its own.
fn calls<'a>(context: &Context<'a>, unit: &Unit<'_, 'a>, flow: &Flow<'_, '_, 'a>, label: &str) {
    let mut ways: HashMap<usize, (Node<'a>, Node<'a>, bool)> = HashMap::new();
    let mut order = Vec::new();
    for (block, node) in &flow.call_checks {
        let Exit::Branch(_, holds, fails) = unit.cfg.blocks[*block].exit else { continue };
        let Some(operator) = node.child_by_field_name("operator").filter(|_| node.kind() == "binary_expression") else { continue };
        let sides = [node.child_by_field_name("left"), node.child_by_field_name("right")].map(|side| side.map(paths::strip));
        let [Some(left), Some(right)] = sides else { continue };
        let call = match (left.kind(), right.kind()) {
            ("null_literal", _) => right,
            (_, "null_literal") => left,
            _ => continue,
        };
        if !unit.nonnull_calls.contains_key(&call.id()) {
            continue;
        }
        let dead = if operator.kind() == "==" { holds } else { fails };
        let own = way(&unit.cfg, dead) == Way::Own;
        let entry = ways.entry(node.id()).or_insert_with(|| {
            order.push(node.id());
            (*node, call, true)
        });
        entry.2 &= own;
    }
    for id in order {
        let (node, call, own) = ways[&id];
        if own {
            let name = &unit.nonnull_calls[&call.id()];
            let message = format!("Redundant nullcheck of {name}, which is known to be non-null in {label}");
            context.report(NONNULL_CHECK, node, load_line(context, node), message);
        }
    }
}

pub fn report<'a>(context: &Context<'a>, unit: &Unit<'_, 'a>, flow: &Flow<'_, '_, 'a>, label: &str) {
    calls(context, unit, flow, label);
    let cfg = &unit.cfg;
    let mut seen = HashSet::new();
    let mut found: HashMap<u32, (u32, Candidate<'a>)> = HashMap::new();
    // A test in a `finally` body is compiled once per way out: it is redundant only if it is in every copy.
    let mut copies: HashMap<usize, Vec<u8>> = HashMap::new();
    for (_, node, state) in &flow.checks {
        copies.entry(node.id()).or_default().push(state.tag);
    }
    for (block, node, state) in &flow.checks {
        if copies[&node.id()].iter().any(|tag| *tag != state.tag) {
            continue;
        }
        let Some(test) = unit.tests[*block].as_ref() else { continue };
        let Exit::Branch(_, holds, fails) = cfg.blocks[*block].exit else { continue };
        if !seen.insert(node.id()) || !matches!(state.tag, NONNULL | NULL) {
            continue;
        }
        let Some(null_holds) = test.null_holds else { continue };
        let null_dead = state.tag == NONNULL;
        let dead = if null_holds == null_dead { holds } else { fails };
        let way = way(cfg, dead);
        let named = &unit.finder.all[if state.same == copies::NONE { test.path } else { state.same as usize }];
        let (name, full) = (&named.shown, &named.full);
        let line = load_line(context, *node);
        if state.tag == NULL {
            if way == Way::Own {
                context.report(NULL_CHECK, *node, line, format!("Redundant nullcheck of {full} which is known to be null in {label}"));
            }
            continue;
        }
        let Some(origin) = flow.origins.get(state.origin as usize) else { continue };
        let fresh_static = origin.kind == Kind::Created && named.static_field;
        let Some(rank) = priority(origin.kind, &way).filter(|_| !fresh_static) else { continue };
        let candidate = Candidate { rank, node: *node, line, name: name.clone(), full: full.clone() };
        if found.get(&origin.value).is_none_or(|(_, known)| (rank, node.start_byte()) < (known.rank, known.node.start_byte())) {
            found.insert(origin.value, (state.origin, candidate));
        }
    }
    let mut chosen: Vec<_> = found.into_values().collect();
    chosen.sort_by_key(|(_, candidate)| candidate.node.start_byte());
    for (key, Candidate { node, line, name, full, .. }) in chosen {
        let origin = &flow.origins[key as usize];
        if origin.kind == Kind::Dereferenced {
            let at = flow.dereferenced.get(&key).copied().unwrap_or(node);
            let message = format!("Nullcheck of {name} at line {line} of value previously dereferenced in {label}");
            context.report(WOULD_THROW, at, context.line(at), message);
        } else {
            context.report(NONNULL_CHECK, node, line, format!("Redundant nullcheck of {full}, which is known to be non-null in {label}"));
        }
    }
    let everywhere = |node: &Node| flow.read_counts.get(&node.id()).is_some_and(|(read, known)| read == known);
    let mut loads: Vec<&(usize, Node)> = flow.loads.iter().filter(|(_, node)| everywhere(node) && !returned(*node)).collect();
    loads.sort_by_key(|(_, node)| node.start_byte());
    let mut named = HashSet::new();
    for (origin, node) in loads {
        if named.insert(*origin) {
            context.report(KNOWN_NULL, *node, load_line(context, *node), format!("Load of known null value in {label}"));
        }
    }
}
