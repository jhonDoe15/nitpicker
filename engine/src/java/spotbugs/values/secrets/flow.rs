//! Follows hard-coded values through the methods of one class in the order ConstantPasswordDetector visits them, and
//! reports hard-coded arguments of the calls of `sinks.tsv`. What is hard-coded, as the lab runs show:
//! - string constants (folded by the compiler), and `trim()`, `toString()` or `intern()` of one; a string field the
//!   summary of its stores gives a constant or `null` for (`fields`);
//! - `toCharArray()`, `getBytes()` or `getBytes(String)` of a constant or of `null`;
//! - a non-empty `char[]` or `byte[]` written out with constant elements, a `BigInteger` made from hard-coded
//!   values, and a field of such a type after the class stored one in it;
//! - a local is hard-coded when every path into it gives a hard-coded value; `c ? a : b` is the same constant on
//!   both sides for a string, and what `b` is for an array.
use super::fields::{Summaries, field_of};
use super::{Hard, Held, Kind, Origin};
use crate::engine::source::{children, named_children};
use crate::java::flow::cfg::{self, Exit, unwrap};
use crate::java::helpers::has_modifier;
use crate::java::spotbugs::{Context, place};
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use std::collections::{HashMap, HashSet, VecDeque};
use tree_sitter::Node;

pub type State = HashMap<String, Held>;
pub type Values = HashMap<(usize, usize), Held>;

pub struct Visit<'c, 'a> {
    pub context: &'c Context<'a>,
    summaries: &'c Summaries,
    marked: Vec<(String, String, Kind)>,
    lambdas: VecDeque<Node<'a>>,
    pub reported: HashSet<usize>,
}

/// Visits a class; gives the fields it stored hard-coded arrays or numbers in.
pub fn visit<'a>(context: &Context<'a>, summaries: &Summaries, _own: &str, class: Node<'a>) -> Vec<(String, String, Kind)> {
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return Vec::new() };
    let interface = matches!(class.kind(), "interface_declaration" | "annotation_type_declaration");
    let members = place::members(body);
    let statics = |member: &Node| match member.kind() {
        "field_declaration" => interface || has_modifier(*member, "static"),
        "constant_declaration" | "static_initializer" => true,
        _ => false,
    };
    let instance: Vec<Node> = members.iter().copied().filter(|member| !statics(member) && matches!(member.kind(), "field_declaration" | "block")).collect();
    let mut visit = Visit { context, summaries, marked: Vec::new(), lambdas: VecDeque::new(), reported: HashSet::new() };
    for member in members.iter().filter(|member| statics(member)) {
        visit.initializer(*member);
    }
    let creates = |member: &Node| member.kind().ends_with("constructor_declaration");
    if !interface && !members.iter().any(creates) {
        instance.iter().for_each(|part| visit.initializer(*part));
    }
    for member in &members {
        if creates(member) && !super::super::super::classes::lines::delegates(*member) {
            instance.iter().for_each(|part| visit.initializer(*part));
        }
        if creates(member) || member.kind() == "method_declaration" {
            if let Some(code) = member.child_by_field_name("body") {
                visit.run(code);
            }
        }
    }
    while let Some(lambda) = visit.lambdas.pop_front() {
        if let Some(code) = lambda.child_by_field_name("body") {
            visit.run(code);
        }
    }
    visit.marked
}

impl<'c, 'a> Visit<'c, 'a> {
    fn initializer(&mut self, member: Node<'a>) {
        if matches!(member.kind(), "block" | "static_initializer") {
            let code = if member.kind() == "block" { Some(member) } else { children(member).into_iter().find(|part| part.kind() == "block") };
            if let Some(code) = code {
                self.run(code);
            }
            return;
        }
        let declared = member.child_by_field_name("type").and_then(|written| self.context.resolver.type_node(written));
        for declarator in children(member).into_iter().filter(|part| part.kind() == "variable_declarator") {
            let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { continue };
            let held = if value.kind() == "array_initializer" { self.array(value, declared.as_ref()) } else { self.run(value).unwrap_or(Held::NO) };
            if let Some((class, field, _, _)) = field_of(self.context, name) {
                self.store(class, field, &held);
            }
        }
    }

    fn store(&mut self, class: String, name: String, held: &Held) {
        if let Hard::Marked(kind) = held.hard
            && !self.marked.iter().any(|(known, field, _)| *known == class && *field == name)
        {
            self.marked.push((class, name, kind));
        }
    }

    /// Works out a body until nothing changes, then goes through it once more to report and to mark fields. Gives
    /// the value of the body when it is an expression.
    fn run(&mut self, body: Node<'a>) -> Option<Held> {
        let cfg = cfg::build(self.context.file, body, &|_| false);
        let blocks = cfg.blocks.len();
        let mut entry: Vec<Option<State>> = vec![None; blocks];
        entry[0] = Some(State::new());
        let mut values = HashMap::new();
        let mut pending = VecDeque::from([0]);
        let mut rounds = 0;
        while let Some(block) = pending.pop_front() {
            rounds += 1;
            if rounds > blocks * 40 + 100 {
                break;
            }
            let Some(mut state) = entry[block].clone() else { continue };
            let start = state.clone();
            for step in cfg.blocks[block].steps.clone() {
                self.step(step, cfg.blocks[block].copy, &mut state, &mut values, false);
            }
            let mut next: Vec<(usize, &State)> = match &cfg.blocks[block].exit {
                Exit::End => Vec::new(),
                Exit::Jump(to) => vec![(*to, &state)],
                Exit::Branch(_, holds, fails) => vec![(*holds, &state), (*fails, &state)],
                Exit::Any(targets) => targets.iter().map(|to| (*to, &state)).collect(),
            };
            let handlers: Vec<usize> = cfg.blocks[block].catches.iter().flatten().map(|caught| caught.block).collect();
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
        }
        for (block, known) in entry.iter().enumerate() {
            let Some(mut state) = known.clone() else { continue };
            for step in cfg.blocks[block].steps.clone() {
                self.step(step, cfg.blocks[block].copy, &mut state, &mut values, true);
            }
        }
        values.iter().find(|((id, _), _)| *id == unwrap(body).id()).map(|(_, held)| held.clone())
    }

    fn step(&mut self, node: Node<'a>, copy: usize, state: &mut State, values: &mut Values, effects: bool) {
        let context = self.context;
        let get = |values: &Values, node: Node| values.get(&(unwrap(node).id(), copy)).cloned().unwrap_or(Held::NO);
        let held = match node.kind() {
            "variable_declarator" => {
                let declared = node.parent().and_then(|parent| parent.child_by_field_name("type")).and_then(|written| context.resolver.type_node(written));
                let value = node.child_by_field_name("value");
                let held = match value {
                    Some(value) if value.kind() == "array_initializer" => self.array(value, declared.as_ref()),
                    Some(value) => get(values, value),
                    None => Held::NO,
                };
                state.extend(node.child_by_field_name("name").map(|name| (context.text(name).to_string(), held)));
                return;
            }
            "enhanced_for_statement" | "catch_formal_parameter" => {
                state.extend(node.child_by_field_name("name").map(|name| (context.text(name).to_string(), Held::NO)));
                return;
            }
            "identifier" => match context.resolver.binding(node, context.text(node)) {
                Some(Binding::Local(_)) => state.get(context.text(node)).cloned().unwrap_or(Held::NO),
                _ => self.read(node),
            },
            "field_access" => self.read(node),
            "string_literal" | "text_block" => Held::plain(Hard::Text(context.resolver.constant_string(node))),
            "null_literal" => Held::plain(Hard::Null),
            "parenthesized_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")).map_or(Held::NO, |inner| get(values, inner)),
            "cast_expression" => node.child_by_field_name("value").map_or(Held::NO, |value| get(values, value)),
            "binary_expression" => constant(context, node).map_or(Held::NO, |text| Held::plain(Hard::Text(Some(text)))),
            "ternary_expression" => {
                let arm = |name: &str| node.child_by_field_name(name).map_or(Held::NO, |arm| get(values, arm));
                match (arm("consequence"), arm("alternative")) {
                    (Held { hard: Hard::Text(one), .. }, Held { hard: Hard::Text(two), origin }) if one == two && one.is_some() => Held { hard: Hard::Text(two), origin },
                    (Held { hard: Hard::Text(_), .. }, _) | (_, Held { hard: Hard::Text(_), .. }) => Held::NO,
                    (_, alternative) => alternative,
                }
            }
            "array_creation_expression" => {
                let declared = node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).map(|element| Type::Array(Box::new(element)));
                children(node).into_iter().find(|part| part.kind() == "array_initializer").map_or(Held::NO, |given| self.array(given, declared.as_ref()))
            }
            "assignment_expression" => {
                let operator = node.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or("=");
                let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
                let held = if operator == "=" { get(values, right) } else { Held::NO };
                let left = unwrap(left);
                match context.resolver.binding(left, context.text(left)) {
                    Some(Binding::Local(_)) if left.kind() == "identifier" => {
                        state.insert(context.text(left).to_string(), held.clone());
                    }
                    _ if effects => {
                        if let Some((class, name, _, _)) = field_of(context, left) {
                            self.store(class, name, &held);
                        }
                    }
                    _ => {}
                }
                held
            }
            "method_invocation" => self.call(node, copy, values, effects),
            "object_creation_expression" => self.create(node, copy, values, effects),
            "lambda_expression" => {
                if effects {
                    self.lambdas.push_back(node);
                }
                Held::NO
            }
            _ => Held::NO,
        };
        values.insert((node.id(), copy), held);
    }

    /// A field read: a constant the compiler puts in place, the summary of a string field, or a hard-coded array or
    /// number the class stored before.
    fn read(&self, node: Node) -> Held {
        let context = self.context;
        if let Some(text) = context.resolver.constant_string(node) {
            return Held::plain(Hard::Text(Some(text)));
        }
        let Some((class, name, kind, flags)) = field_of(context, node) else { return Held::NO };
        let marked = self.marked.iter().find(|(known, field, _)| *known == class && *field == name).map(|(_, _, kind)| Hard::Marked(*kind));
        let hard = match marked {
            Some(hard) => hard,
            None if matches!(kind, Type::Primitive(_)) => Hard::No,
            None => self.summaries.read(context, &class, &name, flags),
        };
        Held { hard, origin: Origin::Field(class, name) }
    }

    fn array(&self, initializer: Node, declared: Option<&Type>) -> Held {
        let Some(kind) = declared.and_then(Kind::of).filter(|kind| *kind != Kind::Number) else { return Held::NO };
        let elements: Vec<Node> = named_children(initializer).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
        let fixed = !elements.is_empty() && elements.iter().all(|element| fixed(self.context, *element));
        if fixed { Held::plain(Hard::Marked(kind)) } else { Held::NO }
    }
}

pub fn merge(a: &State, b: &State) -> State {
    let mut merged = a.clone();
    for (name, held) in b {
        merged.entry(name.clone()).and_modify(|known| *known = known.merge(held)).or_insert_with(|| held.clone());
    }
    merged
}

/// A string expression the compiler folds, with its value; a number joined to a string keeps its source text.
fn constant(context: &Context, node: Node) -> Option<String> {
    if let Some(text) = context.resolver.constant_string(node) {
        return Some(text);
    }
    let string = context.resolver.type_of(node).is_some_and(|kind| kind.name() == "java.lang.String");
    (string && fixed(context, node)).then(|| context.text(node).to_string())
}

/// Whether an expression is a constant: literals, constant fields, and operators and casts on them.
fn fixed(context: &Context, node: Node) -> bool {
    let node = unwrap(node);
    match node.kind() {
        "null_literal" => false,
        kind if kind.ends_with("_literal") || kind == "text_block" => true,
        "identifier" | "field_access" => context.resolver.constant_field_as(node, true),
        "unary_expression" => node.child_by_field_name("operand").is_some_and(|operand| fixed(context, operand)),
        "cast_expression" => node.child_by_field_name("value").is_some_and(|value| fixed(context, value)),
        "binary_expression" => ["left", "right"].iter().all(|side| node.child_by_field_name(side).is_some_and(|side| fixed(context, side))),
        _ => false,
    }
}
