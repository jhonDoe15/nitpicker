//! `dollar-guards.mts`: a replacement inside the branch of a test that its text holds no `$`.
use crate::typescript::rules::patterns::syntax::{callee_name_of, string_value};
use crate::typescript::rules::support::view::Node;

fn is_no_dollar_test(text: &str, test: Node, replacement: &str) -> bool {
    if !test.is("UnaryExpression") || test.text("operator").as_deref() != Some("!") {
        return false;
    }
    let Some(call) = test.node("argument").filter(|call| call.is("CallExpression")) else { return false };
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    let Some(object) = callee.node("object") else { return false };
    callee_name_of(callee).as_deref() == Some("includes")
        && string_value(call.nodes("arguments").first().copied()).as_deref() == Some("$")
        && &text[object.start() as usize..object.end() as usize] == replacement
}

pub fn has_dollar_guard(text: &str, node: Node) -> bool {
    let replacement = &text[node.start() as usize..node.end() as usize];
    let mut child = node;
    while let Some(holder) = child.parent() {
        let branching = holder.is("IfStatement") || holder.is("ConditionalExpression");
        if branching && holder.node("consequent") == Some(child) && holder.node("test").is_some_and(|test| is_no_dollar_test(text, test, replacement)) {
            return true;
        }
        child = holder;
    }
    false
}
