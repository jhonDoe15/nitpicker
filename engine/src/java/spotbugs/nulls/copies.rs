//! Paths holding the very same value, as SpotBugs numbers values: a variable copied from another variable or a
//! field. A test or a dereference of one tells about all of them, and a message names the value after the first
//! local variable that holds it (parameters first), else after the field.
use super::forward::State;
use super::paths::Path;

pub const NONE: u32 = u32::MAX;

fn members(store: &[State], id: u32) -> Vec<usize> {
    (0..store.len()).filter(|path| store[*path].same == id).collect()
}

fn best(members: &[usize], paths: &[Path]) -> u32 {
    members.iter().copied().min_by_key(|path| (paths[*path].field, *path)).map_or(NONE, |path| path as u32)
}

fn regroup(store: &mut [State], paths: &[Path], members: &[usize]) {
    let id = if members.len() < 2 { NONE } else { best(members, paths) };
    for path in members {
        store[*path].same = id;
    }
}

/// The path no longer holds the value it shared with others.
pub fn leave(store: &mut [State], paths: &[Path], path: usize) {
    let id = store[path].same;
    store[path].same = NONE;
    if id != NONE {
        regroup(store, paths, &members(store, id));
    }
}

/// `to` now holds the value `from` holds.
pub fn copy(store: &mut [State], paths: &[Path], to: usize, from: usize) {
    let id = store[from].same;
    let mut joined = if id == NONE { vec![from] } else { members(store, id) };
    joined.push(to);
    regroup(store, paths, &joined);
}

/// Sets what is known of the value a path holds, for every path holding it.
pub fn set(store: &mut [State], path: usize, state: State) {
    let same = store[path].same;
    let targets = if same == NONE { vec![path] } else { members(store, same) };
    for target in targets {
        store[target] = State { same, ..state };
    }
}

/// After ways meet, a group whose standing path left it on one of them is formed anew from those still in it.
pub fn normalize(store: &mut [State], paths: &[Path]) {
    let mut held: std::collections::HashMap<u32, Vec<usize>> = std::collections::HashMap::new();
    for (path, state) in store.iter().enumerate().filter(|(_, state)| state.same != NONE) {
        held.entry(state.same).or_default().push(path);
    }
    for (id, members) in held {
        if store[id as usize].same != id || members.len() < 2 {
            regroup(store, paths, &members);
        }
    }
}

/// The path a message names for the value in `path`.
pub fn named(store: &[State], path: usize) -> usize {
    match store[path].same {
        NONE => path,
        id => id as usize,
    }
}
