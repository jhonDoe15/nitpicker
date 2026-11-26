//! `typedCallEffects`: the effects of a call, following the project's functions it calls up to three calls
//! deep. A function's summary at budget `b` is what its own calls do plus, for calls of other functions, what
//! all of those functions have in common at budget `b - 1`, each path prefixed with the call's label.
use super::callees::calls::{Resolved, resolve_call};
use super::callees::declarations::{callee_declaration, function_like};
use super::callees::implementations::{Index, index};
use super::callees::test_sources::TestSources;
use super::flow::{is_class_like, is_function_like, runs_with_caller};
use super::tags::Effects;
use super::views::At;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind as k;
use std::collections::HashMap;
use std::rc::Rc;

const MAX_HOPS: usize = 3;

#[derive(Default)]
pub struct State {
    index: Option<Rc<Index>>,
    tests: Option<Rc<TestSources>>,
    descriptors: HashMap<String, Rc<Vec<Resolved>>>,
    summaries: HashMap<(String, usize), Rc<Effects>>,
    calls: HashMap<String, Rc<Effects>>,
}

fn descends(node: &At) -> bool {
    if is_class_like(node.kind()) {
        return false;
    }
    !is_function_like(node.kind()) || runs_with_caller(node)
}

/// `callsIn`: the calls of a body in breadth-first order, nested functions that run later left out.
fn calls_in(root: &At) -> Vec<At> {
    let mut pending = vec![root.clone()];
    let mut at = 0;
    while at < pending.len() {
        let node = pending[at].clone();
        at += 1;
        pending.extend(node.children().into_iter().filter(descends));
    }
    pending.into_iter().filter(|node| matches!(node.kind(), k::CALL_EXPRESSION | k::TAGGED_TEMPLATE_EXPRESSION)).collect()
}

/// The implementation index, and whether it was built without a refusal (an earlier refusal of the file is
/// kept as the file's reason).
fn clean_index(types: &mut Types, tests: &TestSources) -> (Rc<Index>, bool) {
    let earlier = types.refused.take();
    let built = Rc::new(index(types, tests));
    let clean = types.refused.is_none();
    if earlier.is_some() {
        types.refused = earlier;
    }
    (built, clean)
}

fn prefixed(label: &str, effects: &Effects) -> Effects {
    effects.iter().map(|(tag, path)| (*tag, std::iter::once(label.to_string()).chain(path.iter().cloned()).collect())).collect()
}

impl State {
    pub fn with_tests(&mut self, path: Option<&str>) -> Option<Rc<TestSources>> {
        if self.tests.is_none() {
            self.tests = Some(Rc::new(path.and_then(TestSources::read).unwrap_or_default()));
        }
        self.tests.clone()
    }

    /// What stays for the next file when a question of this one was refused: the index (when it was built
    /// without a refusal) and the test sources; the summaries may rest on the refused answer.
    pub fn after_refusal(self) -> State {
        State { index: self.index, tests: self.tests, ..State::default() }
    }

    fn resolve(&mut self, types: &mut Types, call: &At) -> Option<Resolved> {
        let mut built = self.index.clone().map(|index| (index, true));
        let tests = self.tests.clone().unwrap_or_default();
        let found = resolve_call(types, &mut |types| Rc::clone(&built.get_or_insert_with(|| clean_index(types, &tests)).0), call);
        if let Some((index, true)) = built.filter(|_| self.index.is_none()) {
            self.index = Some(index);
        }
        found
    }

    fn descriptors(&mut self, types: &mut Types, function: &str) -> Rc<Vec<Resolved>> {
        if let Some(known) = self.descriptors.get(function) {
            return Rc::clone(known);
        }
        let body = At::of(types, function).and_then(|function| function.child("body"));
        let found: Vec<Resolved> = body.map(|body| calls_in(&body)).unwrap_or_default().iter().filter_map(|call| self.resolve(types, call)).collect();
        let found = Rc::new(found);
        self.descriptors.insert(function.to_string(), Rc::clone(&found));
        found
    }

    /// `combined`: a call's own effects, or what every function it may run has in common.
    fn combined(&mut self, types: &mut Types, descriptor: &Resolved, budget: Option<usize>) -> Effects {
        if let Some(effects) = &descriptor.effects {
            return effects.clone();
        }
        let targets = descriptor.targets.clone().unwrap_or_default();
        let summaries: Vec<Rc<Effects>> = targets.iter().map(|target| budget.map_or_else(|| Rc::new(Vec::new()), |budget| self.summary(types, target, budget))).collect();
        let Some((first, others)) = summaries.split_first() else { return Vec::new() };
        let common: Effects = first.iter().filter(|(tag, _)| others.iter().all(|other| other.iter().any(|(each, _)| each == tag))).cloned().collect();
        prefixed(&descriptor.view.label, &common)
    }

    fn summary(&mut self, types: &mut Types, function: &str, budget: usize) -> Rc<Effects> {
        let key = (function.to_string(), budget);
        if let Some(known) = self.summaries.get(&key) {
            return Rc::clone(known);
        }
        let mut effects: Effects = if budget == 0 { Vec::new() } else { self.summary(types, function, budget - 1).as_ref().clone() };
        let descriptors = self.descriptors(types, function);
        for descriptor in descriptors.iter().filter(|descriptor| !descriptor.guessed && (budget > 0 || descriptor.targets.is_none())) {
            for (tag, path) in self.combined(types, descriptor, budget.checked_sub(1)) {
                if !effects.iter().any(|(each, _)| *each == tag) {
                    effects.push((tag, path));
                }
            }
        }
        let effects = Rc::new(effects);
        self.summaries.insert(key, Rc::clone(&effects));
        effects
    }

    /// The effects of a call of the compiler's tree, kept for the run.
    pub fn call_effects(&mut self, types: &mut Types, call: &At) -> Rc<Effects> {
        let key = call.handle();
        if let Some(known) = self.calls.get(&key) {
            return Rc::clone(known);
        }
        let found = match self.resolve(types, call) {
            Some(descriptor) => self.combined(types, &descriptor, Some(MAX_HOPS)),
            None => Vec::new(),
        };
        let found = Rc::new(found);
        self.calls.insert(key, Rc::clone(&found));
        found
    }

    /// `typedReferenceEffects`: what calling the function a reference names does, each path starting with
    /// `<text>()`; nothing when the reference names no function with a body.
    pub fn reference_effects(&mut self, types: &mut Types, node: &At, text: &str) -> Effects {
        let Some(function) = callee_declaration(types, node).and_then(|declaration| function_like(&declaration)) else { return Vec::new() };
        let summary = self.summary(types, &function.handle(), MAX_HOPS);
        prefixed(&format!("{text}()"), &summary)
    }
}
