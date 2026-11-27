//! `perTestVisitors` of `test-code-analysis.mts`: the calls a test or `beforeEach` callback makes, and the calls of
//! the local functions it reaches, each reported once. The rules that use it are in `rules.rs`.
pub mod rules;
mod subprocess;
mod wrapper;

use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, View};
use crate::typescript::rules::test_assertions::unowned_async::nodes::root_name;
use crate::typescript::rules::test_quality::test_calls::resolve_function;

const PER_TEST_TESTS: [&str; 2] = ["it", "test"];
const PER_TEST_HOOKS: [&str; 1] = ["beforeEach"];
const REGISTRATION_FACTORIES: [&str; 6] = ["each", "for", "runIf", "skipIf", "extend", "todo"];

/// `perTestCallback`: the last inline function a test or `beforeEach` call registers.
fn per_test_callback(call: Node) -> Option<Node> {
    let callee = call.node("callee")?;
    let root = root_name(callee)?;
    if !PER_TEST_TESTS.contains(&root.as_str()) && !PER_TEST_HOOKS.contains(&root.as_str()) {
        return None;
    }
    let factory = if callee.is("MemberExpression") && !callee.flag("computed") { callee.node("property").and_then(|property| property.name()) } else { None };
    if factory.is_some_and(|factory| REGISTRATION_FACTORIES.contains(&factory.as_ref())) {
        return None;
    }
    call.nodes("arguments").into_iter().rev().find(|argument| argument.is("ArrowFunctionExpression") || argument.is("FunctionExpression"))
}

/// The calls and `new` expressions of every per-test callback for which `check` holds, in source order.
pub fn per_test_reports<'v>(view: &'v View, scopes: &Scopes<'_, 'v>, mut check: impl FnMut(Node<'v>) -> bool) -> Vec<Node<'v>> {
    let mut reported: Vec<Node> = Vec::new();
    for registration in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(callback) = per_test_callback(registration) else { continue };
        let mut visited = vec![callback];
        let mut pending: Vec<Node> = callback.node("body").into_iter().collect();
        while let Some(body) = pending.pop() {
            for node in body.descendants() {
                if !node.is("CallExpression") && !node.is("NewExpression") {
                    continue;
                }
                if !reported.contains(&node) && check(node) {
                    reported.push(node);
                }
                let function = if node.is("CallExpression") { resolve_function(scopes, node.node("callee")) } else { None };
                if let Some(function) = function.filter(|function| is_function_node(*function) && !visited.contains(function)) {
                    visited.push(function);
                    pending.extend(function.node("body"));
                }
            }
        }
    }
    reported.sort_by_key(|node| (node.start(), node.end()));
    reported
}
