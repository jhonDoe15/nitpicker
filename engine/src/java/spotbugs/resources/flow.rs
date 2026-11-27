//! Follows resources from the step that opens them to every way out of a body, over the flow graph with the
//! exception edges SpotBugs gives the compiled code. Each open step is a site; a site is held from its step until
//! a close of the same object. Every path is either normal or has taken an exception edge, so a site held where the
//! body ends tells whether a path without exceptions leaks it.
use super::super::Context;
use super::super::dead::flow::throws::{Thrown, handled, throws};
use crate::java::flow::cfg::{Cfg, Exit, unwrap};
use crate::java::types::expr::Binding;
use crate::java::types::model::flag;
use std::collections::BTreeMap;
use tree_sitter::Node;

/// What a step does to the resources: opens a site on an object, or closes every site of an object.
pub enum Event {
    Open(String),
    Close(String),
}

/// How one kind of resource reads the steps of a body.
pub trait Resource {
    fn event(&self, context: &Context, step: Node, keys: &Keys) -> Option<Event>;
    fn throws(&self, context: &Context, step: Node) -> Option<Thrown> {
        throws(context, step)
    }
}

/// Which object each local variable holds, by how the code names it.
#[derive(Clone, PartialEq, Default)]
pub struct Keys(BTreeMap<String, String>);

impl Keys {
    /// The object a value is: a field by its name, a call result, an array element, or the step that made it.
    pub fn of(&self, context: &Context, node: Node) -> String {
        let node = unwrap(node);
        match node.kind() {
            "cast_expression" => node.child_by_field_name("value").map_or_else(String::new, |value| self.of(context, value)),
            "identifier" => match context.resolver.binding(node, context.text(node)) {
                Some(Binding::Local(_)) => self.0.get(context.text(node)).cloned().unwrap_or_else(|| format!("local:{}", context.text(node))),
                Some(Binding::Field(_, declaring, field)) if field.flags & flag::STATIC == 0 && outer(context, node, &declaring.name) => {
                    format!("outer.{}", field.name)
                }
                _ => self.field(context, node),
            },
            "field_access" if node.child_by_field_name("field").is_some_and(|field| field.kind() == "this") => "outer".to_string(),
            "field_access" => {
                let object = node.child_by_field_name("object").map(unwrap);
                match object {
                    Some(object) if !matches!(object.kind(), "this" | "super") && context.resolver.receiver(object).is_some_and(|holder| matches!(holder, crate::java::types::expr::Receiver::Value(_))) => {
                        let name = node.child_by_field_name("field").map(|field| context.text(field)).unwrap_or_default();
                        format!("{}.{name}", self.of(context, object))
                    }
                    _ => self.field(context, node),
                }
            }
            "method_invocation" => "call".to_string(),
            "array_access" => "array".to_string(),
            "this" => "this".to_string(),
            _ => format!("value@{}", node.id()),
        }
    }
    /// Whether the code reads the field through the instance of a class around its own (javac's `this$0`).
    pub fn is_outer(key: &str) -> bool {
        key == "outer" || key.starts_with("outer.")
    }
    fn field(&self, context: &Context, node: Node) -> String {
        match super::super::fields::field_key(context, node) {
            Some((class, name)) => format!("field:{class}.{name}"),
            None => format!("value@{}", node.id()),
        }
    }
    fn note(&mut self, context: &Context, step: Node) {
        let (name, value) = match step.kind() {
            "variable_declarator" => (step.child_by_field_name("name"), step.child_by_field_name("value")),
            "assignment_expression" if step.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") => {
                let left = step.child_by_field_name("left").map(unwrap).filter(|left| left.kind() == "identifier");
                let local = left.filter(|left| matches!(context.resolver.binding(*left, context.text(*left)), Some(Binding::Local(_))));
                (local, step.child_by_field_name("right"))
            }
            _ => return,
        };
        if let (Some(name), Some(value)) = (name, value) {
            let key = self.of(context, value);
            self.0.insert(context.text(name).to_string(), key);
        }
    }
    fn merge(&mut self, other: &Keys) {
        for (name, key) in &other.0 {
            match self.0.get(name) {
                Some(mine) if mine != key => {
                    self.0.insert(name.clone(), format!("merged:{name}"));
                }
                None => {
                    self.0.insert(name.clone(), key.clone());
                }
                _ => {}
            }
        }
    }
}

/// Whether a field of `declaring` named without an object is one of an instance around the innermost class.
fn outer(context: &Context, node: Node, declaring: &str) -> bool {
    let around = crate::java::types::scope::enclosing_types(context.resolver.scope, node);
    let Some(inner) = around.first() else { return false };
    inner != declaring && !context.resolver.index.is_subtype(inner, declaring)
}

/// Per path kind (without an exception edge, with one): whether such a path gets here, and which sites it holds.
#[derive(Clone, PartialEq)]
struct State {
    reach: [bool; 2],
    held: Vec<[bool; 2]>,
    keys: Keys,
}

impl State {
    fn merge(&mut self, other: &State) {
        for kind in 0..2 {
            self.reach[kind] |= other.reach[kind];
        }
        for (mine, theirs) in self.held.iter_mut().zip(&other.held) {
            mine[0] |= theirs[0];
            mine[1] |= theirs[1];
        }
        self.keys.merge(&other.keys);
    }
    /// The state an exception edge carries: every path through it has taken one.
    fn thrown(&self) -> State {
        let mut out = self.clone();
        out.reach = [false, self.reach[0] || self.reach[1]];
        for held in &mut out.held {
            *held = [false, held[0] || held[1]];
        }
        out
    }
}

/// How each site leaves the body: held where a path without exceptions ends, or only where others end.
pub struct Leaks<'t> {
    pub sites: Vec<Node<'t>>,
    pub normal: Vec<bool>,
    pub exceptional: Vec<bool>,
    /// Whether the body closes anything.
    pub closes: bool,
}

pub fn leaks<'t>(context: &Context, graph: &Cfg<'t>, resource: &dyn Resource) -> Leaks<'t> {
    let mut sites = Vec::new();
    let mut site_of = BTreeMap::new();
    for step in graph.blocks.iter().flat_map(|block| &block.steps) {
        if let Some(Event::Open(_)) = resource.event(context, *step, &Keys::default()) {
            site_of.entry(step.id()).or_insert_with(|| {
                sites.push(*step);
                sites.len() - 1
            });
        }
    }
    let count = sites.len();
    let mut leaks = Leaks { sites, normal: vec![false; count], exceptional: vec![false; count], closes: false };
    if count == 0 {
        return leaks;
    }
    let empty = State { reach: [false; 2], held: vec![[false; 2]; count], keys: Keys::default() };
    let mut entry: Vec<Option<State>> = vec![None; graph.blocks.len()];
    entry[0] = Some(State { reach: [true, false], ..empty.clone() });
    let mut opened: Vec<String> = vec![String::new(); count];
    let normal_ends: Vec<usize> = graph.returns.iter().copied().chain([graph.end]).collect();
    let mut work: Vec<usize> = vec![0];
    let mut exits: Vec<(State, bool)> = Vec::new();
    while let Some(block) = work.pop() {
        let Some(mut state) = entry[block].clone() else { continue };
        let mut next: Vec<(usize, State)> = Vec::new();
        let here = &graph.blocks[block];
        for step in &here.steps {
            let event = resource.event(context, *step, &state.keys);
            let before = state.clone();
            match &event {
                Some(Event::Open(key)) => {
                    let site = site_of[&step.id()];
                    opened[site] = key.clone();
                    state.held[site] = state.reach;
                }
                Some(Event::Close(key)) => {
                    leaks.closes = true;
                    for (site, held) in state.held.iter_mut().enumerate() {
                        if opened[site] == *key {
                            *held = [false, false];
                        }
                    }
                }
                None => {}
            }
            state.keys.note(context, *step);
            let thrown = resource.throws(context, *step);
            if let Some(thrown) = thrown {
                let (handlers, caught) = handled(context, here, &thrown);
                let out = before.thrown();
                next.extend(handlers.into_iter().map(|to| (to, out.clone())));
                if !caught {
                    exits.push((out, false));
                }
            }
        }
        match &here.exit {
            Exit::End if normal_ends.contains(&block) => exits.push((state.clone(), true)),
            Exit::End => {
                let thrown_here = here.steps.last().is_some_and(|step| step.kind() == "throw_statement");
                if !thrown_here {
                    let (handlers, caught) = handled(context, here, &Thrown::Throw(None));
                    let out = state.thrown();
                    next.extend(handlers.into_iter().map(|to| (to, out.clone())));
                    if !caught {
                        exits.push((out, false));
                    }
                }
            }
            Exit::Jump(to) => next.push((*to, state.clone())),
            Exit::Branch(_, holds, fails) => next.extend([(*holds, state.clone()), (*fails, state.clone())]),
            Exit::Any(all) => next.extend(all.iter().map(|to| (*to, state.clone()))),
        }
        for (to, value) in next {
            let merged = match &entry[to] {
                Some(old) => {
                    let mut merged = old.clone();
                    merged.merge(&value);
                    merged
                }
                None => value,
            };
            if entry[to].as_ref() != Some(&merged) {
                entry[to] = Some(merged);
                work.push(to);
            }
        }
    }
    for (state, normal) in exits {
        for (site, held) in state.held.iter().enumerate() {
            if normal && held[0] {
                leaks.normal[site] = true;
            }
            if held[1] || !normal && held[0] {
                leaks.exceptional[site] = true;
            }
        }
    }
    leaks
}
