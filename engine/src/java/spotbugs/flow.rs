//! Follows what each local variable holds through one method body, the way a single pass over the method's
//! bytecode sees it: a parameter, a value read from a field, or anything else. Where two paths meet, a variable
//! keeps its meaning only when both paths agree.
use super::Context;
use crate::engine::source::{children, named_children, walk};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::{ClassInfo, Field, Type, flag};
use crate::java::types::scope::enclosing_type;
use std::collections::HashMap;
use tree_sitter::Node;

#[derive(Clone, Debug)]
pub struct FieldRef {
    pub declaring: String,
    pub name: String,
    /// The class the access goes through: the type of the object, or the class whose scope gave the name.
    pub via: String,
    pub kind: Type,
    pub flags: u16,
}

impl FieldRef {
    fn of(declaring: &ClassInfo, field: &Field, via: String) -> FieldRef {
        FieldRef { declaring: declaring.name.clone(), name: field.name.clone(), via, kind: field.kind.clone(), flags: field.flags }
    }
    pub fn is_static(&self) -> bool {
        self.flags & flag::STATIC != 0
    }
    pub fn is_public(&self) -> bool {
        self.flags & flag::PUBLIC != 0
    }
}

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

fn meet(a: State, b: &State) -> State {
    a.into_iter().filter_map(|(name, item)| b.get(&name).map(|other| (name, item.meet(other)))).collect()
}

fn same(a: &State, b: &State) -> bool {
    a.len() == b.len() && a.iter().all(|(name, item)| b.get(name).is_some_and(|other| item.same(other)))
}

struct Walker<'c, 'a, 't> {
    context: &'c Context<'a>,
    returns: HashMap<usize, (Node<'t>, Item)>,
    stores: HashMap<usize, Store<'t>>,
    breaks: Vec<Vec<State>>,
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

const SKIPPED: &[&str] = &["lambda_expression", "class_body", "class_declaration", "interface_declaration", "enum_declaration", "record_declaration"];

impl<'t> Walker<'_, '_, 't> {
    fn text(&self, node: Node) -> &str {
        self.context.text(node)
    }

    fn sequence(&mut self, statements: Vec<Node<'t>>, state: &mut State) -> bool {
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

    fn exec(&mut self, node: Node<'t>, state: &mut State) -> bool {
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

    fn attempt(&mut self, node: Node<'t>, state: &mut State) -> bool {
        let mut declared = Vec::new();
        if let Some(resources) = node.child_by_field_name("resources") {
            for resource in children(resources).into_iter().filter(|part| part.kind() == "resource") {
                let item = resource.child_by_field_name("value").map_or(Item::Other, |value| self.eval(value, state));
                if let Some(name) = resource.child_by_field_name("name") {
                    declared.push(self.text(name).to_string());
                    state.insert(self.text(name).to_string(), item);
                }
            }
        }
        let mut caught = state.clone();
        let Some(body) = node.child_by_field_name("body") else { return true };
        walk(body, |inner| {
            let target = match inner.kind() {
                "assignment_expression" => inner.child_by_field_name("left"),
                "update_expression" => named_children(inner).into_iter().next(),
                _ => None,
            };
            if let Some(target) = target.filter(|target| target.kind() == "identifier") {
                if let Some(item) = caught.get_mut(self.context.text(target)) {
                    *item = Item::Other;
                }
            }
        });
        let mut ends = Vec::new();
        if self.exec(body, state) {
            ends.push(state.clone());
        }
        let mut last = None;
        for part in children(node) {
            match part.kind() {
                "catch_clause" => {
                    let mut inside = caught.clone();
                    if part.child_by_field_name("body").is_none_or(|handler| self.exec(handler, &mut inside)) {
                        ends.push(inside);
                    }
                }
                "finally_clause" => last = named_children(part).into_iter().find(|inner| inner.kind() == "block"),
                _ => {}
            }
        }
        let completes = !ends.is_empty();
        let mut merged = ends.into_iter().reduce(|a, b| meet(a, &b)).unwrap_or(caught);
        let finished = last.is_none_or(|block| self.exec(block, &mut merged));
        for name in declared {
            merged.remove(&name);
        }
        *state = merged;
        completes && finished
    }

    fn switch(&mut self, node: Node<'t>, state: &mut State) -> bool {
        if let Some(condition) = node.child_by_field_name("condition") {
            self.eval(condition, state);
        }
        let Some(body) = node.child_by_field_name("body") else { return true };
        let entry = state.clone();
        self.breaks.push(Vec::new());
        let mut ends = Vec::new();
        let mut fall: Option<State> = None;
        let mut total = false;
        for group in named_children(body) {
            let parts = named_children(group);
            total |= parts.iter().any(|part| part.kind() == "switch_label" && self.text(*part).starts_with("default"));
            let mut inside = fall.take().map_or(entry.clone(), |open| meet(open, &entry));
            if group.kind() == "switch_rule" {
                let completes = parts.last().is_none_or(|last| match last.kind() {
                    "block" | "throw_statement" => self.exec(*last, &mut inside),
                    "expression_statement" => self.exec(*last, &mut inside),
                    _ => {
                        self.eval(*last, &mut inside);
                        true
                    }
                });
                if completes {
                    ends.push(inside);
                }
            } else {
                let statements = parts.into_iter().filter(|part| part.kind() != "switch_label").collect();
                if self.sequence(statements, &mut inside) {
                    fall = Some(inside);
                }
            }
        }
        ends.extend(self.breaks.pop().unwrap_or_default());
        ends.extend(fall);
        if !total {
            ends.push(entry);
        }
        let completes = !ends.is_empty();
        if let Some(merged) = ends.into_iter().reduce(|a, b| meet(a, &b)) {
            *state = merged;
        }
        completes
    }

    fn named_field(&self, usage: Node, name: &str) -> Option<FieldRef> {
        match self.context.resolver.binding(usage, name)? {
            Binding::Field(owner, declaring, field) => Some(FieldRef::of(declaring, field, owner.name())),
            Binding::Local(_) => self.record_field(usage, name),
        }
    }

    /// Inside a record's methods a component name reads the field; name lookup alone takes it for the component.
    fn record_field(&self, usage: Node, name: &str) -> Option<FieldRef> {
        let method = crate::engine::source::ancestor(usage, &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression"])?;
        if !matches!(method.kind(), "method_declaration" | "constructor_declaration") {
            return None;
        }
        let record = crate::engine::source::parent(crate::engine::source::parent(method)?)?;
        if record.kind() != "record_declaration" {
            return None;
        }
        let component = record.child_by_field_name("parameters").map(named_children).unwrap_or_default().into_iter();
        component.filter_map(|component| component.child_by_field_name("name")).find(|found| self.text(*found) == name)?;
        let own = self.context.resolver.scope.names.get(&record.id())?;
        let (declaring, field) = self.context.resolver.index.field(own, name)?;
        Some(FieldRef::of(declaring, field, own.clone()))
    }

    /// The field an `object.name` expression reads or writes, and whether the object is `this` or an outer `this`.
    fn accessed_field(&self, access: Node) -> Option<(FieldRef, bool)> {
        let resolver = self.context.resolver;
        let object = access.child_by_field_name("object")?;
        let name = self.text(access.child_by_field_name("field")?);
        let own_class = || enclosing_type(self.context.file, resolver.scope, access);
        let (via, own) = match object.kind() {
            "this" => (own_class()?, true),
            "super" => (resolver.index.get(&own_class()?)?.superclass.clone()?, true),
            "field_access" if object.child_by_field_name("field").is_some_and(|field| field.kind() == "this") => {
                let outer = object.child_by_field_name("object")?;
                (resolver.class_name(access, self.text(outer))?, true)
            }
            _ => match resolver.receiver(object)? {
                Receiver::Value(Type::Class(class, _)) | Receiver::Static(class) => (class, false),
                Receiver::Value(_) => return None,
            },
        };
        let (declaring, field) = resolver.index.field(&via, name)?;
        Some((FieldRef::of(declaring, field, via), own))
    }

    /// `Outer.this` read inside an inner class is a read of the hidden field that holds the outer instance.
    fn outer_this(&self, access: Node) -> Option<FieldRef> {
        let resolver = self.context.resolver;
        let nest = crate::java::types::scope::enclosing_types(resolver.scope, access);
        let outer = resolver.class_name(access, self.text(access.child_by_field_name("object")?))?;
        if nest.get(1) != Some(&outer) {
            return None;
        }
        let name = format!("this${}", nest.len() - 2);
        Some(FieldRef { declaring: nest[0].clone(), name, via: nest[0].clone(), kind: Type::class(&outer), flags: flag::FINAL })
    }

    fn passes_argument(&self, call: Node) -> bool {
        let name = call.child_by_field_name("name").map(|name| self.text(name)).unwrap_or_default();
        let owner = call.child_by_field_name("object").map(|object| self.text(object).rsplit('.').next().unwrap_or_default());
        match name {
            "requireNonNull" => owner.is_none_or(|owner| owner == "Objects"),
            "checkNotNull" => owner.is_none_or(|owner| owner == "Preconditions"),
            _ => false,
        }
    }

    fn eval(&mut self, node: Node<'t>, state: &mut State) -> Item {
        match node.kind() {
            "parenthesized_expression" => named_children(node).into_iter().next().map_or(Item::Other, |inner| self.eval(inner, state)),
            "cast_expression" => node.child_by_field_name("value").map_or(Item::Other, |value| self.eval(value, state)),
            "identifier" => {
                let name = self.text(node);
                match state.get(name) {
                    Some(item) => item.clone(),
                    None => self.named_field(node, name).map_or(Item::Other, Item::Field),
                }
            }
            "field_access" if node.child_by_field_name("field").is_some_and(|field| field.kind() == "this") => {
                self.outer_this(node).map_or(Item::Other, Item::Field)
            }
            "field_access" => {
                if let Some(object) = node.child_by_field_name("object").filter(|object| !matches!(object.kind(), "this" | "super")) {
                    self.eval(object, state);
                }
                self.accessed_field(node).map_or(Item::Other, |(field, _)| Item::Field(field))
            }
            "assignment_expression" => self.assign(node, state),
            "ternary_expression" => {
                let parts = ["condition", "consequence", "alternative"].map(|field| node.child_by_field_name(field));
                if let Some(condition) = parts[0] {
                    self.eval(condition, state);
                }
                let first = parts[1].map_or(Item::Other, |part| self.eval(part, state));
                let second = parts[2].map_or(Item::Other, |part| self.eval(part, state));
                match first.meet(&second) {
                    Item::Fixed if !super::stores::immutable_value(self.context, node) => Item::Other,
                    met => met,
                }
            }
            "method_invocation" => {
                if let Some(object) = node.child_by_field_name("object") {
                    self.eval(object, state);
                }
                let arguments = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
                let items: Vec<Item> = arguments.into_iter().map(|argument| self.eval(argument, state)).collect();
                if items.len() == 1 && self.passes_argument(node) {
                    return match items.into_iter().next() {
                        Some(Item::Spread) => Item::Param,
                        Some(item) => item,
                        None => Item::Other,
                    };
                }
                if super::stores::immutable_value(self.context, node) { Item::Fixed } else { Item::Other }
            }
            "update_expression" => {
                for operand in named_children(node) {
                    if operand.kind() == "identifier" {
                        if let Some(item) = state.get_mut(self.text(operand)) {
                            *item = Item::Other;
                        }
                    }
                }
                Item::Other
            }
            "switch_expression" => {
                self.switch(node, state);
                Item::Other
            }
            kind if SKIPPED.contains(&kind) => Item::Other,
            _ => {
                for part in named_children(node) {
                    self.eval(part, state);
                }
                Item::Other
            }
        }
    }

    fn assign(&mut self, node: Node<'t>, state: &mut State) -> Item {
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return Item::Other };
        let plain = node.child_by_field_name("operator").is_some_and(|operator| self.text(operator) == "=");
        if left.kind() != "identifier" {
            for part in named_children(left) {
                if !matches!(part.kind(), "this" | "super") {
                    self.eval(part, state);
                }
            }
        }
        let value = self.eval(right, state);
        let value = if plain { value } else { Item::Other };
        let target = match left.kind() {
            "identifier" => {
                let name = self.text(left);
                if state.contains_key(name) {
                    state.insert(name.to_string(), value.clone());
                    None
                } else {
                    self.named_field(left, name).map(|field| (field, true))
                }
            }
            "field_access" => self.accessed_field(left),
            _ => None,
        };
        if let Some((field, _)) = &target {
            for held in state.values_mut() {
                if matches!(held, Item::Field(other) if other.declaring == field.declaring && other.name == field.name) {
                    *held = Item::Other;
                }
            }
        }
        if let Some((field, own)) = target.filter(|_| plain) {
            self.stores.insert(node.id(), Store { node, field, own, item: value.clone() });
        }
        value
    }
}
