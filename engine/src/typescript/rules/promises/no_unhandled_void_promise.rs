//! `no-unhandled-void-promise`: `void` on a promise whose rejection nothing handles. A call is handled when its
//! callee is a configured runner, or when every implementation of the callee is an async function whose whole
//! body is `try` statements with a `catch` that does not raise.
use super::callees::cannot_reject;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;

const RULE: &str = "no-unhandled-void-promise";
const SETTING: &str = "no-unhandled-void-promise.runners";

const MESSAGE: &str = "`void` discards this promise, so nothing handles its rejection and Node.js exits on an unhandled rejection by default. Await it, or call an async function whose whole body is a `try` with a `catch` that logs and does not rethrow: `void sendReport(id);` with `async function sendReport(id) { try { await report(id); } catch (error) { logger.error({ error }, \"report failed\"); } }`. A detached-work runner the project already has can be named in nitpicker.config.json under `conventions` as `\"typescript.detachedWorkRunners\": [\"runDetached\"]`.";

fn unwrap(mut node: Node) -> Node {
    while matches!(node.kind(), "ChainExpression" | "TSNonNullExpression" | "TSAsExpression") {
        let Some(inner) = node.node("expression") else { break };
        node = inner;
    }
    node
}

fn callee_name(callee: Node) -> Option<String> {
    let inner = unwrap(callee);
    if inner.is("Identifier") {
        return inner.name().map(|name| name.into_owned());
    }
    let property = inner.node("property").filter(|property| property.is("Identifier"));
    let plain = inner.is("MemberExpression") && !inner.flag("computed");
    property.filter(|_| plain).and_then(|property| property.name().map(|name| name.into_owned()))
}

fn is_handled(types: &mut Types, runners: &[String], argument: Node) -> bool {
    let call = unwrap(argument);
    if !call.is("CallExpression") {
        return false;
    }
    let Some(callee) = call.node("callee") else { return false };
    if runners.contains(&callee_name(callee).unwrap_or_default()) {
        return true;
    }
    types.handle_at(None, callee.start(), callee.end()).is_some_and(|handle| cannot_reject(types, &handle))
}

fn is_thenable(types: &mut Types, argument: Node) -> bool {
    let handle = types.handle_at(None, argument.start(), argument.end());
    handle.is_some_and(|handle| types.is_thenable_at(&handle))
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let runners: Option<Vec<String>> = context.setting(SETTING).map_or(Some(Vec::new()), |json| serde_json::from_str(json).ok());
    let Some(runners) = runners else {
        types.borrow_mut().refuse("runners is not a list of names");
        return;
    };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("UnaryExpression") && node.text("operator").as_deref() == Some("void")) {
        let Some(argument) = node.node("argument") else { continue };
        let mut types = types.borrow_mut();
        let report = is_thenable(&mut types, argument) && !is_handled(&mut types, &runners, argument);
        if types.refused.is_some() {
            return;
        }
        if report {
            found.push((node.start(), node.end()));
        }
    }
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.to_string());
    }
}
