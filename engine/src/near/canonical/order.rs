use super::effects::{accesses_of, is_stable};
use crate::near::keys::{KeyMode, key_of};
use crate::near::tree::{Text, Tree, compare_text};
use std::collections::{HashMap, HashSet};

pub struct OrderContext<'a> {
    pub escaping: HashSet<Text>,
    pub mode: KeyMode<'a>,
}

fn movable(statement: &Tree, escaping: &HashSet<Text>) -> bool {
    if !statement.is("declare") {
        return false;
    }
    let (name, value) = (statement.children.get(1), statement.children.get(2));
    name.is_some_and(|name| name.is_bound() && !name.value.as_ref().is_some_and(|value| escaping.contains(value)))
        && is_stable(value.expect("near-duplicate tree: declared value"), escaping)
}

fn waiting_counts(statements: &[Tree], movable_items: &[bool]) -> (Vec<usize>, Vec<Vec<usize>>) {
    let mut writers: HashMap<Option<Text>, Vec<usize>> = HashMap::new();
    let mut readers: HashMap<Option<Text>, Vec<usize>> = HashMap::new();
    let mut waiting = vec![0; statements.len()];
    let mut after = vec![Vec::new(); statements.len()];
    let mut fixed: Option<usize> = None;
    for (index, statement) in statements.iter().enumerate() {
        let access = accesses_of(statement);
        let mut earlier: HashSet<usize> = HashSet::new();
        if !movable_items[index] {
            earlier.extend(fixed);
        }
        for name in &access.reads {
            earlier.extend(writers.get(name).into_iter().flatten());
        }
        for name in &access.writes {
            earlier.extend(writers.get(name).into_iter().flatten());
            earlier.extend(readers.get(name).into_iter().flatten());
        }
        waiting[index] = earlier.len();
        for other in earlier {
            after[other].push(index);
        }
        for name in access.writes {
            writers.entry(name).or_default().push(index);
        }
        for name in access.reads {
            readers.entry(name).or_default().push(index);
        }
        if !movable_items[index] {
            fixed = Some(index);
        }
    }
    (waiting, after)
}

pub fn canonical_order(statements: Vec<Tree>, context: &OrderContext) -> Vec<Tree> {
    let movable_items: Vec<bool> = statements.iter().map(|statement| movable(statement, &context.escaping)).collect();
    if statements.len() < 2 || !movable_items.contains(&true) {
        return statements;
    }
    let (mut waiting, after) = waiting_counts(&statements, &movable_items);
    let keys: Vec<String> = statements.iter().map(|statement| key_of(statement, &context.mode)).collect();
    let mut order: Vec<usize> = (0..statements.len()).collect();
    order.sort_by(|left, right| compare_text(&keys[*left], &keys[*right]).then(left.cmp(right)));
    let mut rank = vec![0; statements.len()];
    for (position, index) in order.into_iter().enumerate() {
        rank[index] = position;
    }
    let mut ready: Vec<usize> = (0..statements.len()).filter(|index| waiting[*index] == 0).collect();
    let mut placed = Vec::with_capacity(statements.len());
    for _ in 0..statements.len() {
        let at = (0..ready.len()).min_by_key(|at| rank[ready[*at]]).expect("near-duplicate order: nothing ready");
        let next = ready.remove(at);
        for later in &after[next] {
            waiting[*later] -= 1;
            if waiting[*later] == 0 {
                ready.push(*later);
            }
        }
        placed.push(statements[next].clone());
    }
    placed
}
