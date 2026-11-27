//! `no-interval-polling-in-tests`: `setInterval` calls, outside the test fixtures (the `fixture` setting).
use crate::typescript::rules::Context;
use crate::typescript::rules::test_quality::runner_words::runner_word;

const RULE: &str = "no-interval-polling-in-tests";

fn is_set_interval(callee: crate::typescript::rules::support::view::Node) -> bool {
    if callee.is("Identifier") {
        return callee.name().as_deref() == Some("setInterval");
    }
    let object = callee.node("object").filter(|object| object.is("Identifier"));
    let property = callee.node("property");
    callee.is("MemberExpression")
        && !callee.flag("computed")
        && object.is_some_and(|object| object.name().as_deref() == Some("globalThis"))
        && property.is_some_and(|property| property.name().as_deref() == Some("setInterval"))
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    if context.setting(&format!("{RULE}.fixture")) == Some("true") {
        return;
    }
    let found: Vec<(u32, u32)> = view
        .nodes()
        .filter(|node| node.is("CallExpression") && node.node("callee").is_some_and(is_set_interval))
        .map(|node| (node.start(), node.end()))
        .collect();
    let message = format!("Prefer {} over setInterval polling in tests.", runner_word(context, RULE, "poll-instead"));
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), message.clone());
    }
}
