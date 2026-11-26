//! `emitter-creations.mts` without type information: where an expression creates an emitter nobody listens to yet.
use super::emitter_modules::{EMITTER_SOURCES, Modules, is_chainable_method, is_listen_method};
use super::names::Env;
use super::names::bindings::{imported_function, is_module_value};
use super::names::resolve::{is_call, member_name, resolve_constant, string_value, unwrapped};
use crate::typescript::rules::support::view::Node;

#[derive(Clone, Copy, PartialEq)]
pub enum SourceField {
    Factories,
    Constructors,
    Servers,
}

/// `importedName`: the module member a node stands for.
pub fn imported_name<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>, modules: Modules) -> Option<String> {
    imported_function(env, unwrapped(node), &env.bindings(modules))
}

/// `calledName`: the module member a call or `new` calls.
pub fn called_name<'a, 'v>(env: &Env<'a, 'v>, call: Node<'v>, modules: Modules) -> Option<String> {
    let callee = unwrapped(call.node("callee")?);
    let bindings = env.bindings(modules);
    if call.is("NewExpression") && is_module_value(env, Some(callee), &bindings) {
        return Some("default".to_string());
    }
    imported_function(env, callee, &bindings)
}

fn source_of<'a, 'v>(env: &Env<'a, 'v>, call: Node<'v>, field: SourceField) -> bool {
    EMITTER_SOURCES.iter().any(|entry| {
        let names = match field {
            SourceField::Factories => entry.factories,
            SourceField::Constructors => entry.constructors,
            SourceField::Servers => entry.servers,
        };
        !names.is_empty() && called_name(env, call, entry.modules).is_some_and(|name| names.contains(&name.as_str()))
    })
}

fn is_member_call(call: Node) -> bool {
    call.is("CallExpression") && call.node("callee").is_some_and(|callee| callee.is("MemberExpression"))
}

pub fn listens_for_errors<'a, 'v>(env: &Env<'a, 'v>, call: Node<'v>) -> bool {
    let event = string_value(resolve_constant(env, call.nodes("arguments").first().copied()));
    let callee = call.node("callee").and_then(member_name);
    is_listen_method(callee.as_deref()) && event.as_deref() == Some("error")
}

fn chained_calls(node: Node) -> Vec<Node> {
    let mut chain = vec![unwrapped(node)];
    loop {
        let current = *chain.last().unwrap_or(&node);
        let callee = current.node("callee").filter(|callee| current.is("CallExpression") && callee.is("MemberExpression"));
        match callee.filter(|callee| is_chainable_method(member_name(*callee).as_deref())).and_then(|callee| callee.node("object")) {
            Some(object) => chain.push(unwrapped(object)),
            None => return chain,
        }
    }
}

fn branches_of(node: Node) -> Vec<Option<Node>> {
    let target = unwrapped(node);
    match target.kind() {
        "ConditionalExpression" => vec![target.node("consequent"), target.node("alternate")],
        "LogicalExpression" => vec![target.node("left"), target.node("right")],
        _ => vec![Some(target)],
    }
}

fn is_unheard_creation<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>) -> bool {
    let chain = chained_calls(node);
    let (root, calls) = chain.split_last().map_or((None, &chain[..0]), |(root, calls)| (Some(*root), calls));
    let heard = calls.iter().any(|call| is_member_call(*call) && listens_for_errors(env, *call));
    !heard && root.is_some_and(|root| is_direct_creation(env, root))
}

pub fn is_emitter_creation<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>) -> bool {
    branches_of(node).into_iter().flatten().any(|branch| is_unheard_creation(env, branch))
}

fn is_direct_creation<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>) -> bool {
    let target = unwrapped(node);
    match target.kind() {
        "CallExpression" => source_of(env, target, SourceField::Factories),
        "NewExpression" => source_of(env, target, SourceField::Constructors),
        _ => false,
    }
}

pub fn is_server_creation<'a, 'v>(env: &Env<'a, 'v>, node: Option<Node<'v>>) -> bool {
    node.map(unwrapped).is_some_and(|target| is_call(target) && source_of(env, target, SourceField::Servers))
}
