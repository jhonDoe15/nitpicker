//! `row-callbacks.mts`: a synchronous callback over one or two rows (and an accumulator) whose returned expression
//! reads nothing but the rows' fields. Without type information every field counts as a column.
pub mod fields;

use crate::typescript::rules::queries::js_patterns::member_name;
use crate::typescript::rules::security_values::{static_key, unwrapped};
use crate::typescript::rules::support::view::Node;
use fields::{Bound, FIELD_METHODS, is_field, root_of};

const MEMBERSHIP_METHODS: [&str; 2] = ["includes", "has"];
const SIDE_EFFECTS: [&str; 2] = ["delete", "typeof"];

#[derive(Clone, Copy)]
pub struct ReadOptions {
    pub rows: usize,
    pub accumulator: bool,
}

#[derive(Default)]
struct State {
    fields: usize,
    valid: bool,
}

struct Work<'s, 'b> {
    bound: &'b Bound,
    states: Vec<State>,
    entries: Vec<(Option<Node<'s>>, usize)>,
    probes: Vec<(usize, usize)>,
}

impl<'s> Work<'s, '_> {
    fn invalid(&mut self, state: usize) {
        self.states[state].valid = false;
    }

    fn field(&mut self, state: usize) {
        self.states[state].fields += 1;
    }

    fn queue(&mut self, nodes: impl IntoIterator<Item = Option<Node<'s>>>, state: usize) {
        self.entries.extend(nodes.into_iter().map(|node| (node, state)));
    }

    fn identifier(&mut self, node: Node<'s>, state: usize) {
        if is_field(node, self.bound) {
            self.field(state);
        } else if node.name().is_some_and(|name| self.bound.is_element(&name)) {
            self.invalid(state);
        }
    }

    fn member(&mut self, node: Node<'s>, state: usize) {
        let rooted = root_of(node);
        if is_field(node, self.bound) {
            self.field(state);
        } else if rooted.root.is("Identifier") && rooted.root.name().is_some_and(|name| self.bound.is_element(&name)) {
            self.invalid(state);
            return;
        }
        let keys: Vec<Option<Node<'s>>> = rooted.chain.iter().filter(|step| step.flag("computed")).map(|step| step.node("property")).collect();
        self.queue(keys, state);
        if !rooted.root.is("Identifier") {
            self.queue([Some(rooted.root)], state);
        }
    }

    fn probe(&mut self, state: usize, node: Option<Node<'s>>) {
        self.states.push(State { fields: 0, valid: true });
        let probe = self.states.len() - 1;
        self.probes.push((probe, state));
        self.queue([node], probe);
    }

    fn call(&mut self, node: Node<'s>, state: usize) {
        let member = node.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"));
        let method = member.and_then(member_name);
        let field = member.filter(|_| method.is_some()).and_then(|member| member.node("object")).is_some_and(|object| is_field(object, self.bound));
        let named = |names: &[&str]| method.as_deref().is_some_and(|method| names.contains(&method));
        if field && named(&FIELD_METHODS) {
            self.field(state);
        } else if member.is_some() && named(&MEMBERSHIP_METHODS) {
            self.probe(state, member.and_then(|member| member.node("object")));
        } else {
            self.invalid(state);
            return;
        }
        self.queue(node.nodes("arguments").into_iter().map(Some), state);
    }

    fn property(&mut self, node: Node<'s>, state: usize) {
        if node.is("SpreadElement") {
            self.queue([node.node("argument")], state);
        } else if node.flag("computed") {
            self.queue([node.node("key"), node.node("value")], state);
        } else {
            self.queue([node.node("value")], state);
        }
    }

    fn visit(&mut self, node: Option<Node<'s>>, state: usize) {
        let Some(target) = node.map(unwrapped) else { return self.invalid(state) };
        match target.kind() {
            "Literal" | "ThisExpression" => {}
            "Identifier" => self.identifier(target, state),
            "MemberExpression" => self.member(target, state),
            "CallExpression" => self.call(target, state),
            "BinaryExpression" | "LogicalExpression" => self.queue([target.node("left"), target.node("right")], state),
            "ConditionalExpression" => self.queue([target.node("test"), target.node("consequent"), target.node("alternate")], state),
            "UnaryExpression" => {
                if target.text("operator").is_some_and(|operator| SIDE_EFFECTS.contains(&operator.as_ref())) {
                    self.invalid(state);
                }
                self.queue([target.node("argument")], state);
            }
            "TemplateLiteral" => self.queue(target.nodes("expressions").into_iter().map(Some), state),
            "ArrayExpression" => self.queue(target.list("elements"), state),
            "ObjectExpression" => {
                for property in target.nodes("properties") {
                    self.property(property, state);
                }
            }
            "SpreadElement" => self.queue([target.node("argument")], state),
            _ => self.invalid(state),
        }
    }
}

fn bind_pattern(pattern: Node, bound: &mut Bound) -> bool {
    if pattern.is("Identifier") {
        bound.elements.extend(pattern.name().map(|name| name.into_owned()));
        return true;
    }
    if !pattern.is("ObjectPattern") {
        return false;
    }
    pattern.nodes("properties").into_iter().all(|property| {
        let key = static_key(property);
        let value = property.node("value").filter(|value| property.is("Property") && value.is("Identifier"));
        let (Some(_), Some(value)) = (key, value) else { return false };
        bound.destructured.extend(value.name().map(|name| name.into_owned()));
        true
    })
}

/// `returnedExpression`: an arrow's expression body, or the argument of a body that is one `return`.
pub fn returned_expression(function: Node) -> Option<Node> {
    let body = function.node("body")?;
    if !body.is("BlockStatement") {
        return Some(body);
    }
    let statements = body.nodes("body");
    let [only] = statements.as_slice() else { return None };
    if only.is("ReturnStatement") { only.node("argument") } else { None }
}

/// `readsOnlyFields`.
pub fn reads_only_fields(node: Option<Node>, options: ReadOptions) -> bool {
    let Some(function) = node.map(unwrapped).filter(|function| function.is("ArrowFunctionExpression") || function.is("FunctionExpression")) else { return false };
    if function.flag("async") || function.flag("generator") {
        return false;
    }
    let params = function.nodes("params");
    let leading = usize::from(options.accumulator);
    let mut bound = Bound::default();
    let rows_bound = params.len() == leading + options.rows && params[leading..].iter().all(|param| bind_pattern(*param, &mut bound));
    let Some(body) = returned_expression(function).filter(|_| rows_bound) else { return false };
    if options.accumulator && !params.first().is_some_and(|first| first.is("Identifier")) {
        return false;
    }
    let mut work = Work { bound: &bound, states: vec![State { fields: 0, valid: true }], entries: vec![(Some(body), 0)], probes: Vec::new() };
    let mut index = 0;
    while index < work.entries.len() {
        let (node, state) = work.entries[index];
        work.visit(node, state);
        index += 1;
    }
    for (probe, owner) in work.probes.clone().into_iter().rev() {
        if work.states[probe].fields > 0 || !work.states[probe].valid {
            work.invalid(owner);
        }
    }
    work.states[0].valid && work.states[0].fields > 0
}
