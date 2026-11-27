//! Follows how bad each value of one body is, block by block over the engine's flow graph, until nothing changes:
//! a local holds the worst of what the paths into a block give it.
use super::calls::{self, Site};
use super::{Level, THIS, Value, statics};
use crate::engine::source::{children, named_children};
use crate::java::flow::cfg::{self, Cfg, Exit, unwrap};
use crate::java::spotbugs::Context;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet, VecDeque};
use std::rc::Rc;
use tree_sitter::Node;

#[derive(Clone, Copy, PartialEq)]
pub enum Mode {
    /// Working out what a called method does: parameters and `this` stand for what the call hands over.
    Summary,
    /// Looking for sinks: `this` is unknown; what parameters hold is settled from the calls of the run.
    Report,
}

pub type State = HashMap<String, Value>;

/// What the bodies of one file share: what the static fields of each class start as, once worked out.
pub struct Shared<'c, 'a> {
    pub context: &'c Context<'a>,
    /// `None` while a class is being worked out.
    pub statics: RefCell<HashMap<String, Option<Rc<HashMap<String, Value>>>>>,
}

impl<'c, 'a> Shared<'c, 'a> {
    pub fn new(context: &'c Context<'a>) -> Self {
        Shared { context, statics: RefCell::default() }
    }
}

/// Parameter annotations that make a parameter tainted.
const SOURCES: &[&str] = &["RequestParam", "PathVariable"];
/// Types whose values a call cannot change.
const FIXED: &[&str] = &[
    "java.lang.String", "java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte", "java.lang.Character", "java.lang.Boolean",
    "java.lang.Double", "java.lang.Float",
];

pub struct Flow<'s, 'c, 'a> {
    pub shared: &'s Shared<'c, 'a>,
    /// The class whose body this is.
    pub own: &'c str,
    pub mode: Mode,
    cfg: Cfg<'a>,
    values: HashMap<(usize, usize), Value>,
    pub this: Value,
    parameters: Vec<(String, Value)>,
    /// What the body returns.
    pub returned: Value,
    /// Parameters the body appends to, with what they hold at its end.
    pub mutated: Vec<(usize, Value)>,
    /// Stores into static fields of the own class.
    pub stores: Vec<(String, Value)>,
    /// Calls of methods of the run, for sinks their parameters reach.
    pub sites: Vec<Site>,
}

fn is_fixed(kind: &Type) -> bool {
    match kind {
        Type::Primitive(_) | Type::Null => true,
        Type::Class(name, _) => FIXED.contains(&name.as_str()),
        _ => false,
    }
}

impl<'s, 'c, 'a> Flow<'s, 'c, 'a> {
    pub fn new(shared: &'s Shared<'c, 'a>, own: &'c str, body: Node<'a>, parameters: Option<Node<'a>>, mode: Mode) -> Self {
        let context = shared.context;
        let cfg = cfg::build(context.file, body, &|_| false);
        let start = Level::Safe;
        let mut listed = Vec::new();
        let declared = parameters.map(children).unwrap_or_default();
        for parameter in declared.into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter" | "identifier")) {
            let name = if parameter.kind() == "identifier" { Some(parameter) } else { crate::java::spotbugs::expose::parameter_name(parameter) };
            let Some(name) = name else { continue };
            let marked = crate::java::helpers::annotation_names(context.file, parameter).iter().any(|name| SOURCES.contains(&name.rsplit('.').next().unwrap_or(name)));
            let level = if marked { Level::Tainted } else { start };
            listed.push((context.text(name).to_string(), Value { level, params: 1 << listed.len().min(62) }));
        }
        let this = Value { level: if mode == Mode::Summary { Level::Safe } else { Level::Unknown }, params: THIS };
        Flow { shared, own, mode, cfg, values: HashMap::new(), this, parameters: listed, returned: Value::SAFE, mutated: Vec::new(), stores: Vec::new(), sites: Vec::new() }
    }

    pub fn context(&self) -> &'c Context<'a> {
        self.shared.context
    }

    pub fn run(mut self) -> Self {
        let blocks = self.cfg.blocks.len();
        let mut entry: Vec<Option<State>> = vec![None; blocks];
        entry[0] = Some(self.parameters.iter().cloned().collect());
        let mut ends: Vec<State> = Vec::new();
        let mut pending = VecDeque::from([0]);
        let mut rounds = 0;
        while let Some(block) = pending.pop_front() {
            rounds += 1;
            if rounds > blocks * 40 + 100 {
                break;
            }
            let Some(start) = entry[block].clone() else { continue };
            let mut state = start.clone();
            let (copy, steps) = (self.cfg.blocks[block].copy, self.cfg.blocks[block].steps.clone());
            for step in steps {
                self.step(step, copy, &mut state);
            }
            let mut next: Vec<(usize, &State)> = match &self.cfg.blocks[block].exit {
                Exit::End => Vec::new(),
                Exit::Jump(to) => vec![(*to, &state)],
                Exit::Branch(_, holds, fails) => vec![(*holds, &state), (*fails, &state)],
                Exit::Any(targets) => targets.iter().map(|to| (*to, &state)).collect(),
            };
            let handlers: Vec<usize> = self.cfg.blocks[block].catches.iter().flatten().map(|caught| caught.block).collect();
            next.extend(handlers.iter().flat_map(|handler| [(*handler, &start), (*handler, &state)]));
            for (to, given) in next {
                let merged = match &entry[to] {
                    None => given.clone(),
                    Some(known) => merge(known, given),
                };
                if entry[to].as_ref() != Some(&merged) {
                    entry[to] = Some(merged);
                    if !pending.contains(&to) {
                        pending.push_back(to);
                    }
                }
            }
            if block == self.cfg.end || self.cfg.returns.contains(&block) {
                ends.push(state);
            }
        }
        self.settle(&ends);
        self
    }

    /// The parameters that end up holding more than they were handed, unless the body assigns them.
    fn settle(&mut self, ends: &[State]) {
        let assigned = self.assigned();
        for (position, (name, start)) in self.parameters.iter().enumerate() {
            let end = ends.iter().filter_map(|state| state.get(name)).fold(*start, |value, other| value.merge(*other));
            if end != *start && !assigned.contains(name) {
                self.mutated.push((position, end));
            }
        }
    }

    fn assigned(&self) -> HashSet<String> {
        let mut found = HashSet::new();
        for block in &self.cfg.blocks {
            for step in &block.steps {
                let left = step.child_by_field_name("left").filter(|_| step.kind() == "assignment_expression");
                found.extend(left.filter(|left| left.kind() == "identifier").map(|left| self.context().text(left).to_string()));
            }
        }
        found
    }

    /// What an expression evaluated in the body holds, the worst over the copies of a `finally` body.
    pub fn value(&self, node: Node) -> Value {
        let node = unwrap(node);
        if node.kind() == "array_initializer" {
            return named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).fold(Value::SAFE, |value, part| value.merge(self.value(part)));
        }
        let found = self.values.iter().filter(|((id, _), _)| *id == node.id()).map(|(_, value)| *value);
        found.reduce(Value::merge).unwrap_or(Value::UNKNOWN)
    }

    pub fn get(&self, node: Node, copy: usize) -> Value {
        let node = unwrap(node);
        if node.kind() == "array_initializer" {
            return named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).fold(Value::SAFE, |value, part| value.merge(self.get(part, copy)));
        }
        self.values.get(&(node.id(), copy)).copied().unwrap_or(Value::UNKNOWN)
    }

    /// Whether a call that the table says spoils its arguments makes this one unknown: an object that is not a
    /// string, a boxed primitive or an array.
    pub fn spoilable(&self, argument: Node) -> bool {
        let mut argument = unwrap(argument);
        while argument.kind() == "cast_expression"
            && let Some(inner) = argument.child_by_field_name("value")
        {
            argument = unwrap(inner);
        }
        let kind = self.context().resolver.type_of(argument);
        !kind.is_some_and(|kind| is_fixed(&kind) || matches!(kind, Type::Array(_)))
    }

    /// Makes the locals handed to a call unknown when the call may change what they hold; gives their places.
    pub fn spoil(&self, arguments: &[Node], state: &mut State) -> Vec<usize> {
        let resolver = self.context().resolver;
        let mut spoiled = Vec::new();
        for (position, argument) in arguments.iter().enumerate() {
            let argument = unwrap(*argument);
            if argument.kind() != "identifier" || resolver.type_of(argument).is_some_and(|kind| is_fixed(&kind)) {
                continue;
            }
            if let Some(Binding::Local(_)) = resolver.binding(argument, self.context().text(argument)) {
                state.insert(self.context().text(argument).to_string(), Value::UNKNOWN);
                spoiled.push(position);
            }
        }
        spoiled
    }

    fn local(&self, node: Node) -> Option<String> {
        let node = unwrap(node);
        let name = self.context().text(node);
        let local = node.kind() == "identifier" && matches!(self.context().resolver.binding(node, name), Some(Binding::Local(_)));
        local.then(|| name.to_string())
    }

    /// The local a call on `node` changes: the local itself, or the one at the start of a chain of such calls.
    pub fn target(&self, node: Node) -> Option<String> {
        let node = unwrap(node);
        if node.kind() == "method_invocation" && calls::mutates(self, node) {
            return node.child_by_field_name("object").and_then(|object| self.target(object));
        }
        self.local(node)
    }

    fn name(&self, node: Node, state: &State) -> Value {
        let context = self.context();
        match context.resolver.binding(node, context.text(node)) {
            Some(Binding::Local(_)) => state.get(context.text(node)).copied().unwrap_or(Value::UNKNOWN),
            Some(Binding::Field(_, info, field)) => self.field(&info.name, constant(context, node, field), field.flags, context.text(node)),
            None => Value::UNKNOWN,
        }
    }

    fn field(&self, class: &str, constant: bool, flags: u32, name: &str) -> Value {
        if constant {
            Value::SAFE
        } else if flags & flag::STATIC != 0 {
            statics::value(self, class, name)
        } else {
            Value::UNKNOWN
        }
    }

    fn access(&self, node: Node) -> Value {
        let context = self.context();
        let (Some(object), Some(field)) = (node.child_by_field_name("object"), node.child_by_field_name("field")) else { return Value::UNKNOWN };
        let name = context.text(field);
        match context.resolver.receiver(object) {
            Some(crate::java::types::expr::Receiver::Value(Type::Array(_))) if name == "length" => Value::SAFE,
            Some(crate::java::types::expr::Receiver::Static(owner)) | Some(crate::java::types::expr::Receiver::Value(Type::Class(owner, _))) => {
                match context.resolver.index.field(&owner, name) {
                    Some((info, found)) => self.field(&info.name, constant(context, node, found), found.flags, name),
                    None => Value::UNKNOWN,
                }
            }
            _ => Value::UNKNOWN,
        }
    }

    /// Whether the compiler folds an expression into a constant: literals, constant fields and operators on them.
    fn folded(&self, node: Node) -> bool {
        let node = unwrap(node);
        match node.kind() {
            "string_literal" | "character_literal" | "true" | "false" => true,
            kind if kind.ends_with("_literal") => kind != "null_literal",
            "identifier" | "field_access" => self.context().resolver.constant_field_as(node, true),
            "binary_expression" => ["left", "right"].iter().all(|side| node.child_by_field_name(side).is_some_and(|side| self.folded(side))),
            _ => false,
        }
    }

    fn string_plus(&self, node: Node) -> bool {
        self.context().resolver.type_of(node).is_some_and(|kind| kind.name() == "java.lang.String")
    }

    fn step(&mut self, node: Node<'a>, copy: usize, state: &mut State) {
        let context = self.context();
        let operator = node.child_by_field_name("operator").map(|operator| context.text(operator).to_string()).unwrap_or_default();
        let value = match node.kind() {
            "variable_declarator" => {
                let value = node.child_by_field_name("value").map_or(Value::SAFE, |value| self.get(value, copy));
                state.extend(node.child_by_field_name("name").map(|name| (context.text(name).to_string(), value)));
                return;
            }
            "enhanced_for_statement" => {
                let value = node.child_by_field_name("value").map_or(Value::UNKNOWN, |value| self.get(value, copy));
                state.extend(node.child_by_field_name("name").map(|name| (context.text(name).to_string(), value)));
                return;
            }
            "catch_formal_parameter" => {
                state.extend(node.child_by_field_name("name").map(|name| (context.text(name).to_string(), Value::UNKNOWN)));
                return;
            }
            "return_statement" => {
                let returned = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"));
                if let Some(returned) = returned {
                    self.returned = self.returned.merge(self.get(returned, copy));
                }
                return;
            }
            "identifier" => self.name(node, state),
            "this" | "super" => self.this,
            "field_access" => self.access(node),
            "string_literal" | "text_block" | "character_literal" | "null_literal" | "class_literal" | "true" | "false" => Value::SAFE,
            kind if kind.ends_with("_literal") => Value::SAFE,
            "parenthesized_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")).map_or(Value::UNKNOWN, |inner| self.get(inner, copy)),
            "cast_expression" => node.child_by_field_name("value").map_or(Value::UNKNOWN, |value| self.get(value, copy)),
            "array_access" => node.child_by_field_name("array").map_or(Value::UNKNOWN, |array| self.get(array, copy)),
            "array_creation_expression" => children(node).into_iter().find(|part| part.kind() == "array_initializer").map_or(Value::SAFE, |given| self.get(given, copy)),
            "ternary_expression" => ["consequence", "alternative"].iter().filter_map(|arm| node.child_by_field_name(arm)).fold(Value::SAFE, |value, arm| value.merge(self.get(arm, copy))),
            "switch_expression" => {
                let results = self.cfg.results.get(&node.id()).cloned().unwrap_or_default();
                results.into_iter().fold(Value::SAFE, |value, result| value.merge(self.get(result, copy)))
            }
            "binary_expression" => match operator.as_str() {
                "+" if self.string_plus(node) => if self.folded(node) { Value::SAFE } else { Value::UNKNOWN },
                "+" | "-" | "*" | "/" | "%" | "&" | "|" | "^" | "<<" | ">>" | ">>>" => {
                    let side = |field: &str| node.child_by_field_name(field).map_or(Value::SAFE, |side| self.get(side, copy));
                    side("left").merge(side("right"))
                }
                _ => Value::SAFE,
            },
            "unary_expression" => node.child_by_field_name("operand").map_or(Value::SAFE, |operand| self.get(operand, copy)),
            "instanceof_expression" => {
                let tested = node.child_by_field_name("left").map_or(Value::UNKNOWN, |left| self.get(left, copy));
                let bound = node.child_by_field_name("name").or_else(|| children(node).into_iter().find(|part| part.kind() == "identifier" && Some(*part) != node.child_by_field_name("left")));
                state.extend(bound.map(|name| (context.text(name).to_string(), tested)));
                Value::SAFE
            }
            "update_expression" => Value::SAFE,
            "assignment_expression" => self.assign(node, &operator, copy, state),
            "method_invocation" => calls::invoke(self, node, copy, state),
            "object_creation_expression" => calls::create(self, node, copy, state),
            _ => Value::UNKNOWN,
        };
        self.values.insert((node.id(), copy), value);
    }

    fn assign(&mut self, node: Node<'a>, operator: &str, copy: usize, state: &mut State) -> Value {
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return Value::UNKNOWN };
        let given = self.get(right, copy);
        let value = match operator {
            "=" => given,
            "+=" if self.string_plus(left) => Value::UNKNOWN,
            _ => self.get(left, copy).merge(given),
        };
        let context = self.context();
        let left = unwrap(left);
        match left.kind() {
            "identifier" => match context.resolver.binding(left, context.text(left)) {
                Some(Binding::Local(_)) => {
                    let value = if operator == "=" { value } else { state.get(context.text(left)).copied().unwrap_or(Value::UNKNOWN).merge(value) };
                    state.insert(context.text(left).to_string(), value);
                }
                Some(Binding::Field(_, info, field)) if field.flags & flag::STATIC != 0 && info.name == self.own => {
                    self.stores.push((field.name.clone(), value));
                }
                _ => {}
            },
            "field_access" => {
                let named = left.child_by_field_name("field").map(|field| context.text(field).to_string()).unwrap_or_default();
                let receiver = left.child_by_field_name("object").and_then(|object| context.resolver.receiver(object));
                let static_own = matches!(&receiver, Some(crate::java::types::expr::Receiver::Static(owner)) if owner == self.own);
                if static_own {
                    self.stores.push((named, value));
                }
            }
            "array_access" => {
                if let Some(array) = left.child_by_field_name("array").and_then(|array| self.local(array)) {
                    let held = state.get(&array).copied().unwrap_or(Value::UNKNOWN);
                    state.insert(array, held.merge(value));
                }
            }
            _ => {}
        }
        value
    }
}

/// A field the compiler reads as a constant: a static constant, or a `final` field set to a constant string or
/// number where it is declared.
fn constant(context: &Context, node: Node, field: &crate::java::types::model::Field) -> bool {
    let fixed = field.flags & flag::FINAL != 0 && (field.constant.is_some() || field.number.is_some());
    fixed || context.resolver.constant_field_as(node, true)
}

pub fn merge(a: &State, b: &State) -> State {
    let mut merged = a.clone();
    for (name, value) in b {
        merged.entry(name.clone()).and_modify(|known| *known = known.merge(*value)).or_insert(*value);
    }
    merged
}
