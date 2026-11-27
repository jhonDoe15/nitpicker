//! The waits `no-fixed-sleep-synchronization` looks at: sleeps on a timer, and the Testing Library waits that
//! `.rejects` turns into an absence check that lasts the whole timeout.
use crate::typescript::rules::security_values::{defs, is_function_node};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::{ModuleBindings, imported_callee_name, property_name};
use regex::Regex;
use std::sync::LazyLock;

const SET_TIMEOUT: &str = "setTimeout";
const VITEST_OBJECTS: [&str; 2] = ["vi", "vitest"];
static FIND_QUERY: LazyLock<Regex> = LazyLock::new(|| Regex::new("^find(?:All)?By[A-Z]").expect("find query"));
static RENDER_CALL: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:render|within$)").expect("render call"));

fn is_identifier(node: Option<Node>, names: &[&str]) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().is_some_and(|name| names.contains(&name.as_ref())))
}

fn is_set_timeout(callee: Node) -> bool {
    if callee.is("Identifier") {
        return callee.name().as_deref() == Some(SET_TIMEOUT);
    }
    callee.is("MemberExpression")
        && !callee.flag("computed")
        && is_identifier(callee.node("object"), &["globalThis", "window", "global"])
        && is_identifier(callee.node("property"), &[SET_TIMEOUT])
}

fn is_scheduler_wait(callee: Node, timer_promises: &ModuleBindings) -> bool {
    callee.is("MemberExpression")
        && !callee.flag("computed")
        && is_identifier(callee.node("property"), &["wait"])
        && callee.node("object").and_then(|object| imported_callee_name(object, timer_promises)).as_deref() == Some("scheduler")
}

/// `soleBodyValue(callback, 'ExpressionStatement')` of a function.
fn single_expression(callback: Node) -> Option<Node> {
    if !is_function_node(callback) {
        return None;
    }
    let body = callback.node("body")?;
    if !body.is("BlockStatement") {
        return Some(body);
    }
    let statements = body.nodes("body");
    let [only] = statements.as_slice() else { return None };
    if only.is("ExpressionStatement") { only.node("expression") } else { None }
}

fn resolves_later(argument: Option<Node>, resolve: &str) -> bool {
    let Some(argument) = argument else { return false };
    if is_identifier(Some(argument), &[resolve]) {
        return true;
    }
    let body = single_expression(argument).filter(|body| body.is("CallExpression"));
    body.is_some_and(|body| is_identifier(body.node("callee"), &[resolve]))
}

fn calls_resolve_timeout(body: Node, resolve: &str) -> bool {
    std::iter::once(body).chain(body.descendants()).any(|node| {
        node.is("CallExpression")
            && node.node("callee").is_some_and(is_set_timeout)
            && resolves_later(node.list("arguments").first().copied().flatten(), resolve)
    })
}

/// `isPromiseExecutorSleep`: what an `await` waits on is a timer and nothing else.
pub fn is_promise_executor_sleep(argument: Node, timer_promises: &ModuleBindings) -> bool {
    let Some(callee) = argument.node("callee") else { return false };
    if argument.is("NewExpression") {
        let executor = argument.list("arguments").first().copied().flatten().filter(|executor| is_function_node(*executor));
        let Some(executor) = executor else { return false };
        let resolve = executor.list("params").first().copied().flatten().filter(|param| param.is("Identifier")).and_then(|param| param.name());
        let Some(resolve) = resolve else { return false };
        return is_identifier(Some(callee), &["Promise"]) && executor.node("body").is_some_and(|body| calls_resolve_timeout(body, &resolve));
    }
    if !argument.is("CallExpression") {
        return false;
    }
    is_identifier(Some(callee), &["sleep", "delay", "wait"])
        || imported_callee_name(callee, timer_promises).as_deref() == Some(SET_TIMEOUT)
        || is_scheduler_wait(callee, timer_promises)
}

fn is_render_result(scopes: &Scopes, identifier: Node) -> bool {
    let definitions = defs(scopes, identifier);
    let Some(definition) = definitions.first() else { return false };
    if definition.kind == DefKind::ImportBinding {
        let declaration = definition.node.parent().filter(|parent| parent.is("ImportDeclaration"));
        let source = declaration.and_then(|declaration| declaration.node("source")).and_then(|source| source.text("value"));
        return source.is_some_and(|source| source.starts_with("@testing-library/"));
    }
    if definition.kind != DefKind::Variable {
        return false;
    }
    let init = definition.node.node("init");
    let call = if init.is_some_and(|init| init.is("AwaitExpression")) { init.and_then(|init| init.node("argument")) } else { init };
    let callee = call.filter(|call| call.is("CallExpression")).and_then(|call| call.node("callee")).filter(|callee| callee.is("Identifier"));
    callee.and_then(|callee| callee.name()).is_some_and(|name| RENDER_CALL.is_match(&name))
}

fn is_query_receiver(scopes: &Scopes, object: Node) -> bool {
    if object.is("Identifier") {
        return object.name().as_deref() == Some("screen") || is_render_result(scopes, object);
    }
    object.is("CallExpression") && is_identifier(object.node("callee"), &["within"])
}

/// `isUiWait`: `waitFor(...)` or a `find*By*` query of Testing Library.
pub fn is_ui_wait(scopes: &Scopes, call: Option<Node>) -> bool {
    let Some(callee) = call.filter(|call| call.is("CallExpression")).and_then(|call| call.node("callee")) else { return false };
    let name = if callee.is("Identifier") { callee.name().map(|name| name.into_owned()) } else { property_name(Some(callee)) };
    let Some(name) = name else { return false };
    if name == "waitFor" {
        let vitest = callee.is("MemberExpression") && is_identifier(callee.node("object"), &VITEST_OBJECTS);
        return callee.is("Identifier") || vitest;
    }
    if !FIND_QUERY.is_match(&name) {
        return false;
    }
    if callee.is("Identifier") {
        return is_render_result(scopes, callee);
    }
    callee.is("MemberExpression") && callee.node("object").is_some_and(|object| is_query_receiver(scopes, object))
}
