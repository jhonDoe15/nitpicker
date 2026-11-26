//! `analysis/constant-resolution.mts`: constants, constant numbers and local functions, resolved through scopes.
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

const MAX_RESOLVE_DEPTH: usize = 8;
const TYPE_WRAPPERS: [&str; 4] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion"];
const FUNCTIONS: [&str; 3] = ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"];

pub struct Env<'a, 's> {
    pub scopes: &'s Scopes<'a, 's>,
    pub source: &'a str,
}

impl Clone for Env<'_, '_> {
    fn clone(&self) -> Self {
        *self
    }
}

impl Copy for Env<'_, '_> {}

/// The only definition of the variable an identifier names.
pub fn single_def<'a, 's>(env: Env<'a, 's>, identifier: Node<'s>) -> Option<Def<'s>> {
    let symbol = env.scopes.variable_named(identifier)?;
    let mut defs = env.scopes.defs(symbol);
    if defs.len() == 1 { defs.pop() } else { None }
}

fn is_const(definition: &Def) -> bool {
    definition.kind == DefKind::Variable
        && definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const")
}

/// The initializer of a `const` with a plain identifier as its name.
pub fn const_init<'a, 's>(env: Env<'a, 's>, identifier: Node<'s>) -> Option<Node<'s>> {
    let definition = single_def(env, identifier).filter(is_const)?;
    definition.node.node("id").filter(|id| id.is("Identifier"))?;
    definition.node.node("init")
}

fn unwrap_types(node: Node) -> Node {
    let mut current = node;
    while TYPE_WRAPPERS.contains(&current.kind()) {
        let Some(inner) = current.node("expression") else { break };
        current = inner;
    }
    current
}

pub fn resolve_constant<'a, 's>(env: Env<'a, 's>, node: Option<Node<'s>>, depth: usize) -> Option<Node<'s>> {
    let mut chain: Vec<Option<Node<'s>>> = vec![node.map(unwrap_types)];
    let mut at = 0;
    while at < chain.len() {
        let next = chain[at]
            .filter(|current| current.is("Identifier") && depth + chain.len() - 1 <= MAX_RESOLVE_DEPTH)
            .and_then(|current| const_init(env, current));
        if let Some(next) = next {
            chain.push(Some(unwrap_types(next)));
        }
        at += 1;
    }
    chain.last().copied().flatten()
}

pub fn is_function_node(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

/// The function an identifier names: a function declaration, or a `const` holding a function.
pub fn resolve_function<'a, 's>(env: Env<'a, 's>, node: Node<'s>) -> Option<Node<'s>> {
    if !node.is("Identifier") {
        return None;
    }
    let definition = single_def(env, node)?;
    if definition.kind == DefKind::FunctionName {
        return Some(definition.node);
    }
    if is_const(&definition) {
        return definition.node.node("init").filter(|init| is_function_node(*init));
    }
    None
}

struct Entry<'s> {
    node: Option<Node<'s>>,
    depth: usize,
    parent: Option<usize>,
}

fn operand_nodes<'s>(node: Option<Node<'s>>) -> Vec<Node<'s>> {
    let Some(node) = node else { return Vec::new() };
    let operator = node.text("operator");
    if node.is("UnaryExpression") && matches!(operator.as_deref(), Some("-" | "+")) {
        return node.node("argument").into_iter().collect();
    }
    if node.is("BinaryExpression") && matches!(operator.as_deref(), Some("*" | "+" | "-" | "/")) {
        return node.node("left").into_iter().chain(node.node("right")).collect();
    }
    Vec::new()
}

fn numeric_value(node: Option<Node>, operands: &[Option<f64>]) -> Option<f64> {
    let node = node?;
    if node.is("Literal")
        && let Value::Number(value) = node.get("value")
    {
        return Some(value);
    }
    let numbers: Vec<f64> = operands.iter().flatten().copied().collect();
    let left = *numbers.first()?;
    if numbers.len() < operands.len() {
        return None;
    }
    if node.is("UnaryExpression") {
        return Some(if node.text("operator").as_deref() == Some("-") { -left } else { left });
    }
    let right = *numbers.get(1)?;
    if !node.is("BinaryExpression") {
        return None;
    }
    match node.text("operator").as_deref() {
        Some("*") => Some(left * right),
        Some("+") => Some(left + right),
        Some("-") => Some(left - right),
        Some("/") => Some(left / right),
        _ => None,
    }
}

pub fn constant_number<'a, 's>(env: Env<'a, 's>, node: Option<Node<'s>>) -> Option<f64> {
    let entry = |node: Option<Node<'s>>, depth: usize, parent: Option<usize>| Entry {
        node: if depth > MAX_RESOLVE_DEPTH { None } else { resolve_constant(env, node, 0) },
        depth,
        parent,
    };
    let mut entries = vec![entry(node, 0, None)];
    let mut at = 0;
    while at < entries.len() {
        let depth = entries[at].depth + 1;
        for operand in operand_nodes(entries[at].node) {
            entries.push(entry(Some(operand), depth, Some(at)));
        }
        at += 1;
    }
    let mut values: Vec<Option<f64>> = vec![None; entries.len()];
    for at in (0..entries.len()).rev() {
        let children = entries.iter().enumerate().filter(|(_, candidate)| candidate.parent == Some(at));
        let operands: Vec<Option<f64>> = children.map(|(index, _)| values[index]).collect();
        values[at] = numeric_value(entries[at].node, &operands);
    }
    values[0]
}
