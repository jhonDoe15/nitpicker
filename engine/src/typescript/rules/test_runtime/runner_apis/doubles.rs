//! The fake-timer and spy vocabulary of the runners (`runner-doubles`), on top of the tracked APIs.
use super::{Apis, Called, member_name};
use crate::typescript::rules::support::view::Node;

pub struct TimerChange {
    pub kind: &'static str,
    pub fake: bool,
}

fn timers_on(kind: &str) -> &'static [&'static str] {
    match kind {
        "vitest" | "jest" | "sinon" => &["useFakeTimers"],
        "node" => &["enable"],
        "fakeTimers" => &["install"],
        _ => &[],
    }
}

fn timers_off(kind: &str) -> &'static [&'static str] {
    match kind {
        "vitest" | "jest" => &["useRealTimers"],
        "node" => &["reset"],
        "sinon" => &["restore"],
        "clock" => &["restore", "uninstall"],
        _ => &[],
    }
}

fn spy_methods(kind: &str) -> &'static [&'static str] {
    match kind {
        "vitest" | "jest" => &["spyOn"],
        "node" => &["method", "getter", "setter"],
        "sinon" => &["stub", "spy", "replace", "replaceGetter", "replaceSetter"],
        "testdouble" => &["replace"],
        _ => &[],
    }
}

fn node_timer_method(apis: &Apis, callee: Node) -> Option<String> {
    let method = member_name(callee);
    let timers = callee.node("object").filter(|_| callee.is("MemberExpression"))?;
    let is_timers = timers.is("MemberExpression") && member_name(timers).as_deref() == Some("timers");
    if is_timers && timers.node("object").and_then(|object| apis.kind_of_object(object)) == Some("node") { method } else { None }
}

fn timer_method(apis: &Apis, callee: Node) -> Option<Called> {
    match node_timer_method(apis, callee) {
        Some(method) => Some(Called { kind: Some("node"), method: Some(method) }),
        None => apis.called(callee),
    }
}

fn listed(methods: fn(&str) -> &'static [&'static str], called: &Called) -> bool {
    match (called.kind, called.method.as_deref()) {
        (Some(kind), Some(method)) => methods(kind).contains(&method),
        _ => false,
    }
}

/// `fakeTimerChange`: whether a call switches fake timers on or off, and for which clock.
pub fn fake_timer_change(apis: &Apis, call: Node) -> Option<TimerChange> {
    let called = timer_method(apis, call.node("callee")?)?;
    let fake = if listed(timers_on, &called) { true } else if listed(timers_off, &called) { false } else { return None };
    let kind = match called.kind? {
        "fakeTimers" | "clock" => "sinon",
        kind => kind,
    };
    Some(TimerChange { kind, fake })
}

/// `waitKind`: which `waitFor` a call is.
pub fn wait_kind(apis: &Apis, call: Node) -> Option<&'static str> {
    let callee = call.node("callee")?;
    if callee.is("Identifier") {
        return (callee.name().and_then(|name| apis.kind_named(name.as_ref())) == Some("waitFor")).then_some("testing-library");
    }
    let is_vitest = callee.is("MemberExpression")
        && member_name(callee).as_deref() == Some("waitFor")
        && callee.node("object").and_then(|object| apis.kind_of_object(object)) == Some("vitest");
    is_vitest.then_some("vitest")
}

fn is_spy_call(apis: &Apis, callee: Node) -> bool {
    member_name(callee).as_deref() == Some("spyOn") || apis.called(callee).is_some_and(|called| listed(spy_methods, &called))
}

/// `spiedMember`: the object a spy call replaces a member of.
pub fn spied_member<'v>(apis: &Apis, call: Node<'v>) -> Option<Node<'v>> {
    let arguments = call.nodes("arguments");
    let (target, _) = (arguments.first().copied().filter(|target| !target.is("Literal")), arguments.get(1)?);
    let callee = call.node("callee")?;
    target.filter(|_| is_spy_call(apis, callee))
}
