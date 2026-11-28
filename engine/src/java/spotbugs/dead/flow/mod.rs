//! Which stores the rest of the method never reads, and which stores another store to the same slot can follow,
//! over the flow graph with the edges to exception handlers that SpotBugs gives the compiled code: from calls
//! (to handlers of unchecked exceptions and of what the call declares), and from instructions that throw on
//! their own (to handlers of runtime exceptions), such as a division, an array access, a cast or `new`.
mod lines;
pub mod throws;

pub use lines::handler_lines;

use super::super::Context;
use super::slots::Layout;
use super::value::{increment, target, used};
use throws::{handlers, throws};
use crate::engine::source::walk;
use crate::java::flow::cfg::{Block, Cfg, Exit};
use std::collections::HashMap;
use tree_sitter::Node;

#[derive(Clone, PartialEq, Default)]
struct Bits(Vec<u64>);

impl Bits {
    fn of(size: usize) -> Bits {
        Bits(vec![0; size / 64 + 1])
    }
    fn set(&mut self, slot: u16) {
        self.0[slot as usize / 64] |= 1 << (slot % 64);
    }
    fn clear(&mut self, slot: u16) {
        self.0[slot as usize / 64] &= !(1 << (slot % 64));
    }
    fn has(&self, slot: u16) -> bool {
        self.0[slot as usize / 64] & (1 << (slot % 64)) != 0
    }
    fn add(&mut self, other: &Bits) {
        self.0.iter_mut().zip(&other.0).for_each(|(mine, theirs)| *mine |= theirs);
    }
}

#[derive(Default)]
struct Event {
    reads: Vec<u16>,
    /// Slot and, for a named variable, the store.
    writes: Vec<(u16, Option<usize>)>,
    /// Read right after the write: `++i` and `i += 1` used as a value.
    after: Vec<u16>,
    handlers: Vec<usize>,
}

/// What the flow says about a store: whether nothing reads it, and whether another store to its slot can follow.
#[derive(Clone, Copy)]
pub struct Fate<'a> {
    pub node: Node<'a>,
    pub var: usize,
    pub dead: bool,
    pub killed: bool,
}

pub struct Live<'a> {
    /// By the node of the store.
    pub fates: HashMap<usize, Fate<'a>>,
    entry: Bits,
}

impl Live<'_> {
    /// Whether the value a parameter comes in with may be read.
    pub fn read_on_entry(&self, slot: u16) -> bool {
        self.entry.has(slot)
    }
}

fn successors(cfg: &Cfg, block: usize) -> Vec<usize> {
    match &cfg.blocks[block].exit {
        Exit::End => Vec::new(),
        Exit::Jump(to) => vec![*to],
        Exit::Branch(test, _, fails) if test.kind() == "false" => vec![*fails],
        Exit::Branch(test, holds, _) if test.kind() == "true" => vec![*holds],
        Exit::Branch(_, holds, fails) => vec![*holds, *fails],
        Exit::Any(all) => all.clone(),
    }
}

pub fn run<'a>(context: &Context<'a>, layout: &Layout<'a>, cfg: &Cfg<'a>) -> Live<'a> {
    let size = layout.vars.iter().map(|var| var.slot as usize + 2).chain(layout.hidden.values().flatten().map(|slot| *slot as usize + 1)).max().unwrap_or(1);
    let events: Vec<Vec<Event>> = cfg.blocks.iter().map(|block| block.steps.iter().map(|step| event(context, layout, block, *step)).collect()).collect();
    let count = cfg.blocks.len();
    let mut live = vec![Bits::of(size); count];
    let mut reach = vec![Bits::of(size); count];
    let out = |block: usize, live: &[Bits], reach: &[Bits]| {
        let (mut now, mut ahead) = (Bits::of(size), Bits::of(size));
        for next in successors(cfg, block) {
            now.add(&live[next]);
            ahead.add(&reach[next]);
        }
        (now, ahead)
    };
    let mut before = vec![Vec::new(); count];
    for from in 0..count {
        let handlers = events[from].iter().flat_map(|step| step.handlers.iter().copied());
        successors(cfg, from).into_iter().chain(handlers).for_each(|to| before[to].push(from));
    }
    let mut ends: Vec<usize> = (0..count).filter(|block| matches!(cfg.blocks[*block].exit, Exit::End)).collect();
    let mut leaves = reaching(&before, &ends);
    let throwing = (0..count).filter(|block| !leaves[*block] && cfg.blocks[*block].steps.iter().any(|step| throws(context, *step).is_some()));
    let before_count = ends.len();
    ends.extend(throwing);
    if ends.len() > before_count {
        leaves = reaching(&before, &ends);
    }
    let mut changed = true;
    while changed {
        changed = false;
        for block in (0..count).rev().filter(|block| leaves[*block]) {
            let (mut now, mut ahead) = out(block, &live, &reach);
            events[block].iter().rev().for_each(|step| backward(step, &mut now, &mut ahead, &live, &reach));
            if now != live[block] || ahead != reach[block] {
                (live[block], reach[block], changed) = (now, ahead, true);
            }
        }
    }
    let mut fates: HashMap<usize, Fate<'a>> = HashMap::new();
    let (mut reached, mut pending) = (vec![false; count], vec![0]);
    while let Some(block) = pending.pop() {
        if !std::mem::replace(&mut reached[block], true) {
            pending.extend(successors(cfg, block).into_iter().chain(events[block].iter().flat_map(|step| step.handlers.iter().copied())));
        }
    }
    for block in (0..count).filter(|block| reached[*block]) {
        let (mut now, mut ahead) = out(block, &live, &reach);
        for (position, step) in events[block].iter().enumerate().rev() {
            for (slot, store) in &step.writes {
                let Some(var) = store else { continue };
                let read = leaves[block] && (now.has(*slot) || step.after.contains(slot));
                let node = cfg.blocks[block].steps[position];
                let fate = fates.entry(node.id()).or_insert(Fate { node, var: *var, dead: false, killed: false });
                fate.dead |= !read;
                fate.killed |= leaves[block] && ahead.has(*slot);
            }
            backward(step, &mut now, &mut ahead, &live, &reach);
        }
    }
    Live { fates, entry: live.first().cloned().unwrap_or_default() }
}

/// The blocks from which one of `ends` can be reached. From the others the method never ends, and SpotBugs takes
/// nothing there to be read or stored later.
fn reaching(before: &[Vec<usize>], ends: &[usize]) -> Vec<bool> {
    let (mut found, mut pending) = (vec![false; before.len()], ends.to_vec());
    while let Some(block) = pending.pop() {
        if !std::mem::replace(&mut found[block], true) {
            pending.extend(before[block].iter().copied());
        }
    }
    found
}

/// Moves what is read later (`now`) and what is stored later (`ahead`) back over a step.
fn backward(step: &Event, now: &mut Bits, ahead: &mut Bits, live: &[Bits], reach: &[Bits]) {
    step.after.iter().for_each(|slot| now.set(*slot));
    step.writes.iter().for_each(|(slot, _)| now.clear(*slot));
    step.reads.iter().for_each(|slot| now.set(*slot));
    step.writes.iter().for_each(|(slot, _)| ahead.set(*slot));
    for handler in &step.handlers {
        now.add(&live[*handler]);
        ahead.add(&reach[*handler]);
    }
}

fn read<'a>(layout: &Layout<'a>, node: Node<'a>, out: &mut Vec<u16>) {
    if let Some(var) = layout.uses.get(&node.id()).map(|var| &layout.vars[*var]).filter(|var| !var.constant) {
        out.push(var.slot);
    }
}

fn event<'a>(context: &Context<'a>, layout: &Layout<'a>, block: &Block<'a>, step: Node<'a>) -> Event {
    let mut event = Event::default();
    let declared = |node: Node| layout.decls.get(&node.id()).map(|var| (layout.vars[*var].slot, Some(*var)));
    match step.kind() {
        "identifier" => read(layout, step, &mut event.reads),
        "lambda_expression" | "object_creation_expression" | "class_declaration" | "record_declaration" | "enum_declaration" | "interface_declaration" => {
            let inner = if step.kind() == "object_creation_expression" { crate::engine::source::children(step).into_iter().find(|part| part.kind() == "class_body") } else { Some(step) };
            if let Some(inner) = inner {
                walk(inner, |part| {
                    if part.kind() == "identifier" {
                        read(layout, part, &mut event.reads);
                    }
                });
            }
        }
        "variable_declarator" if step.child_by_field_name("value").is_some() => event.writes.extend(declared(step)),
        "catch_formal_parameter" | "resource" => event.writes.extend(declared(step)),
        "assignment_expression" | "update_expression" => {
            if let Some(var) = target(step).and_then(|written| layout.uses.get(&written.id())) {
                let slot = layout.vars[*var].slot;
                event.writes.push((slot, Some(*var)));
                let prefix = step.kind() == "assignment_expression" || !context.text(step).trim_start().starts_with(|c: char| c.is_alphanumeric() || c == '_' || c == '$' || c == '(');
                if prefix && used(step) && increment(context, layout, step) {
                    event.after.push(slot);
                }
            }
        }
        "enhanced_for_statement" => {
            event.writes.extend(layout.hidden.get(&step.id()).into_iter().flatten().map(|slot| (*slot, None)));
            event.writes.extend(declared(step));
        }
        "instanceof_expression" | "switch_label" => {
            walk(step, |part| {
                if !matches!(part.kind(), "lambda_expression" | "class_body") {
                    event.writes.extend(declared(part));
                }
            });
        }
        _ => {}
    }
    event.writes.extend(layout.hidden.get(&step.id()).filter(|_| step.kind() != "enhanced_for_statement").into_iter().flatten().map(|slot| (*slot, None)));
    let thrown = if block.catches.is_empty() { None } else { throws(context, step) };
    if let Some(thrown) = thrown {
        event.handlers = handlers(context, block, &thrown);
    }
    event
}
