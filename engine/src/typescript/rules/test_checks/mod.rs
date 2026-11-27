//! Test-code rules of the ESLint plugin on what a test asserts, how it waits and what it sets up:
//! `no-partial-output-assertion`, `no-fixed-sleep-synchronization`, `no-first-test-charged-setup` and
//! `integration-test-uses-approved-harness`.
pub mod approved_harness;
pub mod charged_setup;
pub mod fixed_sleep;
pub mod partial_output;
mod runner_assertions;

use crate::typescript::rules::support::view::{Node, Value};

/// `isExpectCall`: `expect(...)` or `expect.<member>(...)`.
pub fn is_expect_call(node: Option<Node>) -> bool {
    let Some(callee) = node.filter(|node| node.is("CallExpression")).and_then(|call| call.node("callee")) else { return false };
    if callee.is("Identifier") {
        return callee.name().as_deref() == Some("expect");
    }
    let object = callee.node("object").filter(|object| callee.is("MemberExpression") && object.is("Identifier"));
    object.is_some_and(|object| object.name().as_deref() == Some("expect"))
}

/// `isTextArgument`: a string literal or a template literal.
pub fn is_text_argument(node: Option<Node>) -> bool {
    node.is_some_and(|node| (node.is("Literal") && matches!(node.get("value"), Value::Text(..))) || node.is("TemplateLiteral"))
}

/// `isFragmentPattern`: a regular expression literal not anchored `^...$`.
pub fn is_fragment_pattern(node: Option<Node>) -> bool {
    let Some(node) = node.filter(|node| node.is("Literal")) else { return false };
    let Value::Node(at) = node.get("regex") else { return false };
    let pattern = node.view.at(at).text("pattern").unwrap_or_default();
    let anchored = pattern.starts_with('^') && pattern.ends_with('$') && !pattern.ends_with("\\$");
    !anchored
}

/// `isFragmentMatch`.
pub fn is_fragment_match(node: Option<Node>) -> bool {
    is_fragment_pattern(node) || is_text_argument(node)
}

/// The links of a matcher chain from the callee's object down, along member objects.
pub fn member_links(callee: Node) -> Vec<Node> {
    crate::typescript::rules::test_quality::test_calls::chain_of(callee.node("object"), |link| {
        if link.is("MemberExpression") { link.node("object") } else { None }
    })
}
