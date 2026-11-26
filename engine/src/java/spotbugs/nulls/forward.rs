//! Forward over a body: what is known about the value in each path, and where a value that may be null is
//! dereferenced.
use super::copies;
use super::effects::{Check, Effect, How, Unit};
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
    /// The path that stands for all paths holding the very same value (a variable copied from another one), or
    /// `copies::NONE`.
    pub same: u32,
}

impl State {
    pub const fn of(tag: u8, origin: u32) -> State {
        State { tag, origin, same: copies::NONE }
    }
}

const fn plain(tag: u8) -> State {
    State::of(tag, u32::MAX)
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
    /// Null where a comparison with `null` says so.
    Tested,
    /// Null where `Objects.isNull` or `Objects.nonNull` says so.
    TestedByCall,
    /// Not null since it was dereferenced (or handed to `Objects.requireNonNull`).
    Dereferenced,
    /// Not null since a test says so.
    Proved,
    /// Not null since it was created here: `new`, a string, `this`.
    Created,
    /// Not null past an `assert` that compares it with `null` without requiring it: no redundant test is
    /// reported for it.
    Asserted,
    /// Null from a comparison, carried into an exception handler: read there, but its dereferences are not
    /// reported as the patterns here report them.
    TestedHandled,
}

pub struct Origin {
    pub kind: Kind,
    pub name: Option<String>,
    /// The origin whose value this one is: a created value a test then proves keeps the created one.
    pub value: u32,
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
    let same = if a.same == b.same { a.same } else { copies::NONE };
    State { same, ..merge_values(a, b) }
}

fn merge_values(a: State, b: State) -> State {
    let first = |tag: u8| State::of(tag, [a, b].iter().filter(|side| side.tag == tag).map(|side| side.origin).min().unwrap_or(u32::MAX));
    let any = |tag: u8| a.tag == tag || b.tag == tag;
    if any(ABSENT) {
        plain(ABSENT)
    } else if any(SOME_PATH) {
        first(SOME_PATH)
    } else if a.tag == NULL && b.tag == NULL {
        first(NULL)
    } else if a.tag == NONNULL && b.tag == NONNULL {
        first(NONNULL)
    } else if any(NULL) {
        State::of(SOME_PATH, first(NULL).origin)
    } else if any(NULLABLE) {
        first(NULLABLE)
    } else {
        plain(UNKNOWN)
    }
}

fn store_tag(store: &Store, path: usize) -> u8 {
    store[path].tag
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
    store.iter().map(|state| if matches!(state.tag, NULLABLE | NULL | SOME_PATH) { State { same: state.same, ..plain(UNKNOWN) } } else { *state }).collect()
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
    /// Reads of a local variable known to be null from a comparison, with the origin of that null.
    pub loads: Vec<(usize, Node<'a>)>,
    /// Per read node: how often the pass read it, and how often it was known null then (a `finally` body is
    /// read once per way out).
    pub read_counts: HashMap<usize, (u32, u32)>,
    /// Tests of a local variable with what was known of it there: block, test node, state.
    pub checks: Vec<(usize, Node<'a>, State)>,
    /// Where each `Dereferenced` origin was dereferenced.
    pub dereferenced: HashMap<u32, Node<'a>>,
    /// Blocks reached that end in a branch with no test of a variable or field (calls compared with `null` among them).
    pub call_checks: Vec<(usize, Node<'a>)>,
    collecting: bool,
    copy: usize,
}

impl<'u, 'c, 'a> Flow<'u, 'c, 'a> {
    pub fn new(unit: &'u Unit<'c, 'a>, starts: &'u [Bits], ends: &'u [Bits]) -> Self {
        let (loads, checks, dereferenced, read_counts) = (Vec::new(), Vec::new(), HashMap::new(), HashMap::new());
        let values = HashMap::new();
        Flow { unit, starts, ends, values, origins: Vec::new(), keys: HashMap::new(), sites: Vec::new(), loads, read_counts, checks, dereferenced, call_checks: Vec::new(), collecting: false, copy: 0 }
    }

    fn origin(&mut self, node: usize, kind: Kind, name: Option<&str>) -> u32 {
        if let Some(known) = self.keys.get(&(node, kind)) {
            return *known;
        }
        let value = self.origins.len() as u32;
        self.origins.push(Origin { kind, name: name.map(String::from), value });
        self.keys.insert((node, kind), self.origins.len() as u32 - 1);
        self.origins.len() as u32 - 1
    }

    /// Whether every `return` of the body hands back a value known not to be null.
    pub fn never_null(&self, body: Node) -> bool {
        let mut returned = Vec::new();
        let mut pending = vec![body];
        while let Some(node) = pending.pop() {
            for part in children(node) {
                match part.kind() {
                    "lambda_expression" | "class_body" => {}
                    "return_statement" => returned.push(part),
                    _ => pending.push(part),
                }
            }
        }
        !returned.is_empty()
            && returned.into_iter().all(|statement| {
                let value = children(statement).into_iter().find(|part| part.is_named() && !part.kind().ends_with("comment"));
                value.is_some_and(|value| self.value(value).tag == NONNULL)
            })
    }

    fn value(&self, node: Node) -> State {
        let known = self.values.get(&(node.id(), self.copy)).or_else(|| self.values.get(&(node.id(), 0)));
        known.copied().unwrap_or(plain(UNKNOWN))
    }

    fn read(&mut self, node: Node<'a>, path: usize, store: &mut Store) -> State {
        let info = &self.unit.finder.all[path];
        let mut state = store[path];
        if info.checked && (info.volatile || state.tag == ABSENT) {
            state = State::of(NULLABLE, self.origin(node.id(), Kind::Field, Some(&info.shown)));
            if !info.volatile {
                copies::leave(store, &self.unit.finder.all, path);
                store[path] = state;
            }
        }
        if state.tag == ABSENT { plain(UNKNOWN) } else { state }
    }

    fn own(&mut self, step: Node<'a>, store: &mut Store) -> State {
        match step.kind() {
            "identifier" | "field_access" => match self.unit.reads.get(&step.id()) {
                Some(path) => {
                    let state = self.read(step, *path, store);
                    self.note_load(*path, step, state);
                    state
                }
                None => plain(UNKNOWN),
            },
            "null_literal" => {
                // `null` stored by a statement of its own takes the variable's name in a message; anywhere else it is "null".
                let stored = parent(step).is_some_and(|above| matches!(above.kind(), "variable_declarator" | "assignment_expression"));
                State::of(NULL, self.origin(step.id(), Kind::Constant, if stored { None } else { Some("null") }))
            }
            "method_invocation" if self.unit.nonnull_calls.contains_key(&step.id()) => self.created(step),
            "method_invocation" if self.unit.nullable_calls.contains(&step.id()) => {
                let called = step.child_by_field_name("name").map(|name| self.unit.finder.context.file.text_of(name));
                let origin = self.origin(step.id(), Kind::Returned, called);
                State::of(NULLABLE, origin)
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
            "lambda_expression" => {
                self.captures(step, store);
                self.created(step)
            }
            "this" | "object_creation_expression" | "array_creation_expression" | "string_literal" | "class_literal" => self.created(step),
            _ => plain(UNKNOWN),
        }
    }

    fn effect(&mut self, effect: &Effect<'a>, step: Node<'a>, store: &mut Store) {
        let paths = &self.unit.finder.all;
        match effect {
            Effect::Deref { of, path, at, how } => {
                let value = self.value(*of);
                let handled = value.tag == NULL && self.origins.get(value.origin as usize).is_some_and(|origin| origin.kind == Kind::TestedHandled);
                if self.collecting && value.tag >= NULLABLE && !handled {
                    self.sites.push(Site { origin: value.origin, tag: value.tag, of: *of, path: *path, at: *at, how: *how });
                }
                if let Some(path) = path {
                    self.dereferences(*path, *at, store);
                }
            }
            Effect::Assign { to, from, sources } => {
                let mut value = from.map_or(plain(UNKNOWN), |from| self.value(from));
                let read = from.is_some_and(|from| matches!(strip(from).kind(), "identifier" | "field_access"));
                let kept = value.tag == NULLABLE && self.origins[value.origin as usize].kind == Kind::Field && !paths[*to].field;
                if let Some(from) = from.filter(|_| kept && read && sources.len() == 1 && paths[sources[0]].field) {
                    value.origin = self.origin(from.id(), Kind::Kept, Some(&paths[*to].shown));
                }
                copies::leave(store, paths, *to);
                store[*to] = State { same: copies::NONE, ..if paths[*to].volatile { plain(ABSENT) } else { value } };
                let copied = from.filter(|_| read && sources.len() == 1 && !paths[*to].volatile && !paths[sources[0]].volatile);
                if copied.is_some() && sources[0] != *to {
                    if store[sources[0]].tag == ABSENT {
                        store[sources[0]] = State { same: store[sources[0]].same, ..plain(UNKNOWN) };
                    }
                    copies::copy(store, paths, *to, sources[0]);
                }
                for dependent in &self.unit.dependents[*to] {
                    copies::leave(store, paths, *dependent);
                    store[*dependent] = plain(ABSENT);
                }
            }
            Effect::Invalidate => {
                for path in &self.unit.of_this {
                    if store[*path].tag == ABSENT {
                        continue;
                    }
                    // A field seen before is taken as read again right here, not at its next use.
                    copies::leave(store, paths, *path);
                    store[*path] = match paths[*path].checked {
                        true => {
                            let origin = self.origin(step.id() ^ (*path << 40), Kind::Field, Some(&paths[*path].shown));
                            State::of(NULLABLE, origin)
                        }
                        false => plain(ABSENT),
                    };
                }
            }
            Effect::Checked(path, Check::Required) => self.dereferences(*path, step, store),
            Effect::Checked(path, check) => {
                if store[*path].tag != NONNULL {
                    let kind = if *check == Check::Implied { Kind::Proved } else { Kind::Asserted };
                    let state = State::of(NONNULL, self.origin(step.id(), kind, None));
                    copies::set(store, *path, state);
                }
            }
            Effect::Asserted => {
                for state in store.iter_mut().filter(|state| matches!(state.tag, NULLABLE | SOME_PATH)) {
                    *state = plain(UNKNOWN);
                }
            }
        }
    }

    /// What crosses into an exception handler: nothing that could be reported there, but a null known from a
    /// comparison is still known.
    fn handled(&mut self, store: &Store) -> Store {
        let mut out = quiet(store);
        for (slot, state) in out.iter_mut().zip(store) {
            let origin = self.origins.get(state.origin as usize).filter(|_| state.tag == NULL);
            let Some(origin) = origin.filter(|origin| matches!(origin.kind, Kind::Tested | Kind::TestedHandled)) else { continue };
            let name = origin.name.clone();
            *slot = State::of(NULL, self.origin(state.origin as usize | 1 << 50, Kind::TestedHandled, name.as_deref()));
        }
        out
    }

    fn created(&mut self, step: Node<'a>) -> State {
        State::of(NONNULL, self.origin(step.id(), Kind::Created, None))
    }

    /// A value becomes known not to be null where it is dereferenced, unless it already was.
    fn dereferences(&mut self, path: usize, at: Node<'a>, store: &mut Store) {
        if store[path].tag == NONNULL {
            return;
        }
        let origin = self.origin(at.id(), Kind::Dereferenced, None);
        self.dereferenced.insert(origin, at);
        copies::set(store, path, State::of(NONNULL, origin));
    }

    fn note_load(&mut self, path: usize, at: Node<'a>, state: State) {
        let tested = state.tag == NULL && self.origins.get(state.origin as usize).is_some_and(|origin| matches!(origin.kind, Kind::Tested | Kind::TestedHandled));
        if !self.collecting || self.unit.finder.all[path].field {
            return;
        }
        let counted = self.read_counts.entry(at.id()).or_default();
        counted.0 += 1;
        if tested {
            counted.1 += 1;
            self.loads.push((state.origin as usize, at));
        }
    }

    /// The local variables a lambda captures are read where the lambda is made.
    fn captures(&mut self, lambda: Node<'a>, store: &mut Store) {
        let Some(body) = lambda.child_by_field_name("body") else { return };
        let mut found = Vec::new();
        crate::engine::source::walk(body, |node| {
            let named = node.kind() == "identifier" && parent(node).is_none_or(|above| above.kind() != "field_access" || above.child_by_field_name("field") != Some(node));
            if named {
                found.push(node);
            }
        });
        for node in found {
            let name = self.unit.finder.context.file.text_of(node);
            if let Some(path) = self.unit.finder.all.iter().position(|path| !path.field && path.key == name) {
                let state = store[path];
                self.note_load(path, node, state);
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
                *state = State { same: state.same, ..plain(UNKNOWN) };
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
            copies::normalize(&mut store, &unit.finder.all);
            if budget == 0 {
                // Not settled: better nothing than findings from a half-worked state.
                return;
            }
            budget -= 1;
            let thrown = self.steps(block, &mut store);
            let mut sent: Vec<(usize, Store, bool)> = Vec::new();
            match &blocks[block].exit {
                Exit::End => {}
                Exit::Jump(to) => sent.push((*to, store, true)),
                Exit::Branch(_, holds, fails) => {
                    self.fade(block, &mut store);
                    let known = unit.tests[block].as_ref().filter(|test| store[test.path].tag == NONNULL).and_then(|test| test.null_holds);
                    let (mut held, mut failed) = (store.clone(), store);
                    if let Some(test) = &unit.tests[block] {
                        let named = &unit.finder.all[copies::named(&held, test.path)];
                        let (shown, full) = (&named.shown, &named.full);
                        let kind = if test.compared { Kind::Tested } else { Kind::TestedByCall };
                        let null = State::of(NULL, self.origin(test.node, kind, Some(shown)));
                        let before = store_tag(&held, test.path);
                        let created = self.origins.get(held[test.path].origin as usize).filter(|origin| origin.kind == Kind::Created).map(|origin| origin.value);
                        let proved = match before {
                            NONNULL if created.is_none() => held[test.path],
                            _ => State::of(NONNULL, self.origin(test.node, Kind::Proved, Some(full))),
                        };
                        if let (NONNULL, Some(value)) = (before, created) {
                            self.origins[proved.origin as usize].value = value;
                        }
                        let (on_hold, on_fail) = match test.null_holds {
                            Some(true) => (null, proved),
                            Some(false) => (proved, null),
                            None => (proved, failed[test.path]),
                        };
                        copies::set(&mut held, test.path, on_hold);
                        copies::set(&mut failed, test.path, on_fail);
                    }
                    split[*holds] = true;
                    split[*fails] = true;
                    sent.push((*holds, held, known != Some(true)));
                    sent.push((*fails, failed, known != Some(false)));
                }
                Exit::Any(all) => {
                    self.fade(block, &mut store);
                    let open = open_switch(unit.finder.context.file, blocks[block].steps.last());
                    for (position, to) in all.iter().enumerate() {
                        split[*to] = true;
                        sent.push((*to, if open && position + 1 == all.len() { quiet(&store) } else { store.clone() }, true));
                    }
                }
            }
            let handled = self.handled(&thrown);
            for handler in blocks[block].catches.iter().flatten() {
                sent.push((handler.block, handled.clone(), true));
            }
            for (ordinal, (to, store, taken)) in sent.into_iter().enumerate() {
                let key = (block, ordinal);
                let at = arriving[to].iter().position(|(from, _)| *from == key);
                match at {
                    None if !taken => continue,
                    Some(at) if !taken => drop(arriving[to].remove(at)),
                    Some(at) if arriving[to][at].1 == store => continue,
                    Some(at) => arriving[to][at].1 = store,
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
                match (&blocks[block].exit, &unit.tests[block]) {
                    (Exit::Branch(node, ..), Some(test)) if test.compared => self.checks.push((block, *node, store[test.path])),
                    (Exit::Branch(node, ..), None) => self.call_checks.push((block, *node)),
                    _ => {}
                }
            }
        }
    }
}
