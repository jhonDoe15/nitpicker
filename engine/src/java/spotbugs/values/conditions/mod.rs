//! UC_USELESS_CONDITION and UC_USELESS_CONDITION_TYPE (RedundantConditions), rebuilt from lab runs of SpotBugs.
//!
//! The values each local variable, field read and length can still hold are followed through the method (`flow`),
//! narrowed only by comparisons with constants; stores, merges and calls widen them (`state`, `calls`), and the
//! failing side of an `assert` ends the method. A comparison that the values left decide is UC_USELESS_CONDITION;
//! one that a `short`, `char` or `byte` decides by its range alone is UC_USELESS_CONDITION_TYPE. It is priority 1
//! when the side it rules out starts code no path reaches without a side some known test rules out, else 2, and then
//! not reported when another test compared the value with the same constant before (for the type: when the constant
//! is in the type's range or next to it). Of a method's findings with the same pattern and fact one is kept, the
//! first in priority, then the last in the code. Never reported: a test of an `assert`, a test whose two sides go to
//! the same code, and a test the type decides of any type but `short`, `char` and `byte`, of a `char` against a
//! constant of 0 or less, or of a `byte` against anything but -128.
mod calls;
mod flow;
mod keys;
mod ranges;
mod state;

use super::super::{Context, names, place};
use crate::engine::source::{children, named_children, parent};
use crate::java::flow::cfg::{self, Cfg, Exit};
use flow::Verdict;
use ranges::Kind;
use std::collections::HashSet;
use tree_sitter::Node;

pub const USELESS: &str = "UC_USELESS_CONDITION";
pub const TYPE: &str = "UC_USELESS_CONDITION_TYPE";
pub const PATTERNS: &[&str] = &[USELESS, TYPE];

pub fn conditions<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    for member in body.map(place::members).unwrap_or_default() {
        let Some(code) = member.child_by_field_name("body").or_else(|| named_children(member).into_iter().find(|part| part.kind() == "block")) else { continue };
        let label = match member.kind() {
            "method_declaration" | "constructor_declaration" => names::around(context, code),
            "compact_constructor_declaration" => Some(names::method(context, own, class, None)),
            "static_initializer" => {
                let owner = names::binary(context, own);
                Some(format!("{owner}.<static initializer for {}>()", owner.rsplit(['.', '$']).next().unwrap_or_default()))
            }
            _ => None,
        };
        let Some(label) = label else { continue };
        let graph = cfg::build_with(context.file, code, &|_| false, true);
        let verdicts = flow::verdicts(context, &graph);
        let dead: HashSet<(usize, usize)> = verdicts.iter().filter_map(|verdict| dead_edge(&graph, verdict)).collect();
        let mut kept: Vec<Found> = Vec::new();
        for found in verdicts.iter().filter_map(|verdict| judged(context, &graph, verdict, &dead)) {
            let later = |other: &Found| (found.priority, std::cmp::Reverse(found.test.start_byte())) < (other.priority, std::cmp::Reverse(other.test.start_byte()));
            match kept.iter_mut().find(|other| other.pattern == found.pattern && other.arguments == found.arguments) {
                Some(other) if later(other) => *other = found,
                Some(_) => {}
                None => kept.push(found),
            }
        }
        for found in kept {
            let line = super::super::compare::lines::line(context, found.test);
            context.report_listed(found.pattern, found.test, line, found.message, place::function(&label), found.priority, found.arguments);
        }
    }
}

/// A finding of one body; of those with the same pattern and fact SpotBugs keeps one, the first in priority and
/// then the last in the code.
struct Found<'t> {
    pattern: &'static str,
    test: Node<'t>,
    message: String,
    priority: u8,
    arguments: Vec<String>,
}

fn typed_reported(kind: Kind, verdict: &Verdict) -> bool {
    match kind {
        Kind::Short => true,
        Kind::Char => verdict.value > 0,
        Kind::Byte => verdict.value == -128,
        _ => false,
    }
}

/// The way out of a test's block that its known result never takes.
fn dead_edge(graph: &Cfg, verdict: &Verdict) -> Option<(usize, usize)> {
    let block = verdict.block?;
    let Exit::Branch(_, holds, fails) = &graph.blocks[block].exit else { return None };
    Some((block, if verdict.always { *fails } else { *holds }))
}

fn judged<'t>(context: &Context, graph: &Cfg, verdict: &Verdict<'t>, dead: &HashSet<(usize, usize)>) -> Option<Found<'t>> {
    let kind = verdict.key.kind;
    if verdict.typed && !typed_reported(kind, verdict) {
        return None;
    }
    let (top, holder) = outermost(verdict.test);
    if holder.is_some_and(|holder| holder.kind() == "assert_statement") {
        return None;
    }
    let control = holder.is_some_and(|holder| match holder.kind() {
        "if_statement" | "while_statement" | "do_statement" | "for_statement" | "ternary_expression" => {
            holder.child_by_field_name("condition").is_some_and(|condition| condition.id() == top.id())
        }
        _ => false,
    });
    let priority = match (verdict.block, &verdict.block.map(|block| &graph.blocks[block].exit)) {
        (Some(_), Some(Exit::Branch(_, holds, fails))) => {
            if control && first_doing(graph, *holds) == first_doing(graph, *fails) {
                return None;
            }
            let ruled = if verdict.always { *fails } else { *holds };
            if !idiom(context, graph, ruled) && unreached(graph, ruled, dead) { 1 } else { 2 }
        }
        _ => 2,
    };
    if priority == 2 {
        let (low, high) = kind.domain();
        if (!verdict.typed && verdict.repeated) || (verdict.typed && (low - 1..=high + 1).contains(&verdict.value)) {
            return None;
        }
    }
    let op = if verdict.always { verdict.op } else { verdict.op.negated() };
    let fact = ranges::fact(&verdict.key.name, kind, op, verdict.value);
    let (pattern, message, arguments) = if verdict.typed {
        let message = format!("Useless condition: it's always {fact} because variable type is {}", kind.name());
        (TYPE, message, vec![fact, kind.name().to_string()])
    } else {
        (USELESS, format!("Useless condition: it's known that {fact} at this point"), vec![fact])
    };
    Some(Found { pattern, test: verdict.test, message, priority, arguments })
}

/// The test with the `&&`, `||`, `!` and parentheses around it, and the node that uses its result.
fn outermost(test: Node) -> (Node, Option<Node>) {
    let mut top = test;
    while let Some(holder) = parent(top) {
        let logic = match holder.kind() {
            "parenthesized_expression" => true,
            "binary_expression" => holder.child_by_field_name("operator").is_some_and(|operator| matches!(operator.kind(), "&&" | "||")),
            "unary_expression" => holder.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "!"),
            _ => false,
        };
        if !logic {
            return (top, Some(holder));
        }
        top = holder;
    }
    (top, None)
}

fn successors(graph: &Cfg, block: usize) -> Vec<usize> {
    let mut next = match &graph.blocks[block].exit {
        Exit::End => Vec::new(),
        Exit::Jump(to) => vec![*to],
        Exit::Branch(_, holds, fails) => vec![*holds, *fails],
        Exit::Any(all) => all.clone(),
    };
    next.extend(graph.blocks[block].catches.iter().flatten().map(|catch| catch.block));
    next
}

/// The first block on the way that does something, past empty blocks that only pass on.
fn first_doing(graph: &Cfg, mut block: usize) -> usize {
    for _ in 0..graph.blocks.len() {
        match graph.blocks[block].exit {
            Exit::Jump(to) if graph.blocks[block].steps.is_empty() && block != graph.end => block = to,
            _ => break,
        }
    }
    block
}

/// Whether the code the ruled out way leads to is reached by no way the known results of the body's tests take.
fn unreached(graph: &Cfg, ruled: usize, dead: &HashSet<(usize, usize)>) -> bool {
    let target = first_doing(graph, ruled);
    let mut seen = HashSet::from([0]);
    let mut todo = vec![0];
    while let Some(at) = todo.pop() {
        for next in successors(graph, at) {
            if dead.contains(&(at, next)) {
                continue;
            }
            if seen.insert(next) {
                todo.push(next);
            }
        }
    }
    !seen.contains(&target)
}

/// A side of `test ? 1 : 0` (or `0 : 1`, `true : false`): javac's value of a test, which SpotBugs does not count as
/// code of its own.
fn idiom(context: &Context, graph: &Cfg, dead: usize) -> bool {
    let target = first_doing(graph, dead);
    let Some(first) = graph.blocks[target].steps.first() else { return false };
    let bit = |node: Option<Node>| node.is_some_and(|node| matches!(context.text(node), "0" | "1" | "true" | "false"));
    let Some(ternary) = parent(*first).filter(|holder| holder.kind() == "ternary_expression") else { return false };
    bit(Some(*first)) && bit(ternary.child_by_field_name("consequence")) && bit(ternary.child_by_field_name("alternative"))
}
