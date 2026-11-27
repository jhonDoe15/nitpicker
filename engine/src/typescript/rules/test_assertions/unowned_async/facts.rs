//! `node-facts.mts`: what one node of a later step does for a pending callback: waits, drains timers, advances a
//! fake clock, flushes microtasks, writes a member or triggers an event.
use super::nodes::{in_set, name, nodes_in, property_name, root_name};
use crate::typescript::rules::security_values::{defs, is_function_node};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_quality::test_calls::enclosing_function;
use regex::Regex;
use std::sync::LazyLock;

pub const UNKNOWN_DELAY: f64 = f64::INFINITY;

#[derive(Default)]
pub struct Facts {
    pub advances: bool,
    pub flushes_microtasks: bool,
    pub triggers: bool,
    pub waits: bool,
    pub drains: Vec<f64>,
    pub writes: bool,
}

const CLOCK_ADVANCES: &[&str] = &[
    "advanceTimersByTime", "advanceTimersByTimeAsync", "advanceTimersToNextTimer", "advanceTimersToNextTimerAsync",
    "advanceTimersToNextFrame", "runAllTimers", "runAllTimersAsync", "runOnlyPendingTimers", "runOnlyPendingTimersAsync",
    "runAllImmediates", "runAll", "runAllAsync", "runToLast", "runToLastAsync", "tick", "tickAsync", "next", "nextAsync", "jump",
    "fastForward", "runFor",
];
const MICROTASK_FLUSHES: &[&str] = &["runAllTicks", "runMicrotasks"];
const CLOCK_RUNNERS: &[&str] = &["vi", "vitest", "jest"];
const QUIET_ROOTS: &[&str] = &["console", "Math", "JSON", "Object", "Array", "String", "Number", "Date", "expect", "assert"];
const LOG_METHODS: &[&str] = &["log", "info", "debug", "warn", "error", "trace"];
const DELAY_WAITS: &[&str] = &["sleep", "delay", "wait", "pause", "waitForTimeout", "setTimeout"];
const POLLING_WAITS: &[&str] = &["waitFor", "waitUntil", "poll", "setImmediate"];
const TIMER_SCHEDULERS: &[&str] = &["setTimeout", "setImmediate", "setInterval"];

static CLOCK_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)clock|timer").unwrap());

pub fn is_call_like(node: Node) -> bool {
    node.is("CallExpression") || node.is("NewExpression")
}

fn is_clock_receiver(object: Node) -> bool {
    let root = root_name(object);
    let callee = if object.has("callee") { object.node("callee") } else { None };
    let names = [root.clone(), property_name(Some(object)), property_name(callee)];
    in_set(CLOCK_RUNNERS, root.as_deref()) || names.iter().flatten().any(|name| CLOCK_NAME.is_match(name))
}

fn destructured_method(scopes: &Scopes, callee: Node) -> Option<String> {
    let found = defs(scopes, callee);
    let declarator = found.first().filter(|definition| definition.kind == DefKind::Variable).map(|definition| definition.node)?;
    let pattern = declarator.node("id").filter(|pattern| pattern.is("ObjectPattern"))?;
    if !in_set(CLOCK_RUNNERS, name(declarator.node("init")).as_deref()) {
        return None;
    }
    let called = name(Some(callee));
    let property = pattern.nodes("properties").into_iter().find(|candidate| candidate.is("Property") && name(candidate.node("value")) == called)?;
    name(property.node("key"))
}

fn clock_method(scopes: &Scopes, callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        return destructured_method(scopes, callee);
    }
    let object = callee.node("object").filter(|_| callee.is("MemberExpression"))?;
    if is_clock_receiver(object) { property_name(Some(callee)) } else { None }
}

fn is_cypress_tick(callee: Node) -> bool {
    callee.is("MemberExpression")
        && callee.node("object").is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("cy"))
        && property_name(Some(callee)).as_deref() == Some("tick")
}

fn is_member_write(node: Node) -> bool {
    if node.is("UpdateExpression") {
        return node.node("argument").is_some_and(|argument| argument.is("MemberExpression"));
    }
    node.is("AssignmentExpression") && node.node("left").is_some_and(|left| left.is("MemberExpression"))
}

fn is_wait(node: Node, owners: &[Node]) -> bool {
    match node.kind() {
        "AwaitExpression" | "YieldExpression" => true,
        "ForOfStatement" => node.flag("await"),
        "VariableDeclaration" => node.text("kind").as_deref() == Some("await using"),
        "ReturnStatement" => node.get("argument") != Value::Null && enclosing_function(node).is_some_and(|owner| owners.contains(&owner)),
        _ => false,
    }
}

fn called_name(callee: Option<Node>) -> Option<String> {
    let callee = callee?;
    if callee.is("Identifier") { name(Some(callee)) } else { property_name(Some(callee)) }
}

/// `literalDelay`.
pub fn literal_delay(node: Option<Node>, missing: f64) -> f64 {
    let Some(node) = node else { return missing };
    match node.get("value") {
        Value::Number(number) if node.is("Literal") => number,
        _ => UNKNOWN_DELAY,
    }
}

fn promise_timer_delays(node: Node) -> Vec<f64> {
    let executor = node.list("arguments").first().copied().flatten().filter(|_| name(node.node("callee")).as_deref() == Some("Promise"));
    let Some(executor) = executor.filter(|executor| is_function_node(*executor)) else { return Vec::new() };
    nodes_in(executor.node("body"), |_| true)
        .into_iter()
        .filter(|inner| inner.is("CallExpression") && in_set(TIMER_SCHEDULERS, called_name(inner.node("callee")).as_deref()))
        .map(|inner| literal_delay(inner.list("arguments").get(1).copied().flatten(), 0.0))
        .collect()
}

fn is_polling_finder(name: &str) -> bool {
    name.strip_prefix("find").is_some_and(|rest| rest.starts_with("By") || rest.starts_with("AllBy"))
}

fn drain_delays(node: Node) -> Vec<f64> {
    if node.is("NewExpression") {
        return promise_timer_delays(node);
    }
    let called = if node.is("CallExpression") { called_name(node.node("callee")) } else { None };
    if node.is("CallExpression") && in_set(DELAY_WAITS, called.as_deref()) {
        return vec![literal_delay(node.list("arguments").first().copied().flatten(), 0.0)];
    }
    let polls = in_set(POLLING_WAITS, called.as_deref()) || called.as_deref().is_some_and(is_polling_finder);
    if polls { vec![UNKNOWN_DELAY] } else { Vec::new() }
}

fn timer_drains(node: Node, waits: bool) -> Vec<f64> {
    let waited = matches!(node.kind(), "AwaitExpression" | "YieldExpression" | "ReturnStatement").then(|| node.node("argument")).flatten();
    match waited.filter(|_| waits) {
        Some(waited) => nodes_in(Some(waited), |child| !is_function_node(child)).into_iter().flat_map(drain_delays).collect(),
        None => Vec::new(),
    }
}

/// `nodeFacts`.
pub fn node_facts(scopes: &Scopes, node: Node, owners: &[Node]) -> Facts {
    let mut facts = Facts::default();
    if is_call_like(node)
        && let Some(callee) = node.node("callee")
    {
        let method = clock_method(scopes, callee);
        facts.advances = in_set(CLOCK_ADVANCES, method.as_deref()) || is_cypress_tick(callee);
        facts.flushes_microtasks = in_set(MICROTASK_FLUSHES, method.as_deref());
        facts.triggers = !(in_set(QUIET_ROOTS, root_name(callee).as_deref()) || in_set(LOG_METHODS, property_name(Some(callee)).as_deref()));
    }
    facts.waits = is_wait(node, owners);
    facts.drains = timer_drains(node, facts.waits);
    facts.writes = is_member_write(node);
    facts
}
