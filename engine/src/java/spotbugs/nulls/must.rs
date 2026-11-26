//! Backward over a body: at each point, the paths whose current value is dereferenced on every way out of the
//! body that does not go through an exception handler. A `throw` statement and a `return` are ways out.
use super::effects::{Effect, Unit};
use super::redundant::first_doing;
use crate::engine::source::ancestor;
use crate::java::flow::cfg::Exit;
use std::collections::HashMap;
use tree_sitter::Node;

const CATCHING_NULL: &[&str] = &["NullPointerException", "RuntimeException", "Exception"];

/// For the dereferences of parameters, as measured: a dereference that a `catch` of `NullPointerException`,
/// `RuntimeException` or `Exception`, a `finally` or a `synchronized` block around it would see does not count,
/// nor one in a `finally` body.
fn caught(unit: &Unit, block: usize, at: Node) -> bool {
    let context = unit.finder.context;
    let named = |kind: &Node| CATCHING_NULL.contains(&context.text(*kind).rsplit('.').next().unwrap_or_default());
    let handled = unit.cfg.blocks[block].catches.iter().flatten().any(|handler| handler.types.is_empty() || handler.types.iter().any(named));
    let within = |kinds: &[&str]| ancestor(at, kinds).is_some_and(|around| around.start_byte() >= unit.body.start_byte());
    handled || within(&["synchronized_statement"]) || within(&["finally_clause"])
}

/// The paths a tested local copies on the way back: each taken once from a plain read of the one before.
fn copied(assigned: &HashMap<usize, Vec<&Effect>>, path: usize) -> Vec<usize> {
    let mut found = Vec::new();
    let mut at = path;
    while let Some([Effect::Assign { from: Some(from), sources, .. }]) = assigned.get(&at).map(Vec::as_slice) {
        match sources.as_slice() {
            [source] if from.kind() == "identifier" && !found.contains(source) && assigned.get(source).is_none_or(|all| all.len() <= 1) => {
                found.push(*source);
                at = *source;
            }
            _ => break,
        }
    }
    found
}

pub type Bits = Vec<u64>;

pub fn has(bits: &Bits, path: usize) -> bool {
    bits.get(path / 64).is_some_and(|word| word & (1 << (path % 64)) != 0)
}

fn set(bits: &mut Bits, path: usize, on: bool) {
    if let Some(word) = bits.get_mut(path / 64) {
        if on {
            *word |= 1 << (path % 64);
        } else {
            *word &= !(1 << (path % 64));
        }
    }
}

fn both(a: &Bits, b: &Bits) -> Bits {
    a.iter().zip(b).map(|(a, b)| a & b).collect()
}

/// The set where each block starts and where it ends.
pub fn run(unit: &Unit) -> (Vec<Bits>, Vec<Bits>) {
    let words = unit.finder.all.len() / 64 + 1;
    let blocks = &unit.cfg.blocks;
    let mut starts: Vec<Bits> = vec![vec![u64::MAX; words]; blocks.len()];
    let mut ends: Vec<Bits> = vec![vec![0; words]; blocks.len()];
    // A block from which the body is never left says nothing: without this, a loop without an end would count
    // as dereferencing everything.
    let mut leaves: Vec<bool> = blocks.iter().map(|block| matches!(block.exit, Exit::End)).collect();
    let mut grown = true;
    while grown {
        grown = false;
        for block in 0..blocks.len() {
            let onward = match &blocks[block].exit {
                Exit::End => true,
                Exit::Jump(to) => leaves[*to],
                Exit::Branch(_, holds, fails) => leaves[*holds] || leaves[*fails],
                Exit::Any(all) => all.iter().any(|to| leaves[*to]),
            };
            if onward && !leaves[block] {
                leaves[block] = true;
                grown = true;
            }
        }
    }
    for block in (0..blocks.len()).filter(|block| !leaves[*block]) {
        starts[block] = vec![0; words];
    }
    let mut assigned: HashMap<usize, Vec<&Effect>> = HashMap::new();
    for effect in unit.effects.iter().flatten().flatten().filter(|_| unit.equals_rules()) {
        if let Effect::Assign { to, .. } = effect {
            assigned.entry(*to).or_default().push(effect);
        }
    }
    let mut changed = true;
    while changed {
        changed = false;
        for block in (0..blocks.len()).rev().filter(|block| leaves[*block]) {
            let mut now = match &blocks[block].exit {
                Exit::End => vec![0; words],
                Exit::Jump(to) => starts[*to].clone(),
                Exit::Branch(_, holds, fails) => both(&starts[*holds], &starts[*fails]),
                Exit::Any(all) => all.iter().fold(vec![if all.is_empty() { 0 } else { u64::MAX }; words], |kept, to| both(&kept, &starts[*to])),
            };
            let meet = |holds: usize, fails: usize| first_doing(&unit.cfg, holds) == first_doing(&unit.cfg, fails);
            if let Some(test) = &unit.tests[block] {
                let null_way = match (&blocks[block].exit, test.null_holds) {
                    (Exit::Branch(_, holds, fails), held) if unit.equals_rules() && !(test.compared && meet(*holds, *fails)) => Some(if held == Some(true) { *holds } else { *fails }),
                    _ => None,
                };
                set(&mut now, test.path, null_way.is_some_and(|way| has(&starts[way], test.path)));
                if let Some(way) = null_way {
                    for alias in copied(&assigned, test.path) {
                        set(&mut now, alias, has(&starts[way], alias));
                    }
                }
            }
            ends[block] = now.clone();
            for effects in unit.effects[block].iter().rev() {
                for effect in effects.iter().rev() {
                    match effect {
                        Effect::Deref { path: Some(path), at, .. } => {
                            if !unit.equals_rules() || !caught(unit, block, *at) {
                                set(&mut now, *path, true);
                            }
                        }
                        Effect::Deref { .. } => {}
                        Effect::Assign { to, sources, .. } => {
                            let wanted = has(&now, *to);
                            set(&mut now, *to, false);
                            for dependent in &unit.dependents[*to] {
                                set(&mut now, *dependent, false);
                            }
                            if wanted {
                                for source in sources {
                                    set(&mut now, *source, true);
                                }
                            }
                        }
                        Effect::Invalidate => {
                            for path in &unit.of_this {
                                set(&mut now, *path, false);
                            }
                        }
                        Effect::Checked(path, _) => set(&mut now, *path, false),
                        Effect::Asserted => now.iter_mut().for_each(|word| *word = 0),
                    }
                }
            }
            if now != starts[block] {
                starts[block] = now;
                changed = true;
            }
        }
    }
    (starts, ends)
}
