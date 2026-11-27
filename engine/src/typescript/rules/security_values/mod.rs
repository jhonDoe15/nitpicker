//! `security-values.mts` and `constant-resolution.mts` of the ESLint plugin: `const` initializers, object
//! properties through spreads and the leaf values an expression can take, each name found the way ESLint's
//! `findVariable` finds it, along the scope chain.
pub mod leaves;

use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
pub use crate::typescript::rules::writes::syntax::{member_name, static_key, string_value, unwrapped};

const MAX_RESOLVE_DEPTH: usize = 8;
const SPREAD_ROUNDS: usize = 8;
const FREEZE_STEPS: usize = 64;
const ASSERTIONS: &[&str] = &["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion"];
const FUNCTIONS: [&str; 3] = ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"];

/// `findVariable(...)?.defs`: the definitions of the variable a name has where the node is.
pub fn defs<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Vec<Def<'s>> {
    let Some(name) = identifier.name() else { return Vec::new() };
    scopes.variable_by_name(&name, identifier.start()).map(|variable| scopes.defs(variable)).unwrap_or_default()
}

/// `isFunctionNode`.
pub fn is_function_node(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

/// `isLiteral(node, true)`.
pub fn is_true(node: Node) -> bool {
    node.is("Literal") && node.get("value") == Value::Bool(true)
}

/// `isLiteral(node, text)` for a string.
pub fn is_text(node: Node, text: &str) -> bool {
    node.is("Literal") && matches!(node.get("value"), Value::Text(..)) && node.text("value").as_deref() == Some(text)
}

/// `callName`: the callee's name, or the name of the member it calls.
pub fn call_name(call: Node) -> Option<String> {
    let callee = unwrapped(call.node("callee")?);
    if callee.is("Identifier") {
        return callee.name().map(|name| name.into_owned());
    }
    if callee.is("MemberExpression") { member_name(callee) } else { None }
}

fn constant_initializer<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, depth: usize) -> Option<Node<'s>> {
    if !node.is("Identifier") || depth > MAX_RESOLVE_DEPTH {
        return None;
    }
    let definitions = defs(scopes, node);
    let [definition] = definitions.as_slice() else { return None };
    let constant = definition.kind == DefKind::Variable
        && definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const")
        && definition.node.node("id").is_some_and(|id| id.is("Identifier"));
    if constant { definition.node.node("init") } else { None }
}

/// `resolveConstant`: follows `const` identifiers to their initializers, looking through type assertions.
pub fn resolve_constant<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    let mut chain = vec![unwrap(node?, ASSERTIONS)];
    let mut index = 0;
    while index < chain.len() {
        if let Some(next) = constant_initializer(scopes, chain[index], index) {
            chain.push(unwrap(next, ASSERTIONS));
        }
        index += 1;
    }
    chain.last().copied()
}

fn constant_value<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    resolve_constant(scopes, node.map(unwrapped)).map(unwrapped)
}

fn is_freeze(node: Node) -> bool {
    let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"));
    callee.is_some_and(|callee| {
        let object = callee.node("object");
        object.is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("Object"))
            && member_name(callee).as_deref() == Some("freeze")
    })
}

/// `resolvedValue`: the constant an expression names, through `Object.freeze(...)`.
pub fn resolved_value<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    let mut current = constant_value(scopes, node)?;
    for _ in 0..FREEZE_STEPS {
        if !is_freeze(current) {
            break;
        }
        match constant_value(scopes, current.nodes("arguments").first().copied()) {
            Some(next) => current = next,
            None => break,
        }
    }
    Some(current)
}

fn object_properties<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Vec<Node<'s>>> {
    resolved_value(scopes, node).filter(|object| object.is("ObjectExpression")).map(|object| object.nodes("properties"))
}

/// `flattenedProperties`: the entries of an object constant, spreads of object constants expanded eight levels.
pub fn flattened_properties<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Vec<Node<'s>> {
    let mut entries = object_properties(scopes, node).unwrap_or_default();
    for _ in 0..SPREAD_ROUNDS {
        entries = entries
            .into_iter()
            .flat_map(|entry| {
                let spread = if entry.is("SpreadElement") { object_properties(scopes, entry.node("argument")) } else { None };
                spread.unwrap_or_else(|| vec![entry])
            })
            .collect();
    }
    entries
}

/// `propertyNamed`: the value of the last property of that name in an object constant.
pub fn property_named<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>, name: &str) -> Option<Node<'s>> {
    let entries = flattened_properties(scopes, node);
    let found = entries.into_iter().filter(|entry| entry.is("Property")).rfind(|entry| static_key(*entry).as_deref() == Some(name));
    found.and_then(|entry| entry.node("value"))
}
