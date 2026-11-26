//! The questions the rule asks about a catch clause, a logger call and the caught value, in the order of the JS rule.
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use oxc_semantic::SymbolId;
use std::collections::{HashMap, HashSet};

pub const ERROR_FIELD: &str = "err-field";
const LOG_METHODS: [&str; 6] = ["trace", "debug", "info", "warn", "error", "fatal"];

pub struct Catch<'v> {
    pub variables: Vec<SymbolId>,
    pub caught: Vec<SymbolId>,
    pub initializers: HashMap<String, Node<'v>>,
}

pub fn is_logger_call(call: Node) -> bool {
    call.node("callee").is_some_and(|callee| {
        callee.is("MemberExpression")
            && !callee.flag("computed")
            && callee.node("property").is_some_and(|property| {
                property.is("Identifier") && property.name().is_some_and(|name| LOG_METHODS.contains(&name.as_ref()))
            })
    })
}

pub fn references_caught(scopes: &Scopes, node: Node, variables: &[SymbolId]) -> bool {
    variables.iter().any(|variable| scopes.references(*variable).iter().any(|reference| node.contains(reference.identifier)))
}

fn unwrap(node: Option<Node>) -> Option<Node> {
    let mut current = node?;
    while matches!(current.kind(), "TSAsExpression" | "TSNonNullExpression" | "TSSatisfiesExpression") {
        match current.node("expression") {
            Some(inner) => current = inner,
            None => return None,
        }
    }
    Some(current)
}

pub fn is_caught_value(scopes: &Scopes, node: Option<Node>, caught: &[SymbolId]) -> bool {
    let Some(inner) = unwrap(node).filter(|inner| inner.is("Identifier")) else { return false };
    caught.iter().any(|variable| scopes.references(*variable).iter().any(|reference| reference.identifier == inner))
}

pub fn has_caught_argument(scopes: &Scopes, call: Node, caught: &[SymbolId]) -> bool {
    call.nodes("arguments").into_iter().any(|argument| {
        is_caught_value(scopes, Some(argument), caught)
            || (argument.is("ObjectExpression")
                && argument
                    .nodes("properties")
                    .into_iter()
                    .any(|property| property.is("Property") && is_caught_value(scopes, property.node("value"), caught)))
    })
}

fn error_property(object: Option<Node>) -> Option<Node> {
    let object = object.filter(|object| object.is("ObjectExpression"))?;
    object.nodes("properties").into_iter().find(|property| {
        property.is("Property")
            && !property.flag("computed")
            && property.node("key").is_some_and(|key| {
                (key.is("Identifier") && key.name().as_deref() == Some("err"))
                    || (key.is("Literal") && is_string(key) && key.text("value").as_deref() == Some("err"))
            })
    })
}

fn is_string(literal: Node) -> bool {
    literal.text("value").is_some() && literal.text("raw").is_some_and(|raw| raw.starts_with(['"', '\'']))
}

fn has_message_argument(call: Node) -> bool {
    call.nodes("arguments").last().is_some_and(|last| (last.is("Literal") && is_string(*last)) || last.is("TemplateLiteral"))
}

pub fn follow<'v>(first: Option<Node<'v>>, initializers: &HashMap<String, Node<'v>>) -> Option<Node<'v>> {
    let mut visited = HashSet::new();
    let mut current = first;
    loop {
        let node = current?;
        let Some(name) = node.name().filter(|_| node.is("Identifier")) else { return Some(node) };
        if !visited.insert(name.to_string()) {
            return Some(node);
        }
        current = initializers.get(name.as_ref()).copied();
    }
}

pub fn has_error_field(scopes: &Scopes, call: Node, state: &Catch) -> bool {
    let arguments = call.nodes("arguments");
    let fields = follow(arguments.first().copied(), &state.initializers);
    let Some(property) = error_property(fields) else { return false };
    let Some(value) = property.node("value") else { return false };
    !value.is("MemberExpression")
        && references_caught(scopes, value, &state.variables)
        && arguments.len() == 2
        && has_message_argument(call)
}
