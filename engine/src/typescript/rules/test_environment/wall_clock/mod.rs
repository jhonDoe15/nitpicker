//! `no-wall-clock-bound-in-tests`: an assertion that a duration measured with `Date` or `performance` stays under a
//! limit below one second, in a test file that never fakes or replaces the clock. Benchmark files are left alone.
mod durations;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_checks::fixed_sleep::numbers::constant_number;
use crate::typescript::rules::test_checks::is_expect_call;
use crate::typescript::rules::test_runtime::runner_apis::{Apis, fake_timer_change, sets_fake_clock};
use durations::{is_measured_duration, replaces_clock};
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-wall-clock-bound-in-tests";
const LIMIT_MS: f64 = 1000.0;
const UPPER_MATCHERS: [&str; 6] = ["toBeLessThan", "toBeLessThanOrEqual", "below", "lessThan", "lt", "most"];
const TRUE_MATCHERS: [&str; 4] = ["toBe", "toBeTruthy", "toEqual", "toStrictEqual"];
const ASSERT: &str = "assert";
const ASSERTS: [&str; 3] = [ASSERT, "ok", "isTrue"];
static BENCHMARK_FILE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\.bench\.[cm]?[jt]sx?$").expect("benchmark pattern"));
const MESSAGE: &str = "This test asserts that measured time stays under a limit below one second, so it fails whenever the machine is slow: a busy CI runner, a garbage collection pause or a cold cache pushes the time over the limit. Assert the behaviour instead (the calls made, or the work counted), and keep speed checks in a benchmark.";

struct Bound<'v> {
    node: Node<'v>,
    duration: Node<'v>,
    limit: Node<'v>,
}

fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn expect_subject(node: Option<Node>) -> Option<Node> {
    let mut current = node?;
    loop {
        if is_expect_call(Some(current)) {
            return current.list("arguments").first().copied().flatten();
        }
        if !current.is("MemberExpression") || name(current.node("property")).as_deref() == Some("not") {
            return None;
        }
        current = current.node("object")?;
    }
}

fn comparison(node: Option<Node>) -> Option<Bound> {
    let node = node.filter(|node| node.is("BinaryExpression"))?;
    let (left, right) = (node.node("left")?, node.node("right")?);
    if left.is("PrivateIdentifier") {
        return None;
    }
    match node.text("operator").as_deref() {
        Some("<" | "<=") => Some(Bound { node, duration: left, limit: right }),
        Some(">" | ">=") => Some(Bound { node, duration: right, limit: left }),
        _ => None,
    }
}

fn is_true(node: Node) -> bool {
    node.is("Literal") && node.get("value") == Value::Bool(true)
}

fn matcher_bound(call: Node) -> Option<Bound> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let matcher = name(callee.node("property")).unwrap_or_default();
    let subject = expect_subject(callee.node("object"))?;
    let argument = call.list("arguments").first().copied().flatten();
    if UPPER_MATCHERS.contains(&matcher.as_str())
        && let Some(limit) = argument
    {
        return Some(Bound { node: call, duration: subject, limit });
    }
    let asserts_true = TRUE_MATCHERS.contains(&matcher.as_str()) && argument.is_none_or(is_true);
    if asserts_true { comparison(Some(subject)) } else { None }
}

fn assert_bound(call: Node) -> Option<Bound> {
    let callee = call.node("callee")?;
    let member = callee.is("MemberExpression");
    let name_of_call = name(if member { callee.node("property") } else { Some(callee) });
    let owner = if member { name(callee.node("object")) } else { Some(ASSERT.to_string()) };
    let asserts = name_of_call.is_some_and(|name| ASSERTS.contains(&name.as_str())) && owner.as_deref() == Some(ASSERT);
    if asserts { comparison(call.list("arguments").first().copied().flatten()) } else { None }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    if BENCHMARK_FILE.is_match(context.file.path) {
        return;
    }
    let mut apis = Apis::new();
    let mut bounds: Vec<Bound> = Vec::new();
    let mut fake_clock = false;
    for node in view.nodes() {
        apis.observe(node);
        if node.is("CallExpression") {
            fake_clock = fake_clock
                || sets_fake_clock(&apis, node)
                || fake_timer_change(&apis, node).is_some_and(|change| change.fake)
                || replaces_clock(node);
            bounds.extend(matcher_bound(node).or_else(|| assert_bound(node)));
        } else if node.is("AssignmentExpression") {
            fake_clock = fake_clock || replaces_clock(node);
        }
    }
    if fake_clock {
        return;
    }
    let tight = bounds.into_iter().filter(|bound| {
        constant_number(scopes, Some(bound.limit)).is_some_and(|value| value < LIMIT_MS) && is_measured_duration(scopes, bound.duration)
    });
    let found: Vec<(u32, u32)> = tight.map(|bound| (bound.node.start(), bound.node.end())).collect();
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.into());
    }
}
