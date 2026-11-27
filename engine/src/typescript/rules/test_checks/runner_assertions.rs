//! `runner-assertions.mts`: partial assertions written with `assert` or a chai `expect(...)` chain.
use super::{is_expect_call, is_fragment_pattern, is_text_argument, member_links};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::property_name;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Verdict {
    PartialOutput,
    PartialMatcher,
}

const ASSERT_NAMESPACE: &str = "assert";
const TRUTHY_ASSERTIONS: [&str; 2] = ["ok", "isTrue"];
const ASSERT_PARTIAL_OUTPUT: [&str; 3] = ["deepInclude", "deepNestedInclude", "deepOwnInclude"];
const ASSERT_PARTIAL_MATCHERS: [&str; 6] =
    ["partialDeepStrictEqual", "containSubset", "includeMembers", "includeDeepMembers", "includeOrderedMembers", "includeDeepOrderedMembers"];
const CHAI_INCLUDES: [&str; 4] = ["include", "includes", "contain", "contains"];
const CHAI_PARTIAL_MATCHERS: [&str; 1] = ["containSubset"];

fn is_assert_namespace(node: Option<Node>) -> bool {
    let Some(node) = node else { return false };
    (node.is("Identifier") && node.name().as_deref() == Some(ASSERT_NAMESPACE)) || property_name(Some(node)).as_deref() == Some(ASSERT_NAMESPACE)
}

fn assert_method(callee: Node) -> String {
    if callee.is("Identifier") {
        return if callee.name().as_deref() == Some(ASSERT_NAMESPACE) { "ok".into() } else { String::new() };
    }
    if callee.is("MemberExpression") && is_assert_namespace(callee.node("object")) { property_name(Some(callee)).unwrap_or_default() } else { String::new() }
}

fn is_includes_call(node: Option<Node>) -> bool {
    node.is_some_and(|node| {
        node.is("CallExpression")
            && property_name(node.node("callee")).as_deref() == Some("includes")
            && is_text_argument(node.list("arguments").first().copied().flatten())
    })
}

fn text_verdict(node: Option<Node>) -> Option<Verdict> {
    is_text_argument(node).then_some(Verdict::PartialOutput)
}

fn included_value_verdict(expected: Option<Node>) -> Option<Verdict> {
    if expected.is_some_and(|expected| expected.is("ObjectExpression")) { Some(Verdict::PartialMatcher) } else { text_verdict(expected) }
}

fn argument(call: Node, index: usize) -> Option<Node> {
    call.list("arguments").get(index).copied().flatten()
}

fn assert_verdict(call: Node, callee: Node) -> Option<Verdict> {
    let method = assert_method(callee);
    let method = method.as_str();
    if TRUTHY_ASSERTIONS.contains(&method) && is_includes_call(argument(call, 0)) {
        return Some(Verdict::PartialOutput);
    }
    match method {
        "include" => included_value_verdict(argument(call, 1)),
        "match" => is_fragment_pattern(argument(call, 1)).then_some(Verdict::PartialOutput),
        _ if ASSERT_PARTIAL_OUTPUT.contains(&method) => Some(Verdict::PartialOutput),
        _ => ASSERT_PARTIAL_MATCHERS.contains(&method).then_some(Verdict::PartialMatcher),
    }
}

fn chai_method_verdict(call: Node, callee: Node, links: &[Option<String>]) -> Option<Verdict> {
    let method = property_name(Some(callee)).unwrap_or_default();
    let method = method.as_str();
    let has = |wanted: &str| links.iter().any(|link| link.as_deref() == Some(wanted));
    if CHAI_INCLUDES.contains(&method) {
        return if has("deep") { Some(Verdict::PartialOutput) } else { included_value_verdict(argument(call, 0)) };
    }
    match method {
        "string" => text_verdict(argument(call, 0)),
        "match" | "matches" => is_fragment_pattern(argument(call, 0)).then_some(Verdict::PartialOutput),
        "members" if CHAI_INCLUDES.iter().any(|include| has(include)) => Some(Verdict::PartialMatcher),
        _ => CHAI_PARTIAL_MATCHERS.contains(&method).then_some(Verdict::PartialMatcher),
    }
}

fn chai_verdict(call: Node, callee: Node) -> Option<Verdict> {
    let chain = member_links(callee);
    if !is_expect_call(chain.last().copied()) {
        return None;
    }
    let links: Vec<Option<String>> = chain.iter().map(|link| property_name(Some(*link))).collect();
    if links.iter().any(|link| link.as_deref() == Some("not")) {
        return None;
    }
    chai_method_verdict(call, callee, &links)
}

/// `runnerAssertionVerdict`.
pub fn runner_assertion_verdict(call: Node) -> Option<Verdict> {
    let callee = call.node("callee")?;
    if callee.is("MemberExpression") && !is_assert_namespace(callee.node("object")) { chai_verdict(call, callee) } else { assert_verdict(call, callee) }
}
