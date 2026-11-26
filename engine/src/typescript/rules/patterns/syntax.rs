//! The syntax helpers the pattern and replacement rules share: unwrapping, constants, string values, operands.
use crate::typescript::rules::signatures::{name_of, unwrap};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

const WRAPPERS: &[&str] = &["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];
const TYPE_WRAPPERS: &[&str] = &["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion"];
const MAX_RESOLVE_DEPTH: usize = 8;

/// `unwrapped`: the expression under type assertions and optional chains.
pub fn unwrapped(node: Node) -> Node {
    unwrap(node, WRAPPERS)
}

/// `stringValue`: a string literal or a template without placeholders.
pub fn string_value(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Literal") {
        return node.text("value").map(|text| text.into_owned());
    }
    if node.is("TemplateLiteral") && node.nodes("expressions").is_empty() {
        let quasi = node.nodes("quasis").into_iter().next()?;
        return match quasi.get("value") {
            Value::Node(index) => node.view.at(index).text("cooked").map(|text| text.into_owned()),
            _ => None,
        };
    }
    None
}

/// `calleeNameOf`: a called name, or the property of a plain member callee.
pub fn callee_name_of(callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        return name_of(Some(callee));
    }
    (callee.is("MemberExpression") && !callee.flag("computed")).then(|| name_of(callee.node("property"))).flatten()
}

/// `operandsOf`: the operands of a chain of one operator, found level by level.
pub fn operands_of<'v>(root: Node<'v>, operator: &str) -> Vec<Node<'v>> {
    let mut pending = vec![root];
    let mut operands = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        let node = pending[index];
        index += 1;
        let join = (node.is("LogicalExpression") || node.is("BinaryExpression")) && node.text("operator").as_deref() == Some(operator);
        match (join, node.node("left"), node.node("right")) {
            (true, Some(left), Some(right)) => pending.extend([left, right]),
            _ => operands.push(node),
        }
    }
    operands
}

fn unwrap_types(node: Node) -> Node {
    unwrap(node, TYPE_WRAPPERS)
}

fn constant_initializer<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>, depth: usize) -> Option<Node<'v>> {
    if !node.is("Identifier") || depth > MAX_RESOLVE_DEPTH {
        return None;
    }
    let definitions = scopes.defs(scopes.variable_named(node)?);
    let [definition] = definitions.as_slice() else { return None };
    let declaration = definition.node.parent()?;
    let constant = definition.kind == DefKind::Variable
        && declaration.text("kind").as_deref() == Some("const")
        && definition.node.node("id").is_some_and(|id| id.is("Identifier"));
    if constant { definition.node.node("init") } else { None }
}

/// `resolveConstant`: follows `const` identifiers to their initializers, looking through type assertions.
pub fn resolve_constant<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>) -> Node<'v> {
    let mut chain = vec![unwrap_types(node)];
    let mut index = 0;
    while index < chain.len() {
        if let Some(next) = constant_initializer(scopes, chain[index], index) {
            chain.push(unwrap_types(next));
        }
        index += 1;
    }
    chain[chain.len() - 1]
}
