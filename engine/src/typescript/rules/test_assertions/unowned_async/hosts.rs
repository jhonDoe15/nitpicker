//! `hosts.mts`: the calls that run a callback later (timers, microtasks, listeners, Node callback APIs), and the
//! bindings of the file that decide what each name stands for.
use super::nodes::{Env, FileBindings, ModuleBindings, all_nodes, imported_callee_name, in_set, module_bindings, name, nodes_in, property_name};
use crate::typescript::rules::security_values::{defs, is_function_node};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_quality::test_calls::resolved_function;
use regex::Regex;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    Microtask,
    Timer,
    Listener,
    Callback,
}

pub struct Shape<'v> {
    pub kind: Kind,
    pub name: String,
    candidates: Vec<Node<'v>>,
}

pub struct Host<'v> {
    pub kind: Kind,
    pub name: String,
    pub node: Node<'v>,
    pub callbacks: Vec<Node<'v>>,
}

const TIMER_MODULES: &[&str] = &["timers", "node:timers", "process", "node:process"];
const CALLBACK_MODULES: &[&str] = &[
    "fs", "node:fs", "child_process", "node:child_process", "dns", "node:dns", "zlib", "node:zlib", "crypto", "node:crypto", "stream",
    "node:stream", "net", "node:net", "tls", "node:tls", "http", "node:http", "https", "node:https", "http2", "node:http2", "dgram",
    "node:dgram",
];
const ASSERT_MODULES: &[&str] = &["assert", "node:assert", "assert/strict", "node:assert/strict", "chai"];
const EXPECT_MODULES: &[&str] = &["vitest", "@jest/globals", "@playwright/test"];
const NODE_TEST_MODULES: &[&str] = &["node:test"];
const RX_MODULES: &[&str] = &["rxjs", "rxjs/operators", "rxjs/webSocket", "rxjs/fetch"];
const ASYNC_RX: &[&str] = &[
    "interval", "timer", "fromEvent", "fromEventPattern", "webSocket", "animationFrames", "fromFetch", "delay", "delayWhen",
    "debounceTime", "throttleTime", "auditTime", "sampleTime", "timeout", "observeOn", "subscribeOn", "bufferTime",
];
const MACROTASKS: &[&str] = &["setTimeout", "setImmediate", "requestAnimationFrame", "requestIdleCallback"];
const MICROTASKS: &[&str] = &["queueMicrotask", "nextTick"];
const TIMER_OWNERS: &[&str] = &["globalThis", "global", "window", "self", "process"];
const LISTENERS: &[&str] = &["on", "once", "addListener", "prependListener", "prependOnceListener", "addEventListener", "subscribe"];
const LONG_LIVED_APIS: &[&str] = &["createServer", "createSecureServer", "createSocket", "connect", "createConnection", "watch", "watchFile"];
const OBSERVERS: &[&str] = &["MutationObserver", "ResizeObserver", "IntersectionObserver", "PerformanceObserver"];

static HANDLER_PROPERTY: LazyLock<Regex> = LazyLock::new(|| Regex::new("^on[a-z]+$").unwrap());

fn is_assertion_import_name(name: &str) -> bool {
    let rest = name.strip_prefix("assert").or_else(|| name.strip_prefix("expect"));
    rest.is_some_and(|rest| !rest.starts_with(|character: char| character.is_ascii_lowercase()))
}

fn imported_assertion_names(program: Node) -> Vec<String> {
    let imports = program.nodes("body").into_iter().filter(|statement| statement.is("ImportDeclaration") && statement.text("importKind").as_deref() != Some("type"));
    imports
        .flat_map(|statement| statement.nodes("specifiers"))
        .filter(|specifier| !specifier.is("ImportNamespaceSpecifier"))
        .filter(|specifier| !(specifier.is("ImportSpecifier") && specifier.text("importKind").as_deref() == Some("type")))
        .filter_map(|specifier| name(specifier.node("local")))
        .filter(|local| is_assertion_import_name(local))
        .collect()
}

/// `fileBindings`, with the configured assertion function names.
pub fn file_bindings(program: Node, assertion_names: &[String]) -> FileBindings {
    let mut names: std::collections::HashSet<String> = assertion_names.iter().cloned().collect();
    names.extend(imported_assertion_names(program));
    FileBindings {
        assertion_names: names,
        expects: module_bindings(program, EXPECT_MODULES),
        timers: module_bindings(program, TIMER_MODULES),
        callbacks: module_bindings(program, CALLBACK_MODULES),
        asserts: module_bindings(program, ASSERT_MODULES),
        node_test: module_bindings(program, NODE_TEST_MODULES),
        rx: module_bindings(program, RX_MODULES),
    }
}

fn unwrapped_callee(callee: Node) -> Node {
    if callee.is("SequenceExpression") {
        return callee.nodes("expressions").last().copied().unwrap_or(callee);
    }
    if callee.is("TSAsExpression") || callee.is("TSNonNullExpression") { callee.node("expression").unwrap_or(callee) } else { callee }
}

fn is_global_name(scopes: &Scopes, identifier: Node) -> bool {
    defs(scopes, identifier).is_empty()
}

fn bare_timer(scopes: &Scopes, callee: Node, bindings: &FileBindings) -> Option<String> {
    let called = name(Some(callee))?;
    if let Some(imported) = bindings.timers.named.get(&called) {
        return Some(imported.clone());
    }
    (called != "nextTick" && is_global_name(scopes, callee)).then_some(called)
}

fn member_timer(scopes: &Scopes, callee: Node, bindings: &FileBindings) -> Option<String> {
    let owner = callee.node("object").filter(|owner| callee.is("MemberExpression") && owner.is("Identifier"))?;
    let owner_name = name(Some(owner))?;
    let is_owner = bindings.timers.namespaces.contains(&owner_name) || (TIMER_OWNERS.contains(&owner_name.as_str()) && is_global_name(scopes, owner));
    if is_owner { property_name(Some(callee)) } else { None }
}

fn timer_name(scopes: &Scopes, callee: Node, bindings: &FileBindings) -> Option<String> {
    let found = if callee.is("Identifier") { bare_timer(scopes, callee, bindings) } else { member_timer(scopes, callee, bindings) };
    found.filter(|name| MACROTASKS.contains(&name.as_str()) || MICROTASKS.contains(&name.as_str()))
}

fn is_async_observable(receiver: Option<Node>, rx: &ModuleBindings) -> bool {
    nodes_in(receiver, |node| !is_function_node(node)).into_iter().any(|node| {
        node.is("CallExpression") && node.node("callee").and_then(|callee| imported_callee_name(callee, rx)).is_some_and(|called| ASYNC_RX.contains(&called.as_str()))
    })
}

fn listener_name(callee: Node, bindings: &FileBindings) -> Option<String> {
    let found = property_name(Some(callee)).filter(|found| callee.is("MemberExpression") && LISTENERS.contains(&found.as_str()))?;
    let is_source = found != "subscribe" || is_async_observable(callee.node("object"), &bindings.rx);
    is_source.then_some(found)
}

fn call_kind(scopes: &Scopes, callee: Node, bindings: &FileBindings) -> Option<(Kind, String)> {
    if let Some(timer) = timer_name(scopes, callee, bindings) {
        let kind = if MICROTASKS.contains(&timer.as_str()) { Kind::Microtask } else { Kind::Timer };
        return Some((kind, timer));
    }
    if let Some(listener) = listener_name(callee, bindings) {
        return Some((Kind::Listener, listener));
    }
    let api = imported_callee_name(callee, &bindings.callbacks).filter(|api| !api.ends_with("Sync"))?;
    let kind = if LONG_LIVED_APIS.contains(&api.as_str()) { Kind::Listener } else { Kind::Callback };
    Some((kind, api))
}

/// `hostShape`.
pub fn host_shape<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>, bindings: &FileBindings) -> Option<Shape<'v>> {
    match node.kind() {
        "CallExpression" => {
            let (kind, name) = call_kind(scopes, unwrapped_callee(node.node("callee")?), bindings)?;
            Some(Shape { kind, name, candidates: node.nodes("arguments") })
        }
        "NewExpression" => {
            let callee = node.node("callee")?;
            let found = if callee.is("Identifier") { name(Some(callee)) } else { property_name(Some(callee)) };
            let found = found.filter(|found| in_set(OBSERVERS, Some(found)))?;
            Some(Shape { kind: Kind::Listener, name: found, candidates: node.nodes("arguments") })
        }
        "AssignmentExpression" => {
            let found = property_name(node.node("left")).filter(|found| HANDLER_PROPERTY.is_match(found))?;
            Some(Shape { kind: Kind::Listener, name: found, candidates: node.node("right").into_iter().collect() })
        }
        _ => None,
    }
}

fn callback_function<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Node<'s>> {
    if is_function_node(node) { Some(node) } else { resolved_function(scopes, Some(node)) }
}

/// `hostOf`: the host call when one of its callbacks asserts.
pub fn host_of<'s>(env: &Env<'_, '_, 's>, node: Node<'s>) -> Option<Host<'s>> {
    let shape = host_shape(env.scopes, node, env.bindings)?;
    let callbacks: Vec<Node> = shape
        .candidates
        .iter()
        .filter_map(|candidate| callback_function(env.scopes, *candidate))
        .filter(|callback| asserts_in(env, *callback))
        .collect();
    if callbacks.is_empty() {
        return None;
    }
    Some(Host { kind: shape.kind, name: shape.name, node, callbacks })
}

fn asserts_in(env: &Env, callback: Node) -> bool {
    all_nodes(callback.node("body")).into_iter().any(|node| super::nodes::is_assertion(node, env.bindings))
}
