//! `no-partial-output-assertion`: an expectation that checks only a fragment of the output or of the value.
use super::runner_assertions::{Verdict, runner_assertion_verdict};
use super::{is_expect_call, is_fragment_match, is_text_argument, member_links};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::property_name;
use crate::typescript::rules::test_quality::runner_words::runner_word;

const RULE: &str = "no-partial-output-assertion";
const PARTIAL_MATCHERS: [&str; 3] = ["toContain", "toContainEqual", "toMatch"];
const WHOLE_VALUE_MATCHERS: [&str; 2] = ["toEqual", "toStrictEqual"];
const PARTIAL_ASYMMETRIC_MATCHERS: [&str; 3] = ["objectContaining", "stringContaining", "arrayContaining"];

fn is_positive_expectation(callee: Node) -> bool {
    let chain = member_links(callee);
    let negated = chain.iter().any(|link| link.is("MemberExpression") && property_name(Some(*link)).as_deref() == Some("not"));
    is_expect_call(chain.last().copied()) && !negated
}

fn first_argument(call: Node) -> Option<Node> {
    call.list("arguments").first().copied().flatten()
}

fn is_partial_assertion(call: Node, callee: Node) -> bool {
    let Some(matcher) = property_name(Some(callee)).filter(|matcher| PARTIAL_MATCHERS.contains(&matcher.as_str())) else { return false };
    if matcher == "toContain" && !is_text_argument(first_argument(call)) {
        return false;
    }
    if matcher == "toMatch" && !is_fragment_match(first_argument(call)) {
        return false;
    }
    is_positive_expectation(callee)
}

fn is_partial_asymmetric_matcher(node: Node) -> bool {
    let Some(callee) = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression")) else { return false };
    let object = callee.node("object").filter(|object| object.is("Identifier"));
    object.is_some_and(|object| object.name().as_deref() == Some("expect"))
        && property_name(Some(callee)).is_some_and(|name| PARTIAL_ASYMMETRIC_MATCHERS.contains(&name.as_str()))
}

fn expected_value_parts(node: Node) -> Vec<Node> {
    match node.kind() {
        "ObjectExpression" => node
            .nodes("properties")
            .into_iter()
            .filter_map(|property| if property.is("Property") { property.node("value") } else { Some(property) })
            .collect(),
        "ArrayExpression" => node.nodes("elements"),
        "SpreadElement" => node.node("argument").into_iter().collect(),
        _ => Vec::new(),
    }
}

fn contains_partial_matcher(expected: Node) -> bool {
    let mut pending = vec![expected];
    let mut index = 0;
    while index < pending.len() {
        let node = pending[index];
        if is_partial_asymmetric_matcher(node) {
            return true;
        }
        pending.extend(expected_value_parts(node));
        index += 1;
    }
    false
}

fn is_partial_matcher_assertion(call: Node, callee: Node) -> bool {
    if !is_positive_expectation(callee) {
        return false;
    }
    let matcher = property_name(Some(callee));
    if matcher.as_deref() == Some("toMatchObject") {
        return true;
    }
    matcher.is_some_and(|matcher| WHOLE_VALUE_MATCHERS.contains(&matcher.as_str())) && call.nodes("arguments").into_iter().any(contains_partial_matcher)
}

fn verdict_of(call: Node) -> Option<Verdict> {
    let callee = call.node("callee")?;
    if callee.is("MemberExpression") {
        if is_partial_assertion(call, callee) {
            return Some(Verdict::PartialOutput);
        }
        if is_partial_matcher_assertion(call, callee) {
            return Some(Verdict::PartialMatcher);
        }
    }
    runner_assertion_verdict(call)
}

fn reported_node(call: Node) -> Option<Node> {
    let callee = call.node("callee")?;
    if callee.is("MemberExpression") { callee.node("property") } else { Some(callee) }
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let found: Vec<(Verdict, u32, u32)> = view
        .nodes()
        .filter(|node| node.is("CallExpression"))
        .filter_map(|call| {
            let verdict = verdict_of(call)?;
            let reported = reported_node(call)?;
            Some((verdict, reported.start(), reported.end()))
        })
        .collect();
    let word = |name: &str| runner_word(context, RULE, name).to_string();
    let output = format!(
        "Assert the whole output with {} instead of checking that it contains a fragment ({}): a fragment passes even when the rest is wrong. An exception fits only when the output is too large or unordered to pin.",
        word("whole-output"),
        word("fragment-forms"),
    );
    let matcher = format!(
        "Pass the whole expected value to {} instead of a partial match ({}): the rest of the value goes unchecked. {} An exception fits only when the value is too large or unordered to pin.",
        word("whole-value"),
        word("partial-forms"),
        word("varied-field"),
    );
    for (verdict, start, end) in found {
        let message = if verdict == Verdict::PartialOutput { output.clone() } else { matcher.clone() };
        context.report_range(RULE, start, Some(end), message);
    }
}
