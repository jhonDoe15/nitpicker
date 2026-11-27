//! `subtests.mts`: node:test subtests (`t.test(...)` on a test context) and the bodies a test runs.
use crate::typescript::rules::security_values::{defs, is_function_node};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::property_name;
use crate::typescript::rules::test_quality::test_calls::{callback_of, is_nested_test, test_callback};

fn is_subtest_shaped(call: Option<Node>) -> bool {
    call.is_some_and(|call| {
        let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
        call.is("CallExpression") && property_name(callee).is_some_and(|name| name == "test" || name == "it")
    })
}

fn is_test_context(scopes: &Scopes, identifier: Node) -> bool {
    let found = defs(scopes, identifier);
    let Some(parameter) = found.first().filter(|definition| definition.kind == DefKind::Parameter) else { return false };
    let function = parameter.node;
    is_function_node(function)
        && function.list("params").first().copied().flatten() == Some(parameter.name)
        && (is_nested_test(scopes, function) || (is_subtest_shaped(function.parent()) && function.parent().and_then(callback_of) == Some(function)))
}

/// `subtestCallback`.
pub fn subtest_callback<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Node<'s>> {
    let object = call.node("callee").and_then(|callee| callee.node("object"));
    let subtest = is_subtest_shaped(Some(call)) && object.is_some_and(|object| object.is("Identifier") && is_test_context(scopes, object));
    if subtest { callback_of(call) } else { None }
}

pub fn test_body<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Node<'s>> {
    test_callback(scopes, call).or_else(|| subtest_callback(scopes, call))
}

pub fn is_test_boundary(scopes: &Scopes, node: Node) -> bool {
    is_nested_test(scopes, node)
        || (is_function_node(node) && node.parent().is_some_and(|parent| parent.is("CallExpression") && subtest_callback(scopes, parent) == Some(node)))
}
