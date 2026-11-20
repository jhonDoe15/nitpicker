//! Follows what each local variable holds through one method body, the way a single pass over the method's
//! bytecode sees it: a parameter, a value read from a field, or anything else. Where two paths meet, a variable
//! keeps its meaning only when both paths agree.
mod branches;
mod eval;
mod fields;

pub use fields::FieldRef;
use super::Context;
use crate::engine::source::{children, named_children};
use std::collections::HashMap;
use tree_sitter::Node;

#[derive(Clone, Debug)]
pub enum Item {
    Param,
    /// A variable arity parameter: an array the caller may not even have.
    Spread,
    Field(FieldRef),
    /// A value nobody can change, such as `List.of()`.
    Fixed,
    Other,
}

impl Item {
    fn same(&self, other: &Item) -> bool {
        match (self, other) {
            (Item::Param, Item::Param) | (Item::Other, Item::Other) | (Item::Spread, Item::Spread) | (Item::Fixed, Item::Fixed) => true,
            (Item::Field(a), Item::Field(b)) => a.declaring == b.declaring && a.name == b.name,
            _ => false,
        }
    }
    fn meet(self, other: &Item) -> Item {
        if self.same(other) { self } else { Item::Other }
    }
}

pub struct Store<'t> {
    pub node: Node<'t>,
    pub field: FieldRef,
    /// Written through `this`, an outer `this` or a bare name.
    pub own: bool,
    pub item: Item,
}

#[derive(Default)]
pub struct Trace<'t> {
    pub returns: Vec<(Node<'t>, Item)>,
    pub stores: Vec<Store<'t>>,
    /// What each variable holds where the body ends, when it can end without a return or a throw.
    pub end: Option<State>,
}

pub type State = HashMap<String, Item>;

pub(super) fn meet(a: State, b: &State) -> State {
    a.into_iter().filter_map(|(name, item)| b.get(&name).map(|other| (name, item.meet(other)))).collect()
}

fn same(a: &State, b: &State) -> bool {
    a.len() == b.len() && a.iter().all(|(name, item)| b.get(name).is_some_and(|other| item.same(other)))
}

pub(super) struct Walker<'c, 'a, 't> {
    pub(super) context: &'c Context<'a>,
    returns: HashMap<usize, (Node<'t>, Item)>,
    pub(super) stores: HashMap<usize, Store<'t>>,
    pub(super) breaks: Vec<Vec<State>>,
    continues: Vec<Vec<State>>,
}

pub fn trace<'t>(context: &Context, parameters: &[Node<'t>], body: Node<'t>) -> Trace<'t> {
    let mut state = State::new();
    for parameter in parameters {
        let name = match parameter.kind() {
            "spread_parameter" => children(*parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|d| d.child_by_field_name("name")),
            _ => parameter.child_by_field_name("name"),
        };
        let item = if parameter.kind() == "spread_parameter" { Item::Spread } else { Item::Param };
        state.extend(name.map(|name| (context.text(name).to_string(), item)));
    }
    let mut walker = Walker { context, returns: HashMap::new(), stores: HashMap::new(), breaks: Vec::new(), continues: Vec::new() };
    let completes = walker.exec(body, &mut state);
    let mut trace = Trace { end: completes.then_some(state), ..Trace::default() };
    trace.returns = walker.returns.into_values().collect();
    trace.stores = walker.stores.into_values().collect();
    trace.returns.sort_by_key(|(node, _)| node.start_byte());
    trace.stores.sort_by_key(|store| store.node.start_byte());
    trace
}

impl<'t> Walker<'_, '_, 't> {
    pub(super) fn text(&self, node: Node) -> &str {
        self.context.text(node)
    }

    pub(super) fn sequence(&mut self, statements: Vec<Node<'t>>, state: &mut State) -> bool {
        let mut declared = Vec::new();
        let mut completes = true;
        for statement in statements {
            if statement.kind() == "local_variable_declaration" {
                let names = children(statement).into_iter().filter(|part| part.kind() == "variable_declarator").filter_map(|d| d.child_by_field_name("name"));
                declared.extend(names.map(|name| self.text(name).to_string()));
            }
            if !self.exec(statement, state) {
                completes = false;
                break;
            }
        }
        for name in declared {
            state.remove(&name);
        }
        completes
    }

    fn looped(&mut self, state: &mut State, mut pass: impl FnMut(&mut Self, &mut State) -> bool) {
        let entry = state.clone();
        let mut head = entry.clone();
        let mut exits = Vec::new();
        for _ in 0..3 {
            self.breaks.push(Vec::new());
            self.continues.push(Vec::new());
            let mut inside = head.clone();
            let completes = pass(self, &mut inside);
            exits = self.breaks.pop().unwrap_or_default();
            let mut back = self.continues.pop().unwrap_or_default();
            if completes {
                back.push(inside);
            }
            let next = back.iter().fold(entry.clone(), meet);
            if same(&next, &head) {
                break;
            }
            head = next;
        }
        *state = exits.iter().fold(head, meet);
    }

    pub(super) fn exec(&mut self, node: Node<'t>, state: &mut State) -> bool {
        match node.kind() {
            "block" | "constructor_body" => self.sequence(named_children(node), state),
            "local_variable_declaration" => {
                for declarator in children(node).into_iter().filter(|part| part.kind() == "variable_declarator") {
                    let item = declarator.child_by_field_name("value").map_or(Item::Other, |value| self.eval(value, state));
                    state.extend(declarator.child_by_field_name("name").map(|name| (self.text(name).to_string(), item)));
                }
                true
            }
            "expression_statement" | "explicit_constructor_invocation" | "assert_statement" => {
                for part in named_children(node) {
                    self.eval(part, state);
                }
                true
            }
            "if_statement" => {
                if let Some(condition) = node.child_by_field_name("condition") {
                    self.eval(condition, state);
                }
                let mut yes = state.clone();
                let first = node.child_by_field_name("consequence").is_none_or(|then| self.exec(then, &mut yes));
                let second = node.child_by_field_name("alternative").is_none_or(|other| self.exec(other, state));
                match (first, second) {
                    (true, true) => *state = meet(yes, state),
                    (true, false) => *state = yes,
                    _ => {}
                }
                first || second
            }
            "while_statement" | "do_statement" | "for_statement" | "enhanced_for_statement" => {
                let mut declared = Vec::new();
                for part in children(node) {
                    if part.kind() == "local_variable_declaration" && node.kind() == "for_statement" {
                        self.exec(part, state);
                        let names = children(part).into_iter().filter(|d| d.kind() == "variable_declarator").filter_map(|d| d.child_by_field_name("name"));
                        declared.extend(names.map(|name| self.text(name).to_string()));
                    }
                }
                if let Some(init) = node.child_by_field_name("init").filter(|init| init.kind() != "local_variable_declaration") {
                    self.eval(init, state);
                }
                if let Some(value) = node.child_by_field_name("value").filter(|_| node.kind() == "enhanced_for_statement") {
                    self.eval(value, state);
                }
                let condition = node.child_by_field_name("condition");
                let body = node.child_by_field_name("body");
                let updates: Vec<Node> = { let mut cursor = node.walk(); node.children_by_field_name("update", &mut cursor).collect() };
                self.looped(state, |walker, inside| {
                    if let Some(condition) = condition.filter(|_| node.kind() != "do_statement") {
                        walker.eval(condition, inside);
                    }
                    if node.kind() == "enhanced_for_statement" {
                        inside.extend(node.child_by_field_name("name").map(|name| (walker.text(name).to_string(), Item::Other)));
                    }
                    let completes = body.is_none_or(|body| walker.exec(body, inside));
                    if completes {
                        for update in &updates {
                            walker.eval(*update, inside);
                        }
                        if let Some(condition) = condition.filter(|_| node.kind() == "do_statement") {
                            walker.eval(condition, inside);
                        }
                    }
                    completes
                });
                for name in declared {
                    state.remove(&name);
                }
                true
            }
            "return_statement" => {
                if let Some(value) = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")) {
                    let item = self.eval(value, state);
                    self.returns.insert(node.id(), (node, item));
                }
                false
            }
            "throw_statement" | "yield_statement" => {
                for part in named_children(node) {
                    self.eval(part, state);
                }
                false
            }
            "break_statement" => {
                if let Some(open) = self.breaks.last_mut() {
                    open.push(state.clone());
                }
                false
            }
            "continue_statement" => {
                if let Some(open) = self.continues.last_mut() {
                    open.push(state.clone());
                }
                false
            }
            "labeled_statement" => named_children(node).last().is_none_or(|inner| self.exec(*inner, state)),
            "synchronized_statement" => {
                let parts = named_children(node);
                for part in &parts {
                    if part.kind() != "block" {
                        self.eval(*part, state);
                    }
                }
                parts.iter().find(|part| part.kind() == "block").is_none_or(|body| self.exec(*body, state))
            }
            "try_statement" | "try_with_resources_statement" => self.attempt(node, state),
            "switch_expression" => self.switch(node, state),
            _ => true,
        }
    }
}
