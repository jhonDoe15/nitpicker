//! `no-uncollected-tests`: the first top-level test call of a file the test runner never collects. Whether the
//! runner collects the file depends on its configuration, so the caller gives it as the `collected` setting.
use crate::typescript::rules::Context;
use crate::typescript::rules::test_quality::runner_words::runner_word;
use crate::typescript::rules::test_quality::test_calls::is_test_function_chain;

const RULE: &str = "no-uncollected-tests";

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    if context.setting(&format!("{RULE}.collected")) == Some("true") {
        return;
    }
    let first = view.program().nodes("body").into_iter().find(|statement| {
        let call = statement.node("expression").filter(|expression| statement.is("ExpressionStatement") && expression.is("CallExpression"));
        call.and_then(|call| call.node("callee")).is_some_and(is_test_function_chain)
    });
    let Some(first) = first else { return };
    let collect_it = runner_word(context, RULE, "collect-it");
    let message = format!(
        "This file defines tests but the test runner does not collect it, so they never run. {collect_it} An exception fits only when another test file runs it on purpose."
    );
    context.report_range(RULE, first.start(), Some(first.end()), message);
}
