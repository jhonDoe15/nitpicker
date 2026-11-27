//! The statements of one method in the order javac writes their code, keeping a `State` of the local variables
//! along each path (paths that meet are merged). Measured: what makes a value read from a field out of date does
//! so for all code after it in that order, on any path: a call (also `new`, and one on a path that returns), a
//! store into the field, the head of a loop (even one without calls). A `finally` block is walked where javac
//! copies it: after the `try` block, after each `catch` block, and once more for exceptions.
use super::values::{Key, Numbers, State, merge, merge_all};
use super::super::Context;
use crate::engine::source::{children, named_children, walk};
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
    /// `o.f = o.f++`.
    pub postfix: bool,
}

struct Target {
    label: Option<String>,
    breakable: bool,
    states: Vec<Option<State>>,
}

pub struct Walk<'c, 'a> {
    pub context: &'c Context<'a>,
    pub own: String,
    pub numbers: Numbers,
    pub found: Vec<Store<'a>>,
    targets: Vec<Target>,
    calls: u32,
    fields: HashMap<Key, u32>,
}

impl<'c, 'a> Walk<'c, 'a> {
    pub fn new(context: &'c Context<'a>, own: &str) -> Self {
        Walk { context, own: own.to_string(), numbers: Numbers::default(), found: Vec::new(), targets: Vec::new(), calls: 0, fields: HashMap::new() }
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
            "continue_statement" => None,
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

    fn targeted(&mut self, label: Option<String>, breakable: bool, inside: impl FnOnce(&mut Self) -> Option<State>) -> Option<State> {
        self.targets.push(Target { label, breakable, states: Vec::new() });
        let end = inside(self);
        let target = self.targets.pop().expect("target");
        let mut all = target.states;
        all.push(end);
        merge_all(all, &self.numbers)
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
        if !never_again {
            self.head(node, &mut state);
        }
        if node.kind() == "do_statement" {
            let end = self.targeted(None, true, |walk| {
                let mut end = walk.statement(field("body")?, Some(state))?;
                walk.condition(field("condition"), &mut end);
                Some(end)
            });
            return end;
        }
        self.condition(field("condition"), &mut state);
        if node.kind() == "enhanced_for_statement" {
            self.called();
        }
        let exit = state.clone();
        self.targeted(None, true, |walk| {
            let mut end = walk.statement(field("body")?, Some(state));
            for update in &updates {
                if let Some(live) = end.as_mut() {
                    walk.expression(*update, live);
                }
            }
            drop(end);
            Some(exit)
        })
    }

    pub fn switched(&mut self, node: Node<'a>, state: &mut State) {
        self.condition(node.child_by_field_name("condition"), state);
        let Some(body) = node.child_by_field_name("body") else { return };
        let entry = state.clone();
        let groups = named_children(body);
        let defaulted = groups.iter().any(|group| children(*group).into_iter().any(|part| part.kind() == "switch_label" && self.context.text(part).starts_with("default")));
        let end = self.targeted(Some("switch".to_string()), true, |walk| {
            let mut through: Option<State> = None;
            let mut ends = Vec::new();
            for group in &groups {
                let start = merge(Some(entry.clone()), through.take(), &walk.numbers);
                let parts: Vec<Node> = named_children(*group).into_iter().filter(|part| part.kind() != "switch_label").collect();
                let done = walk.statements(&parts, start);
                if group.kind() == "switch_rule" {
                    ends.push(done);
                } else {
                    through = done;
                }
            }
            ends.push(through);
            if !defaulted {
                ends.push(Some(entry.clone()));
            }
            merge_all(ends, &walk.numbers)
        });
        *state = end.unwrap_or_else(|| entry.clone());
    }

    fn tried(&mut self, node: Node<'a>, mut state: State) -> Option<State> {
        if let Some(resources) = node.child_by_field_name("resources") {
            self.expression(resources, &mut state);
        }
        let finally = named_children(node).into_iter().find(|part| part.kind() == "finally_clause").and_then(|part| named_children(part).into_iter().next());
        let before = state.clone();
        let mut done = node.child_by_field_name("body").and_then(|body| self.statement(body, Some(state)));
        if node.kind() == "try_with_resources_statement" {
            self.called();
        }
        let entry = merge(Some(before), done.clone(), &self.numbers);
        if let Some(finally) = finally {
            done = self.statement(finally, done);
        }
        let mut ends = vec![done];
        for part in named_children(node).into_iter().filter(|part| part.kind() == "catch_clause") {
            let mut end = part.child_by_field_name("body").and_then(|body| self.statement(body, entry.clone()));
            if let Some(finally) = finally {
                end = self.statement(finally, end);
            }
            ends.push(end);
        }
        if let Some(finally) = finally {
            drop(self.statement(finally, entry));
        }
        merge_all(ends, &self.numbers)
    }
}
