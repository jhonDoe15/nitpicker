//! The statements of one method in the order javac writes their code, keeping a `State` of the local variables
//! along each path (paths that meet are merged). Measured: what makes a value read from a field out of date does
//! so for all code after it in that order, on any path: a call (also `new`, and one on a path that returns), a
//! store into the field, the head of a loop that javac writes a jump back to (even one without calls).
mod branches;
mod convert;
mod exprs;
pub mod reach;
pub mod values;

use super::super::Context;
use crate::engine::source::{named_children, walk};
use values::{Key, Numbers, State, Val, merge, merge_all};
use std::collections::HashMap;
use tree_sitter::Node;

/// A store into a field of the object in a local variable (or `this`) of the value just read from that field.
pub struct Store<'a> {
    pub at: Node<'a>,
    pub field: Key,
    /// The class the store names the field by.
    pub qualifying: String,
    /// The local variable the object comes from, `None` for `this`.
    pub register: Option<Node<'a>>,
    /// The object around, from the hidden parameter of a constructor.
    pub outer: bool,
    /// `o.f = o.f++`.
    pub postfix: bool,
}

struct Target {
    label: Option<String>,
    breakable: bool,
    states: Vec<Option<State>>,
    /// For a loop: its label, and the states of the `continue`s that go back to it.
    looping: Option<Option<String>>,
    continues: Vec<Option<State>>,
}

pub struct Walk<'c, 'a> {
    pub context: &'c Context<'a>,
    pub own: String,
    pub numbers: Numbers,
    pub found: Vec<Store<'a>>,
    targets: Vec<Target>,
    calls: u32,
    fields: HashMap<Key, u32>,
    /// The value of each variable before the method stores into it (a parameter), the same on every path.
    first: HashMap<String, Val>,
    /// The class around, while walking the body of a constructor of an inner class.
    pub outer: Option<String>,
}

impl<'c, 'a> Walk<'c, 'a> {
    pub fn new(context: &'c Context<'a>, own: &str) -> Self {
        Walk { context, own: own.to_string(), numbers: Numbers::default(), found: Vec::new(), targets: Vec::new(), calls: 0, fields: HashMap::new(), first: HashMap::new(), outer: None }
    }

    pub fn epoch(&self, field: &Key) -> (u32, u32) {
        (self.calls, self.fields.get(field).copied().unwrap_or(0))
    }

    /// A call: no value read from a field before is known to be what the field holds.
    pub fn called(&mut self) {
        self.calls = self.numbers.next();
    }

    pub fn stored(&mut self, field: &Key) {
        let next = self.numbers.next();
        self.fields.insert(field.clone(), next);
    }

    /// The value a variable holds where it is first used without a store before.
    pub fn first(&mut self, name: &str) -> Val {
        let numbers = &self.numbers;
        self.first.entry(name.to_string()).or_insert_with(|| numbers.fresh()).clone()
    }

    pub fn statements(&mut self, nodes: &[Node<'a>], state: Option<State>) -> Option<State> {
        nodes.iter().fold(state, |state, node| self.statement(*node, state))
    }

    pub fn statement(&mut self, node: Node<'a>, state: Option<State>) -> Option<State> {
        let mut state = state?;
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => self.statements(&named_children(node), Some(state)),
            "field_declaration" => {
                for declarator in crate::java::helpers::declarators(node) {
                    let Some(value) = declarator.child_by_field_name("value") else { continue };
                    self.expression(value, &mut state);
                    let declared = node.child_by_field_name("type").and_then(|kind| self.context.resolver.type_node(kind));
                    self.convert(value, &declared);
                    let name = declarator.child_by_field_name("name").map(|name| self.context.text(name).to_string()).unwrap_or_default();
                    self.stored(&(self.own.clone(), name));
                }
                Some(state)
            }
            "expression_statement" | "local_variable_declaration" | "explicit_constructor_invocation" => {
                self.expression(node, &mut state);
                Some(state)
            }
            "if_statement" => {
                self.condition(field("condition"), &mut state);
                let then = field("consequence").and_then(|part| self.statement(part, Some(state.clone())));
                let otherwise = match field("alternative") {
                    Some(part) => self.statement(part, Some(state)),
                    None => Some(state),
                };
                merge(then, otherwise, &self.numbers)
            }
            "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement" => self.looped(node, state),
            "labeled_statement" => {
                let label = named_children(node).into_iter().find(|part| part.kind() == "identifier").map(|part| self.context.text(part).to_string());
                let body = named_children(node).into_iter().rfind(|part| part.kind() != "identifier");
                self.targeted(label, false, |walk| body.and_then(|body| walk.statement(body, Some(state))))
            }
            "switch_expression" | "switch_statement" => {
                self.switched(node, &mut state);
                Some(state)
            }
            "try_statement" | "try_with_resources_statement" => self.tried(node, state),
            "synchronized_statement" => {
                self.condition(named_children(node).into_iter().find(|part| part.kind() == "parenthesized_expression"), &mut state);
                self.statement(field("body")?, Some(state))
            }
            "return_statement" | "throw_statement" | "yield_statement" => {
                named_children(node).into_iter().for_each(|part| drop(self.expression(part, &mut state)));
                if node.kind() == "yield_statement" {
                    self.leave(None, true, state);
                }
                None
            }
            "break_statement" => {
                let label = named_children(node).into_iter().find(|part| part.kind() == "identifier").map(|part| self.context.text(part).to_string());
                self.leave(label, false, state);
                None
            }
            "continue_statement" => {
                let label = named_children(node).into_iter().find(|part| part.kind() == "identifier").map(|part| self.context.text(part).to_string());
                let target = self.targets.iter_mut().rev().find(|target| match (&target.looping, &label) {
                    (Some(_), None) => true,
                    (Some(own), Some(label)) => own.as_deref() == Some(label),
                    _ => false,
                });
                if let Some(target) = target {
                    target.continues.push(Some(state));
                }
                None
            }
            "assert_statement" => {
                named_children(node).into_iter().for_each(|part| drop(self.expression(part, &mut state)));
                self.called();
                Some(state)
            }
            "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | ";" => Some(state),
            _ => {
                self.expression(node, &mut state);
                Some(state)
            }
        }
    }

    pub fn condition(&mut self, node: Option<Node<'a>>, state: &mut State) {
        if let Some(node) = node {
            self.expression(node, state);
        }
    }

    fn leave(&mut self, label: Option<String>, from_switch: bool, state: State) {
        let target = self.targets.iter_mut().rev().find(|target| match &label {
            Some(label) => target.label.as_deref() == Some(label),
            None => target.breakable && (!from_switch || target.label.as_deref() == Some("switch")),
        });
        if let Some(target) = target {
            target.states.push(Some(state));
        }
    }

    pub fn targeted(&mut self, label: Option<String>, breakable: bool, inside: impl FnOnce(&mut Self) -> Option<State>) -> Option<State> {
        self.targets.push(Target { label, breakable, states: Vec::new(), looping: None, continues: Vec::new() });
        let end = inside(self);
        let target = self.targets.pop().expect("target");
        let mut all = target.states;
        all.push(end);
        merge_all(all, &self.numbers)
    }

    /// The body of a loop: the state at its end merged with the `continue`s, and the states of its `break`s.
    fn body(&mut self, node: Node<'a>, state: State) -> (Option<State>, Vec<Option<State>>) {
        let label = reach::loop_label(self.context, node);
        self.targets.push(Target { label: None, breakable: true, states: Vec::new(), looping: Some(label), continues: Vec::new() });
        let end = node.child_by_field_name("body").and_then(|body| self.statement(body, Some(state)));
        let target = self.targets.pop().expect("target");
        let mut ends = target.continues;
        ends.push(end);
        (merge_all(ends, &self.numbers), target.states)
    }

    /// The head of a loop: values read from fields before are out of date, and so is each local the loop changes.
    fn head(&mut self, node: Node<'a>, state: &mut State) {
        self.called();
        let mut changed = Vec::new();
        walk(node, |part| {
            let target = match part.kind() {
                "assignment_expression" => part.child_by_field_name("left"),
                "update_expression" => named_children(part).into_iter().next(),
                "enhanced_for_statement" => part.child_by_field_name("name"),
                _ => None,
            };
            changed.extend(target.filter(|target| target.kind() == "identifier").map(|target| self.context.text(target).to_string()));
        });
        for name in changed {
            if state.locals.contains_key(&name) {
                state.locals.insert(name, self.numbers.fresh());
            }
        }
    }

    fn looped(&mut self, node: Node<'a>, mut state: State) -> Option<State> {
        let field = |name: &str| node.child_by_field_name(name);
        let mut cursor = node.walk();
        let inits: Vec<Node> = node.children_by_field_name("init", &mut cursor).collect();
        let mut cursor = node.walk();
        let updates: Vec<Node> = node.children_by_field_name("update", &mut cursor).collect();
        for init in inits {
            self.expression(init, &mut state);
        }
        if node.kind() == "enhanced_for_statement" {
            self.condition(field("value"), &mut state);
        }
        let never_again = node.kind() == "do_statement" && field("condition").is_some_and(|condition| self.context.text(condition).replace(['(', ')', ' '], "") == "false");
        if !never_again && reach::loops_back(self.context, node) {
            self.head(node, &mut state);
        }
        if node.kind() == "do_statement" {
            let (end, mut breaks) = self.body(node, state);
            breaks.push(end.map(|mut end| {
                self.condition(field("condition"), &mut end);
                end
            }));
            return merge_all(breaks, &self.numbers);
        }
        self.condition(field("condition"), &mut state);
        if node.kind() == "enhanced_for_statement" && !field("value").and_then(|value| self.type_of(value)).is_some_and(|kind| matches!(kind, crate::java::types::model::Type::Array(_))) {
            self.called();
        }
        let exit = state.clone();
        if let Some(name) = field("name").filter(|_| node.kind() == "enhanced_for_statement") {
            let value = self.numbers.fresh();
            state.locals.insert(self.context.text(name).to_string(), value);
        }
        let (end, mut breaks) = self.body(node, state);
        if let Some(mut live) = end {
            for update in &updates {
                self.expression(*update, &mut live);
            }
        }
        breaks.push(Some(exit));
        merge_all(breaks, &self.numbers)
    }
}
