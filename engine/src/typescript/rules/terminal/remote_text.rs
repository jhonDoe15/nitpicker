//! `remote-text.mts` of the ESLint plugin: whether a value is a network response, its body, or text read from a
//! response or a socket message, followed back through `await`, members, readers and declarations.
use crate::typescript::rules::security_values::{defs, member_name, unwrapped};
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{last_name_of, string_value};
use regex::Regex;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Taint {
    Response,
    Body,
    Text,
}

const CLIENTS: [&str; 5] = ["axios", "got", "ky", "needle", "superagent"];
const BODY_PROPERTIES: [&str; 2] = ["data", "body"];
const LIFECYCLE_EVENTS: [&str; 7] = ["open", "close", "error", "connect", "connection", "disconnect", "listening"];
const MAX_DEPTH: usize = 5;
static SOCKET_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:ws|wss|socket|websocket|webSocket|hot|channel|ipc|connection|conn)$|Socket$").expect("pattern"));

/// `plainName`: the name of an identifier or of the property a plain member reads, under type wrappers.
pub fn plain_name(node: Option<Node>) -> String {
    node.and_then(last_name_of).unwrap_or_default()
}

fn has_body_name(name: &str) -> bool {
    BODY_PROPERTIES.contains(&name)
}

enum Step<'v> {
    Reader(String),
    Member(Node<'v>),
    Declared(Node<'v>, Node<'v>),
}

enum Link<'v> {
    Result(Option<Taint>),
    Next(Node<'v>, Step<'v>),
}

fn apply(step: &Step, inner: Option<Taint>) -> Option<Taint> {
    match step {
        Step::Reader(reader) => (inner == Some(Taint::Response)).then(|| if reader == "text" { Taint::Text } else { Taint::Body }),
        Step::Member(member) => {
            let body = inner == Some(Taint::Body)
                || (inner == Some(Taint::Response) && has_body_name(&member_name(*member).unwrap_or_default()));
            body.then_some(Taint::Body)
        }
        Step::Declared(declarator, name) => destructured(inner, *declarator, *name),
    }
}

fn peel(node: Node) -> Node {
    let mut plain = unwrapped(node);
    while plain.is("AwaitExpression") {
        let Some(argument) = plain.node("argument") else { break };
        plain = unwrapped(argument);
    }
    plain
}

fn is_socket_callback(function: Node) -> bool {
    let Some(call) = function.parent().filter(|call| call.is("CallExpression")) else { return false };
    let arguments = call.list("arguments");
    let event = string_value(arguments.first().copied().flatten()).unwrap_or_default();
    if arguments.get(1).copied().flatten() != Some(function) || LIFECYCLE_EVENTS.contains(&event.as_str()) {
        return false;
    }
    let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"));
    callee.is_some_and(|callee| {
        member_name(callee).as_deref() == Some("on") && SOCKET_NAME.is_match(&plain_name(callee.node("object")))
    })
}

fn call_link(call: Node) -> Link {
    let Some(callee) = call.node("callee").map(unwrapped) else { return Link::Result(None) };
    if callee.is("Identifier") {
        let name = callee.name().unwrap_or_default();
        return Link::Result((name == "fetch" || CLIENTS.contains(&&*name)).then_some(Taint::Response));
    }
    if !callee.is("MemberExpression") {
        return Link::Result(None);
    }
    let Some(object) = callee.node("object") else { return Link::Result(None) };
    if object.is("Identifier") && CLIENTS.contains(&plain_name(Some(object)).as_str()) {
        return Link::Result(Some(Taint::Response));
    }
    let reader = member_name(callee).unwrap_or_default();
    if reader == "json" || reader == "text" { Link::Next(object, Step::Reader(reader)) } else { Link::Result(None) }
}

fn property_key_name(name: Node) -> Option<String> {
    let parent = name.parent().filter(|parent| parent.is("Property"))?;
    Some(plain_name(parent.node("key")))
}

fn destructured(source: Option<Taint>, declarator: Node, name: Node) -> Option<Taint> {
    if declarator.node("id").is_some_and(|id| id.is("Identifier")) {
        return source;
    }
    if source == Some(Taint::Body) {
        return Some(Taint::Text);
    }
    let key = property_key_name(name).unwrap_or_default();
    (source == Some(Taint::Response) && has_body_name(&key)).then_some(Taint::Body)
}

fn parameter_taint(node: Node, name: Node) -> Option<Taint> {
    let function = node.is("ArrowFunctionExpression") || node.is("FunctionExpression");
    let first = if function { node.list("params").first().copied().flatten() } else { None };
    let in_first = first.is_some_and(|first| name.start() >= first.start() && name.end() <= first.end());
    if !(in_first && is_socket_callback(node)) {
        return None;
    }
    Some(if name.parent().is_some_and(|parent| parent.is("Property")) { Taint::Text } else { Taint::Body })
}

fn declared_link<'v>(definition: &Def<'v>) -> Link<'v> {
    if definition.node.is("VariableDeclarator") && let Some(init) = definition.node.node("init") {
        return Link::Next(init, Step::Declared(definition.node, definition.name));
    }
    Link::Result(parameter_taint(definition.node, definition.name))
}

/// `findVariable(...).defs`, as ESLint scopes them: a type parameter of the same name is in a scope of its own.
fn value_defs<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Vec<Def<'s>> {
    let found = defs(scopes, identifier);
    let type_parameter = |definition: &Def| definition.kind == DefKind::Type && definition.node.is("TSTypeParameter");
    if found.iter().any(|definition| !type_parameter(definition)) {
        return found.into_iter().filter(|definition| !type_parameter(definition)).collect();
    }
    found
}

fn link_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Link<'s> {
    let plain = peel(node);
    match plain.kind() {
        "CallExpression" => call_link(plain),
        "MemberExpression" => match plain.node("object") {
            Some(object) => Link::Next(object, Step::Member(plain)),
            None => Link::Result(None),
        },
        "Identifier" => match value_defs(scopes, plain).as_slice() {
            [definition] => declared_link(definition),
            _ => Link::Result(None),
        },
        _ => Link::Result(None),
    }
}

/// `taintOf`.
pub fn taint_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Taint> {
    let mut steps = Vec::new();
    let mut current = node;
    let mut result = None;
    for _ in 0..=MAX_DEPTH {
        match link_of(scopes, current) {
            Link::Result(found) => {
                result = found;
                break;
            }
            Link::Next(next, step) => {
                steps.push(step);
                current = next;
            }
        }
    }
    steps.iter().rev().fold(result, |value, step| apply(step, value))
}
