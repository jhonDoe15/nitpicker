//! Forward over a body: what is known about the value in each path, and where a value that may be null is
//! dereferenced.
use super::effects::{Effect, How, Unit};
use super::must::{self, Bits};
use super::paths::strip;
use crate::engine::source::{children, parent};
use crate::java::flow::cfg::Exit;
use std::collections::{HashMap, VecDeque};
use tree_sitter::Node;

/// A field not read yet since the method started or since something could have changed it.
pub const ABSENT: u8 = 0;
pub const UNKNOWN: u8 = 1;
pub const NONNULL: u8 = 2;
/// Came from a method result or a field taken as possibly null.
pub const NULLABLE: u8 = 3;
pub const NULL: u8 = 4;
/// Null on one of the ways that meet here.
pub const SOME_PATH: u8 = 5;
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct State {
    pub tag: u8,
    pub origin: u32,
}

const fn plain(tag: u8) -> State {
    State { tag, origin: u32::MAX }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum Kind {
    Returned,
    Field,
    /// A field read straight into a local variable, which the message then names.
    Kept,
    Constant,
    /// A `null` constant that a message calls "null".
    Unnamed,
    Tested,
}

pub struct Origin {
    pub kind: Kind,
    pub name: Option<String>,
}

pub struct Site<'a> {
    pub origin: u32,
    pub tag: u8,
    pub of: Node<'a>,
    pub path: Option<usize>,
    pub at: Node<'a>,
    pub how: How,
}

type Store = Vec<State>;

fn merge(a: State, b: State) -> State {
    if a == b {
        return a;
    }
    let first = |tag: u8| State { tag, origin: [a, b].iter().filter(|side| side.tag == tag).map(|side| side.origin).min().unwrap_or(u32::MAX) };
    let any = |tag: u8| a.tag == tag || b.tag == tag;
    if any(ABSENT) {
        plain(ABSENT)
    } else if any(SOME_PATH) {
        first(SOME_PATH)
    } else if a.tag == NULL && b.tag == NULL {
        first(NULL)
    } else if any(NULL) {
        State { tag: SOME_PATH, origin: first(NULL).origin }
    } else if any(NULLABLE) {
        first(NULLABLE)
    } else {
        plain(UNKNOWN)
    }
}

fn join(target: &mut Option<Store>, from: &Store) -> bool {
    let Some(known) = target else {
        *target = Some(from.clone());
        return true;
    };
    let mut changed = false;
    for (slot, other) in known.iter_mut().zip(from) {
        let merged = merge(*slot, *other);
        changed |= merged != *slot;
        *slot = merged;
    }
    changed
}

/// What crosses into an exception handler: nothing that could be reported there.
fn quiet(store: &Store) -> Store {
    store.iter().map(|state| if matches!(state.tag, NULLABLE | NULL | SOME_PATH) { plain(UNKNOWN) } else { *state }).collect()
}

/// A `switch` statement of the old form without `default`: SpotBugs takes the way past every case as one that
/// does not happen.
fn open_switch(file: &crate::engine::source::SourceFile, last: Option<&Node>) -> bool {
    let Some(switch) = last.and_then(|last| parent(*last)).filter(|above| above.kind() == "switch_expression") else { return false };
    let cases = switch.child_by_field_name("body").map(children).unwrap_or_default();
    let labels = |case: &Node| children(*case).into_iter().filter(|part| part.kind() == "switch_label").any(|label| file.text_of(label).contains("default"));
    !cases.iter().any(|case| case.kind() == "switch_rule") && !cases.iter().any(labels)
}

pub struct Flow<'u, 'c, 'a> {
    unit: &'u Unit<'c, 'a>,
    starts: &'u [Bits],
    ends: &'u [Bits],
    values: HashMap<(usize, usize), State>,
    pub origins: Vec<Origin>,
    keys: HashMap<(usize, Kind), u32>,
    pub sites: Vec<Site<'a>>,
    collecting: bool,
    copy: usize,
}

impl<'u, 'c, 'a> Flow<'u, 'c, 'a> {
    pub fn new(unit: &'u Unit<'c, 'a>, starts: &'u [Bits], ends: &'u [Bits]) -> Self {
        Flow { unit, starts, ends, values: HashMap::new(), origins: Vec::new(), keys: HashMap::new(), sites: Vec::new(), collecting: false, copy: 0 }
    }

    fn origin(&mut self, node: usize, kind: Kind, name: Option<&str>) -> u32 {
        if let Some(known) = self.keys.get(&(node, kind)) {
            return *known;
        }
        self.origins.push(Origin { kind, name: name.map(String::from) });
        self.keys.insert((node, kind), self.origins.len() as u32 - 1);
        self.origins.len() as u32 - 1
    }

    fn value(&self, node: Node) -> State {
        let known = self.values.get(&(node.id(), self.copy)).or_else(|| self.values.get(&(node.id(), 0)));
        known.copied().unwrap_or(plain(UNKNOWN))
    }

    fn read(&mut self, node: Node<'a>, path: usize, store: &mut Store) -> State {
        let info = &self.unit.finder.all[path];
        let mut state = store[path];
        if info.checked && (info.volatile || state.tag == ABSENT) {
            state = State { tag: NULLABLE, origin: self.origin(node.id(), Kind::Field, Some(&info.shown)) };
            if !info.volatile {
                store[path] = state;
            }
        }
        if state.tag == ABSENT { plain(UNKNOWN) } else { state }
    }

    fn own(&mut self, step: Node<'a>, store: &mut Store) -> State {
        match step.kind() {
            "identifier" | "field_access" => match self.unit.reads.get(&step.id()) {
                Some(path) => self.read(step, *path, store),
                None => plain(UNKNOWN),
            },
            "null_literal" => {
                // `null` stored by a statement of its own takes the variable's name in a message; anywhere else it is "null".
                let stored = parent(step).is_some_and(|above| matches!(above.kind(), "variable_declarator" | "assignment_expression"));
                State { tag: NULL, origin: self.origin(step.id(), Kind::Constant, if stored { None } else { Some("null") }) }
            }
            "method_invocation" if self.unit.nullable_calls.contains(&step.id()) => {
                let called = step.child_by_field_name("name").map(|name| self.unit.finder.context.file.text_of(name));
                let origin = self.origin(step.id(), Kind::Returned, called);
                State { tag: NULLABLE, origin }
            }
            "parenthesized_expression" | "cast_expression" => {
                let inner = strip(step);
                if inner == step { plain(UNKNOWN) } else { self.value(inner) }
            }
            "ternary_expression" => {
                let arm = |name: &str| step.child_by_field_name(name).map_or(plain(UNKNOWN), |arm| self.value(arm));
                merge(arm("consequence"), arm("alternative"))
            }
            "assignment_expression" => {
                let plain_store = step.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=");
                step.child_by_field_name("right").filter(|_| plain_store).map_or(plain(UNKNOWN), |right| self.value(right))
            }
            "this" | "object_creation_expression" | "array_creation_expression" | "string_literal" | "lambda_expression" | "class_literal" => plain(NONNULL),
            _ => plain(UNKNOWN),
        }
    }

    fn effect(&mut self, effect: &Effect<'a>, step: Node<'a>, store: &mut Store) {
        let paths = &self.unit.finder.all;
        match effect {
            Effect::Deref { of, path, at, how } => {
                let value = self.value(*of);
                if self.collecting && value.tag >= NULLABLE {
                    self.sites.push(Site { origin: value.origin, tag: value.tag, of: *of, path: *path, at: *at, how: *how });
                }
                if let Some(path) = path {
                    store[*path] = plain(NONNULL);
                }
            }
            Effect::Assign { to, from, sources } => {
                let mut value = from.map_or(plain(UNKNOWN), |from| self.value(from));
                let read = from.is_some_and(|from| matches!(strip(from).kind(), "identifier" | "field_access"));
                let kept = value.tag == NULLABLE && self.origins[value.origin as usize].kind == Kind::Field && !paths[*to].field;
                if let Some(from) = from.filter(|_| kept && read && sources.len() == 1 && paths[sources[0]].field) {
                    value.origin = self.origin(from.id(), Kind::Kept, Some(&paths[*to].shown));
                }
                store[*to] = if paths[*to].volatile { plain(ABSENT) } else { value };
                for dependent in &self.unit.dependents[*to] {
                    store[*dependent] = plain(ABSENT);
                }
            }
            Effect::Invalidate => {
                for path in &self.unit.of_this {
                    if store[*path].tag == ABSENT {
                        continue;
                    }
                    // A field seen before is taken as read again right here, not at its next use.
                    store[*path] = match paths[*path].checked {
                        true => {
                            let origin = self.origin(step.id() ^ (*path << 40), Kind::Field, Some(&paths[*path].shown));
                            State { tag: NULLABLE, origin }
                        }
                        false => plain(ABSENT),
                    };
                }
            }
            Effect::Checked(path) => store[*path] = plain(NONNULL),
            Effect::Asserted => {
                for state in store.iter_mut().filter(|state| matches!(state.tag, NULLABLE | SOME_PATH)) {
                    *state = plain(UNKNOWN);
                }
            }
        }
    }

    /// Runs the steps of a block. Returns everything an exception leaving the block could carry.
    fn steps(&mut self, block: usize, store: &mut Store) -> Store {
        let unit = self.unit;
        self.copy = unit.cfg.blocks[block].copy;
        let mut thrown = store.clone();
        for (position, step) in unit.cfg.blocks[block].steps.iter().enumerate() {
            let mut valued = false;
            for effect in &unit.effects[block][position] {
                // A step that dereferences its own value does so after working that value out.
                if matches!(effect, Effect::Deref { of, .. } if of == step) && !valued {
                    let value = self.own(*step, store);
                    self.values.insert((step.id(), self.copy), value);
                    valued = true;
                }
                self.effect(effect, *step, store);
            }
            if !valued {
                let value = self.own(*step, store);
                self.values.insert((step.id(), self.copy), value);
            }
            for (slot, now) in thrown.iter_mut().zip(store.iter()) {
                *slot = merge(*slot, *now);
            }
        }
        thrown
    }

    /// Past a point where the flow splits, a value that only may be null stays worth reporting only when it is
    /// dereferenced whichever way the flow goes.
    fn fade(&self, block: usize, store: &mut Store) {
        for (path, state) in store.iter_mut().enumerate() {
            if matches!(state.tag, NULLABLE | SOME_PATH) && !must::has(&self.ends[block], path) {
                *state = plain(UNKNOWN);
            }
        }
    }

    /// A `null` that is still certain where a branch of the flow starts, and dereferenced on every way from
    /// there: the message then says "null" instead of naming the variable.
    fn unnamed(&mut self, block: usize, store: &mut Store) {
        for path in 0..store.len() {
            let state = store[path];
            let constant = state.tag == NULL && self.origins[state.origin as usize].kind == Kind::Constant && !self.unit.cfg.blocks[block].steps.is_empty();
            if constant && self.origins[state.origin as usize].name.is_none() && must::has(&self.starts[block], path) {
                store[path].origin = self.origin(state.origin as usize, Kind::Unnamed, Some("null"));
            }
        }
    }

    pub fn run(&mut self) {
        let unit = self.unit;
        let blocks = &unit.cfg.blocks;
        let mut start = vec![plain(ABSENT); unit.finder.all.len()];
        for parameter in &unit.parameters {
            start[*parameter] = plain(UNKNOWN);
        }
        // What each block last sent along each of its ways out. A block starts from all that reaches it, worked
        // out again whenever one of them changes: a value can become less certain as well as more.
        let mut arriving: Vec<Vec<((usize, usize), Store)>> = vec![Vec::new(); blocks.len()];
        let mut split = vec![false; blocks.len()];
        let mut inputs: Vec<Option<Store>> = vec![None; blocks.len()];
        inputs[0] = Some(start.clone());
        let mut pending = VecDeque::from([0]);
        let mut budget = blocks.len() * 40 + 200;
        while let Some(block) = pending.pop_front() {
            let Some(mut store) = inputs[block].clone() else { continue };
            if budget == 0 {
                break;
            }
            budget -= 1;
            let thrown = self.steps(block, &mut store);
            let mut sent: Vec<(usize, Store)> = Vec::new();
            match &blocks[block].exit {
                Exit::End => {}
                Exit::Jump(to) => sent.push((*to, store)),
                Exit::Branch(_, holds, fails) => {
                    self.fade(block, &mut store);
                    let (mut held, mut failed) = (store.clone(), store);
                    if let Some(test) = &unit.tests[block] {
                        let shown = &unit.finder.all[test.path].shown;
                        let null = State { tag: NULL, origin: self.origin(test.node, Kind::Tested, Some(shown)) };
                        match test.null_holds {
                            Some(true) => (held[test.path], failed[test.path]) = (null, plain(NONNULL)),
                            Some(false) => (held[test.path], failed[test.path]) = (plain(NONNULL), null),
                            None => held[test.path] = plain(NONNULL),
                        }
                    }
                    split[*holds] = true;
                    split[*fails] = true;
                    sent.push((*holds, held));
                    sent.push((*fails, failed));
                }
                Exit::Any(all) => {
                    self.fade(block, &mut store);
                    let open = open_switch(unit.finder.context.file, blocks[block].steps.last());
                    for (position, to) in all.iter().enumerate() {
                        split[*to] = true;
                        sent.push((*to, if open && position + 1 == all.len() { quiet(&store) } else { store.clone() }));
                    }
                }
            }
            for handler in blocks[block].catches.iter().flatten() {
                sent.push((handler.block, quiet(&thrown)));
            }
            for (ordinal, (to, store)) in sent.into_iter().enumerate() {
                let key = (block, ordinal);
                match arriving[to].iter_mut().find(|(from, _)| *from == key) {
                    Some((_, known)) if *known == store => continue,
                    Some((_, known)) => *known = store,
                    None => arriving[to].push((key, store)),
                }
                let mut input = (to == 0).then(|| start.clone());
                for (_, store) in &arriving[to] {
                    join(&mut input, store);
                }
                if let Some(input) = input.as_mut().filter(|_| split[to] && arriving[to].len() == 1) {
                    self.unnamed(to, input);
                }
                if input != inputs[to] {
                    inputs[to] = input;
                    if !pending.contains(&to) {
                        pending.push_back(to);
                    }
                }
            }
        }
        self.collecting = true;
        for block in 0..blocks.len() {
            if let Some(mut store) = inputs[block].clone() {
                self.steps(block, &mut store);
            }
        }
    }
}
