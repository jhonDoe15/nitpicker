//! Where a method holds a lock taken by a call: after more `lock()` (or `lockInterruptibly()`) calls than `unlock()`
//! calls on the same object on every path to the code. SpotBugs counts these calls whatever the class of the object is;
//! `tryLock()` takes nothing. The object is told apart by how the code names it.
use super::super::Context;
use crate::engine::source::parent;
use crate::java::flow::cfg::{self, Exit};
use std::collections::{BTreeMap, HashMap};
use tree_sitter::Node;

type Counts = BTreeMap<String, i32>;

/// The object a call locks or unlocks, and by how much.
fn change(context: &Context, step: Node) -> Option<(String, i32)> {
    if step.kind() != "method_invocation" {
        return None;
    }
    let empty = step.child_by_field_name("arguments").is_some_and(|arguments| arguments.named_child_count() == 0);
    let by = match step.child_by_field_name("name").map(|name| context.text(name)) {
        Some("lock" | "lockInterruptibly") if empty => 1,
        Some("unlock") if empty => -1,
        _ => return None,
    };
    let object = step.child_by_field_name("object").map(|object| context.text(object).replace(char::is_whitespace, "")).unwrap_or_default();
    Some((object.strip_prefix("this.").map(String::from).unwrap_or(object), by))
}

fn apply(counts: &mut Counts, change: Option<(String, i32)>) {
    if let Some((object, by)) = change {
        let count = counts.entry(object.clone()).or_insert(0);
        *count = (*count + by).max(0);
        if *count == 0 {
            counts.remove(&object);
        }
    }
}

fn meet(a: &Counts, b: &Counts) -> Counts {
    a.iter().filter_map(|(object, count)| Some((object.clone(), (*count).min(*b.get(object)?)))).collect()
}

/// How many locks are held where each step of a body starts, the least over the paths that reach it.
pub struct Held {
    at: HashMap<usize, bool>,
}

impl Held {
    pub fn of(context: &Context, body: Node) -> Held {
        let mut at = HashMap::new();
        let text = context.text(body);
        if !text.contains("lock") {
            return Held { at };
        }
        let graph = cfg::build(context.file, body, &|_| false);
        if !graph.blocks.iter().flat_map(|block| &block.steps).any(|step| change(context, *step).is_some()) {
            return Held { at };
        }
        let count = graph.blocks.len();
        let mut entry: Vec<Option<Counts>> = vec![None; count];
        entry[0] = Some(Counts::new());
        let mut changed = true;
        while changed {
            changed = false;
            for block in 0..count {
                let Some(start) = entry[block].clone() else { continue };
                let mut held = start;
                let mut lowest = held.clone();
                for step in &graph.blocks[block].steps {
                    apply(&mut held, change(context, *step));
                    lowest = meet(&lowest, &held);
                }
                let mut next = Vec::new();
                match &graph.blocks[block].exit {
                    Exit::End => {}
                    Exit::Jump(to) => next.push((*to, held.clone())),
                    Exit::Branch(_, holds, fails) => next.extend([(*holds, held.clone()), (*fails, held.clone())]),
                    Exit::Any(all) => next.extend(all.iter().map(|to| (*to, held.clone()))),
                }
                next.extend(graph.blocks[block].catches.iter().flatten().map(|catch| (catch.block, lowest.clone())));
                for (to, value) in next {
                    let merged = entry[to].as_ref().map_or_else(|| value.clone(), |old| meet(old, &value));
                    if entry[to].as_ref() != Some(&merged) {
                        entry[to] = Some(merged);
                        changed = true;
                    }
                }
            }
        }
        for (block, start) in entry.iter().enumerate() {
            let Some(mut held) = start.clone() else { continue };
            for step in &graph.blocks[block].steps {
                let slot = at.entry(step.id()).or_insert(!held.is_empty());
                *slot = *slot && !held.is_empty();
                apply(&mut held, change(context, *step));
            }
        }
        Held { at }
    }

    /// Whether a lock is held where `node` runs: the count before the nearest step that holds it.
    pub fn held(&self, node: Node) -> bool {
        let mut current = Some(node);
        while let Some(node) = current {
            if let Some(held) = self.at.get(&node.id()) {
                return *held;
            }
            current = parent(node);
        }
        false
    }
}
