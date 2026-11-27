//! EOS_BAD_END_OF_STREAM_CHECK (FindBadEndOfStreamCheck): the result of a `read` of a `FileInputStream` or a
//! `FileReader` is cast to `byte` or `char` and then compared with the value that marks the end of the stream.
//!
//! As measured, the call is a `read` the compiled code makes on `FileInputStream` or `FileReader`, or on a subclass
//! of `FileInputStream` that does not declare that `read` itself. The cast value counts while it is still on the
//! stack (also through `(int)` casts and unary `+`), or, when the `read` result was first kept in a variable,
//! wherever the cast value goes as long as that first variable is not written again further down the code. A cast
//! value kept in a variable straight from the call does not count. The comparison is `==` or `!=` with -1, or `< 0`
//! / `>= 0` with a literal 0, also written `0 > x` / `0 <= x` (but not `0 < x`, `0 >= x` or a variable holding 0).
//! One finding per method, on the first.
mod tests;
use tests::{read_call, tested};
use super::super::{Context, compare, folds, names, place};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::flow::cfg::{self, Exit, unwrap};
use crate::java::types::expr::Binding;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

pub const PATTERN: &str = "EOS_BAD_END_OF_STREAM_CHECK";

pub(super) const STREAM: &str = "java.io.FileInputStream";
pub(super) const READER: &str = "java.io.FileReader";
const BODIES: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression"];

#[derive(Clone, PartialEq)]
pub(super) enum Value {
    /// The result of a `read`; `home` is the first variable it was kept in.
    Read { home: Option<String>, call: String },
    Cast { home: Option<String>, call: String, kind: &'static str },
    /// `fixed` for a constant javac folds, which it can compare with zero by itself.
    Number { value: i64, fixed: bool },
    Other,
}

type State = HashMap<String, Value>;

enum Event<'t> {
    Cast(Option<String>),
    Store(String),
    Compare(Node<'t>),
}

fn meet(a: &State, b: &State) -> State {
    a.iter().filter(|(name, value)| b.get(*name) == Some(*value)).map(|(name, value)| (name.clone(), value.clone())).collect()
}

fn kept(value: Value, name: &str) -> Value {
    match value {
        Value::Read { home: None, call } => Value::Read { home: Some(name.to_string()), call },
        Value::Cast { home: None, call, kind } => Value::Cast { home: Some(name.to_string()), call, kind },
        other => other,
    }
}

/// Where javac puts a node's code: in source order, after its operands, with a `for` update after the body.
fn order(node: Node) -> (usize, usize) {
    let mut inner = node;
    let mut current = parent(node);
    while let Some(at) = current {
        let update = at.kind() == "for_statement" && at.children_by_field_name("update", &mut at.walk()).any(|step| step.id() == inner.id());
        if let Some(body) = at.child_by_field_name("body").filter(|_| update) {
            return (body.end_byte(), node.end_byte());
        }
        inner = at;
        current = parent(at);
    }
    (node.end_byte(), 0)
}

struct Walk<'c, 'a, 't> {
    context: &'c Context<'a>,
    locals: HashSet<String>,
    values: HashMap<usize, Value>,
    events: Vec<((usize, usize), Event<'t>)>,
}

impl<'t> Walk<'_, '_, 't> {
    fn value(&self, node: Node) -> Value {
        self.values.get(&unwrap(node).id()).cloned().unwrap_or(Value::Other)
    }

    fn local(&self, node: Node) -> Option<String> {
        let name = self.context.text(node);
        let bound = matches!(self.context.resolver.binding(node, name), Some(Binding::Local(_)));
        (node.kind() == "identifier" && bound && self.locals.contains(name)).then(|| name.to_string())
    }

    fn store(&mut self, node: Node<'t>, name: String, value: Value, state: &mut State) {
        state.insert(name.clone(), kept(value, &name));
        self.events.push((order(node), Event::Store(name)));
    }

    fn step(&mut self, node: Node<'t>, state: &mut State) {
        let context = self.context;
        let value = match node.kind() {
            "identifier" => match self.local(node) {
                Some(name) => state.get(&name).cloned().unwrap_or(Value::Other),
                None => folds::number(context, node).map_or(Value::Other, |value| Value::Number { value, fixed: true }),
            },
            "unary_expression" if node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "+") => {
                node.child_by_field_name("operand").map_or(Value::Other, |operand| self.value(operand))
            }
            "parenthesized_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")).map_or(Value::Other, |inner| self.value(inner)),
            "cast_expression" => self.cast(node),
            "method_invocation" => read_call(context, node).map_or(Value::Other, |call| Value::Read { home: None, call }),
            "ternary_expression" => {
                let arms = [node.child_by_field_name("consequence"), node.child_by_field_name("alternative")].map(|arm| arm.map(|arm| self.value(arm)));
                match arms {
                    [Some(a), Some(b)] if a == b => a,
                    _ => Value::Other,
                }
            }
            "assignment_expression" => {
                let left = node.child_by_field_name("left").and_then(|left| self.local(left));
                let simple = node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=");
                let right = node.child_by_field_name("right").map_or(Value::Other, |right| self.value(right));
                if let Some(name) = left {
                    self.store(node, name, if simple { right.clone() } else { Value::Other }, state);
                }
                if simple { right } else { Value::Other }
            }
            "update_expression" => {
                if let Some(name) = named_children(node).into_iter().find_map(|part| self.local(part)) {
                    self.store(node, name, Value::Other, state);
                }
                Value::Other
            }
            "variable_declarator" => {
                let Some(name) = node.child_by_field_name("name").map(|name| context.text(name).to_string()) else { return };
                let constant = parent(node).is_some_and(|declaration| context.text(declaration).starts_with("final"));
                match node.child_by_field_name("value").map(|value| self.value(value)) {
                    Some(Value::Number { value, .. }) => self.store(node, name, Value::Number { value, fixed: constant }, state),
                    Some(value) => self.store(node, name, value, state),
                    None => {
                        state.remove(&name);
                    }
                }
                Value::Other
            }
            "binary_expression" => {
                self.events.push((order(node), Event::Compare(node)));
                folds::number(context, node).map_or(Value::Other, |value| Value::Number { value, fixed: true })
            }
            _ => folds::number(context, node).map_or(Value::Other, |value| Value::Number { value, fixed: true }),
        };
        self.values.insert(node.id(), value);
    }

    fn cast(&mut self, node: Node<'t>) -> Value {
        let kind = node.child_by_field_name("type").map(|kind| self.context.text(kind)).unwrap_or_default();
        let inner = node.child_by_field_name("value").map_or(Value::Other, |value| self.value(value));
        match (kind, inner) {
            ("byte" | "char", Value::Read { home, call }) => {
                self.events.push((order(node), Event::Cast(home.clone())));
                Value::Cast { home, call, kind: if kind == "byte" { "byte" } else { "char" } }
            }
            ("int", kept @ (Value::Cast { .. } | Value::Read { .. })) => kept,
            ("byte" | "char" | "short" | "int", Value::Number { value, fixed }) => {
                let value = match kind {
                    "byte" => i64::from(value as i8),
                    "char" => i64::from(value as u16),
                    "short" => i64::from(value as i16),
                    _ => i64::from(value as i32),
                };
                Value::Number { value, fixed }
            }
            _ => Value::Other,
        }
    }
}

fn successors(block: &cfg::Block) -> Vec<usize> {
    let mut next = match &block.exit {
        Exit::End => Vec::new(),
        Exit::Jump(to) => vec![*to],
        Exit::Branch(_, yes, no) => vec![*yes, *no],
        Exit::Any(all) => all.clone(),
    };
    next.extend(block.catches.iter().flatten().map(|catch| catch.block));
    next
}

fn check<'a>(context: &Context<'a>, declaration: Node<'a>, body: Node<'a>) {
    let mut locals = HashSet::new();
    walk(declaration, |node| {
        if matches!(node.kind(), "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "spread_parameter") {
            locals.extend(node.child_by_field_name("name").map(|name| context.text(name).to_string()));
        }
    });
    let graph = cfg::build(context.file, body, &|_| false);
    let mut run = Walk { context, locals, values: HashMap::new(), events: Vec::new() };
    let mut entries: Vec<Option<State>> = vec![None; graph.blocks.len()];
    entries[0] = Some(State::new());
    let mut open = vec![0];
    let mut budget = graph.blocks.len() * 40 + 100;
    while let Some(at) = open.pop() {
        budget = budget.saturating_sub(1);
        if budget == 0 {
            return;
        }
        let mut state = entries[at].clone().unwrap_or_default();
        let start = state.clone();
        for step in &graph.blocks[at].steps {
            run.step(*step, &mut state);
        }
        let leaving = [(successors(&graph.blocks[at]), state)];
        for (next, state) in leaving {
            for to in next {
                let handler = graph.blocks[at].catches.iter().flatten().any(|catch| catch.block == to);
                let given = if handler { meet(&start, &state) } else { state.clone() };
                let merged = match &entries[to] {
                    None => given,
                    Some(old) => meet(old, &given),
                };
                if entries[to].as_ref() != Some(&merged) {
                    entries[to] = Some(merged);
                    open.push(to);
                }
            }
        }
    }
    run.events.clear();
    run.values.clear();
    for (at, entry) in entries.iter().enumerate() {
        let Some(mut state) = entry.clone() else { continue };
        for step in &graph.blocks[at].steps {
            run.step(*step, &mut state);
        }
    }
    run.events.sort_by_key(|(key, _)| *key);
    let mut active = HashSet::new();
    for (_, event) in &run.events {
        match event {
            Event::Cast(home) => {
                active.insert(home.clone());
            }
            Event::Store(name) => {
                active.remove(&Some(name.clone()));
            }
            Event::Compare(comparison) => {
                let Some((constant, call, kind)) = tested(context, *comparison, &run.values, &active) else { continue };
                let Some(label) = names::around(context, body) else { return };
                let message = format!("The return value of {call} in method {label} is converted to {kind} before comparison to {constant}.");
                let symbol = format!("{}|{}@{call}", place::function(&call), context.resolver.scope.package);
                let listed = vec![call.clone(), label.clone(), kind.to_string(), constant.to_string()];
                context.report_listed(PATTERN, *comparison, compare::lines::line(context, *comparison), message, symbol, 2, listed);
                return;
            }
        }
    }
}

pub fn streams<'a>(context: &Context<'a>, root: Node<'a>) {
    if !context.wants(&[PATTERN]) {
        return;
    }
    let mut found = Vec::new();
    walk(root, |node| {
        if BODIES.contains(&node.kind()) {
            found.extend(node.child_by_field_name("body").filter(|body| matches!(body.kind(), "block" | "constructor_body")).map(|body| (node, body)));
        }
    });
    for (declaration, body) in found {
        if children(body).is_empty() {
            continue;
        }
        check(context, declaration, body);
    }
}
