//! `found-text.mts` and `narrowing.mts` of `no-weak-assertion`: the assertion as the message shows it, and whether
//! the code after an `assert.ok(value != null)` uses the value, so the check only narrows its type.
use super::forms::{Expectation, length_name, non_empty_comparison, nullish_name};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_quality::test_calls::enclosing_function;
use crate::typescript::with_tokens;

fn source<'a>(context: &Context<'a, '_>, node: Node) -> &'a str {
    context.file.slice(node.start(), node.end())
}

fn side_text(context: &Context, node: Option<Node>) -> String {
    if let Some(length) = length_name(node) {
        return format!("….{length}");
    }
    match node {
        Some(node) if node.is("Literal") || nullish_name(Some(node)).is_some() => source(context, node).to_string(),
        _ => "…".to_string(),
    }
}

fn condition_text(context: &Context, condition: Option<Node>) -> String {
    let Some(condition) = condition.filter(|condition| condition.is("BinaryExpression")) else { return side_text(context, condition) };
    let operator = condition.text("operator").unwrap_or_default();
    format!("{} {operator} {}", side_text(context, condition.node("left")), side_text(context, condition.node("right")))
}

/// `expectText`.
pub fn expect_text(context: &Context, expectation: &Expectation) -> String {
    let subject = expectation.subject;
    let shown = non_empty_comparison(subject).is_some() || length_name(subject).is_some();
    let subject_text = if shown { condition_text(context, subject) } else { "…".to_string() };
    let args: Vec<&str> = expectation.args.iter().flatten().map(|argument| source(context, *argument)).collect();
    format!("expect({subject_text}).{}({})", expectation.path, args.join(", "))
}

/// `assertText`.
pub fn assert_text(context: &Context, call: Node) -> String {
    let callee_node = call.node("callee");
    let callee = callee_node.map(|callee| source(context, callee)).unwrap_or_default();
    let args = call.list("arguments");
    let (first, second) = (args.first().copied().flatten(), args.get(1).copied().flatten());
    let inner = if callee_node.is_some_and(|callee| callee.is("Identifier")) || callee.ends_with(".ok") {
        condition_text(context, first)
    } else {
        format!("{}, {}", side_text(context, first), side_text(context, second))
    };
    format!("{callee}({inner})")
}

/// `isNarrowedLater` for each call and subject: whether the subject's tokens come again, not after a `.` or `?.`,
/// after the call and inside the function that holds it.
pub fn narrowed_later(context: &Context, program: Node, asked: &[(Node, Node)]) -> Vec<bool> {
    with_tokens(context.file.path, context.file.text, |file| {
        let tokens = file.tokens;
        let text = |index: usize| file.slice(tokens[index].start(), tokens[index].end());
        let within = |start: u32, end: u32| {
            let first = tokens.partition_point(|token| token.start() < start);
            let last = tokens.partition_point(|token| token.end() <= end);
            first..last.max(first)
        };
        asked
            .iter()
            .map(|(call, subject)| {
                let scope = enclosing_function(*call).unwrap_or(program);
                let wanted: Vec<&str> = within(subject.start(), subject.end()).map(text).collect();
                let scoped = within(scope.start(), scope.end());
                let later: Vec<usize> = scoped.filter(|index| tokens[*index].start() >= call.end()).collect();
                (0..later.len()).any(|index| {
                    let before = index.checked_sub(1).map(|before| text(later[before]));
                    !matches!(before, Some("." | "?.")) && wanted.iter().enumerate().all(|(offset, value)| later.get(index + offset).is_some_and(|at| text(*at) == *value))
                })
            })
            .collect()
    })
}
