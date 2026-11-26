//! What a call looks like by name: the chain of names it is called through (`db.user.create`), its label as
//! messages print it, and a coarse shape of each argument. Read from the compiler's tree of any file.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::tables::{kind as k, node_flags};
use std::collections::HashSet;
use std::rc::Rc;

pub const SPREAD: &str = "...";
const TEXT_KEYS: [&str; 2] = ["text", "sql"];
const MAX_RESOLVE_DEPTH: usize = 4;

/// A node of the compiler's tree of some file.
#[derive(Clone)]
pub struct At {
    pub table: Rc<NodeTable>,
    pub path: Rc<str>,
    pub index: u32,
}

impl At {
    pub fn of(types: &mut Types, handle: &str) -> Option<At> {
        let (index, _, path) = parse_handle(handle)?;
        let table = types.table_of(path)?;
        Some(At { table, path: Rc::from(path), index })
    }
    pub fn to(&self, index: u32) -> At {
        At { table: Rc::clone(&self.table), path: Rc::clone(&self.path), index }
    }
    pub fn kind(&self) -> u32 {
        self.table.kind(self.index)
    }
    pub fn is(&self, kind: u32) -> bool {
        self.kind() == kind
    }
    pub fn child(&self, name: &str) -> Option<At> {
        self.table.child(self.index, name).map(|index| self.to(index))
    }
    pub fn listed(&self, name: &str) -> Vec<At> {
        self.table.listed(self.index, name).into_iter().map(|index| self.to(index)).collect()
    }
    pub fn children(&self) -> Vec<At> {
        self.table.children(self.index).map(|index| self.to(index)).collect()
    }
    pub fn parent(&self) -> Option<At> {
        self.table.parent(self.index).map(|index| self.to(index))
    }
    /// The node and its ancestors, innermost first.
    pub fn chain(&self) -> impl Iterator<Item = At> {
        std::iter::successors(Some(self.clone()), At::parent)
    }
    pub fn text(&self) -> Option<String> {
        self.table.text(self.index).map(|text| text.into_owned())
    }
    pub fn handle(&self) -> String {
        self.table.handle(self.index, &self.path)
    }
    pub fn same(&self, other: &At) -> bool {
        self.index == other.index && self.path == other.path
    }
    /// The text of an identifier, `None` for any other node.
    pub fn identifier(&self) -> Option<String> {
        if self.is(k::IDENTIFIER) { self.text() } else { None }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Literal {
    Text(String),
    Function,
    Pattern,
    Object { keys: HashSet<String>, text: Option<String> },
    Other,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Argument {
    Literal(Literal),
    New { name: String, input: Option<Literal> },
}

impl Argument {
    pub fn text(&self) -> Option<&str> {
        match self {
            Argument::Literal(Literal::Text(text)) | Argument::Literal(Literal::Object { text: Some(text), .. }) => Some(text),
            _ => None,
        }
    }
    pub fn is_function(&self) -> bool {
        matches!(self, Argument::Literal(Literal::Function))
    }
}

/// `CallView`: `names` leave out `this`; `method` is the last name; `root` the identifier the chain starts at.
#[derive(Clone, Debug)]
pub struct CallView<R> {
    pub names: Vec<String>,
    pub label: String,
    pub method: Option<String>,
    pub root: Option<R>,
    pub args: Vec<Argument>,
    pub textual: bool,
}

impl<R> CallView<R> {
    /// `ownerName`: the name before the method.
    pub fn owner(&self) -> Option<&str> {
        self.names.len().checked_sub(2).map(|at| self.names[at].as_str())
    }
}

/// One step of walking a callee from the outside in.
pub struct Step<N, R> {
    pub name: Option<String>,
    pub next: Option<N>,
    pub called: bool,
    pub root: Option<R>,
}

impl<N, R> Step<N, R> {
    pub fn empty() -> Step<N, R> {
        Step { name: None, next: None, called: false, root: None }
    }
}

/// `chainLinks` + `viewOf`.
pub fn view_of<N, R>(callee: N, step: impl Fn(&N) -> Step<N, R>, args: Vec<Argument>, textual: bool) -> CallView<R> {
    let mut steps: Vec<Step<N, R>> = Vec::new();
    let mut current = Some(callee);
    while let Some(node) = current.take() {
        let mut found = step(&node);
        current = found.next.take();
        steps.push(found);
    }
    let mut links: Vec<(String, bool)> = Vec::new();
    for (index, current) in steps.iter().enumerate() {
        let Some(name) = &current.name else { continue };
        let previous = steps[..index].iter().rev().find(|step| step.name.is_some() || step.called);
        links.push((name.clone(), previous.is_some_and(|step| step.called)));
    }
    links.reverse();
    let label = format!("{}()", links.iter().map(|(name, called)| if *called { format!("{name}()") } else { name.clone() }).collect::<Vec<_>>().join("."));
    let root = steps.into_iter().find_map(|step| step.root);
    CallView {
        names: links.iter().map(|(name, _)| name.clone()).filter(|name| name != "this").collect(),
        method: links.last().map(|(name, _)| name.clone()),
        label,
        root,
        args,
        textual,
    }
}

fn is_wrapper(kind: u32) -> bool {
    matches!(kind, k::AWAIT_EXPRESSION | k::PARENTHESIZED_EXPRESSION | k::NON_NULL_EXPRESSION | k::AS_EXPRESSION)
}

fn ts_step(node: &At) -> Step<At, At> {
    let kind = node.kind();
    let mut step = Step::empty();
    if is_wrapper(kind) {
        step.next = node.child("expression");
    } else if kind == k::PROPERTY_ACCESS_EXPRESSION {
        step.name = node.child("name").and_then(|name| name.text());
        step.next = node.child("expression");
    } else if kind == k::ELEMENT_ACCESS_EXPRESSION {
        step.name = Some("[]".to_string());
        step.next = node.child("expression");
    } else if kind == k::CALL_EXPRESSION {
        step.next = node.child("expression");
        step.called = true;
    } else if kind == k::IDENTIFIER {
        step.name = node.text();
        step.root = Some(node.clone());
    } else if kind == k::THIS_KEYWORD {
        step.name = Some("this".to_string());
    }
    step
}

fn template_text(node: &At) -> String {
    if node.is(k::NO_SUBSTITUTION_TEMPLATE_LITERAL) {
        return node.text().unwrap_or_default();
    }
    let head = node.child("head").and_then(|head| head.text()).unwrap_or_default();
    let spans = node.listed("templateSpans").into_iter().map(|span| span.child("literal").and_then(|literal| literal.text()).unwrap_or_default());
    std::iter::once(head).chain(spans).collect::<Vec<_>>().join("?")
}

fn ts_text(node: &At) -> Option<String> {
    match node.kind() {
        k::STRING_LITERAL => Some(node.text().unwrap_or_default()),
        k::NO_SUBSTITUTION_TEMPLATE_LITERAL | k::TEMPLATE_EXPRESSION => Some(template_text(node)),
        _ => None,
    }
}

fn children(node: &At) -> Vec<(Option<String>, Option<At>)> {
    match node.kind() {
        k::ARRAY_LITERAL_EXPRESSION => node.listed("elements").into_iter().map(|element| (None, Some(element))).collect(),
        k::OBJECT_LITERAL_EXPRESSION => node
            .listed("properties")
            .into_iter()
            .map(|property| {
                let key = property.child("name").and_then(|name| name.identifier()).unwrap_or_else(|| SPREAD.to_string());
                let value = if property.is(k::PROPERTY_ASSIGNMENT) { property.child("initializer") } else { None };
                (Some(key), value)
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn deep_keys(root: &At) -> HashSet<String> {
    let mut keys = HashSet::new();
    let mut pending = vec![root.clone()];
    while let Some(node) = pending.pop() {
        for (key, value) in children(&node) {
            keys.extend(key);
            pending.extend(value);
        }
    }
    keys
}

fn ts_literal(node: &At) -> Literal {
    if let Some(text) = ts_text(node) {
        return Literal::Text(text);
    }
    match node.kind() {
        k::ARROW_FUNCTION | k::FUNCTION_EXPRESSION => Literal::Function,
        k::REGULAR_EXPRESSION_LITERAL => Literal::Pattern,
        k::OBJECT_LITERAL_EXPRESSION => {
            let statement = node.listed("properties").into_iter().find(|property| {
                property.is(k::PROPERTY_ASSIGNMENT) && property.child("name").and_then(|name| name.identifier()).is_some_and(|name| TEXT_KEYS.contains(&name.as_str()))
            });
            let text = statement.and_then(|statement| statement.child("initializer")).and_then(|value| ts_text(&value));
            Literal::Object { keys: deep_keys(node), text }
        }
        k::ARRAY_LITERAL_EXPRESSION => Literal::Object { keys: deep_keys(node), text: None },
        _ => Literal::Other,
    }
}

/// `getCombinedNodeFlags(declaration) & NodeFlags.Const` of a variable declaration.
pub fn is_constant_declaration(node: &At) -> bool {
    let mut flags = node.table.flags(node.index);
    let list = node.parent().filter(|list| list.is(k::VARIABLE_DECLARATION_LIST));
    if let Some(list) = &list {
        flags |= list.table.flags(list.index);
        if let Some(statement) = list.parent().filter(|statement| statement.is(k::VARIABLE_STATEMENT)) {
            flags |= statement.table.flags(statement.index);
        }
    }
    flags & node_flags::CONST != 0
}

fn constant_initializer(types: &mut Types, node: &At) -> Option<At> {
    if !node.is(k::IDENTIFIER) {
        return None;
    }
    let found = types.session.symbol_at(&node.handle());
    let symbol = types.answered(found.map(Some)).flatten()?;
    let declaration = At::of(types, symbol.value_declaration.as_deref()?)?;
    (declaration.is(k::VARIABLE_DECLARATION) && is_constant_declaration(&declaration)).then(|| declaration.child("initializer")).flatten()
}

fn ts_argument(types: &mut Types, argument: &At) -> Argument {
    let mut node = argument.clone();
    for _ in 0..MAX_RESOLVE_DEPTH {
        if let Some(initializer) = constant_initializer(types, &node) {
            node = initializer;
        }
    }
    if node.is(k::NEW_EXPRESSION) {
        if let Some(name) = node.child("expression").and_then(|callee| callee.identifier()) {
            let input = node.listed("arguments").first().map(ts_literal);
            return Argument::New { name, input };
        }
    }
    Argument::Literal(ts_literal(&node))
}

/// `tsCallee`: the tag of a tagged template, the expression of a call or `new`.
pub fn callee(call: &At) -> Option<At> {
    if call.is(k::TAGGED_TEMPLATE_EXPRESSION) { call.child("tag") } else { call.child("expression") }
}

/// `tsCallView`.
pub fn call_view(types: &mut Types, call: &At) -> Option<CallView<At>> {
    let args = if call.is(k::TAGGED_TEMPLATE_EXPRESSION) {
        vec![Argument::Literal(Literal::Text(call.child("template").map(|template| template_text(&template)).unwrap_or_default()))]
    } else {
        call.listed("arguments").iter().map(|argument| ts_argument(types, argument)).collect()
    };
    Some(view_of(callee(call)?, ts_step, args, false))
}
