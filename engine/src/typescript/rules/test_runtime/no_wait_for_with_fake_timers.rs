use super::runner_apis::{Apis, TimerChange, fake_timer_change, wait_kind};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-wait-for-with-fake-timers";
const TEST_BLOCKS: &[&str] = &["it", "test", "describe"];
const TEARDOWN_HOOKS: &[&str] = &["afterEach", "afterAll", "after"];
const FAKE_WAIT: &str = "Use an explicit completion signal or advanceTimersByTimeAsync and a direct assertion; waitFor advances fake time.";
const MOCKED_WAIT: &str = "Use an explicit completion signal or mock.timers.tick and a direct assertion; waitFor polls on timers that mock.timers has replaced, so it never settles.";
const CLOCK_WAIT: &str = "Use an explicit completion signal or `await clock.tickAsync(ms)` and a direct assertion; waitFor polls on timers that the sinon fake clock has replaced, so it never settles.";

struct Change<'v> {
    node: Node<'v>,
    owner: Option<Node<'v>>,
    change: TimerChange,
}

fn call_name(node: Option<Node>) -> Option<String> {
    let node = node.filter(|node| node.is("CallExpression"))?;
    let callee = node.node("callee")?;
    let mut root = callee;
    loop {
        let next = match root.kind() {
            "CallExpression" => root.node("callee"),
            "MemberExpression" => root.node("object"),
            _ => None,
        };
        match next {
            Some(next) => root = next,
            None => break,
        }
    }
    if root.is("Identifier") {
        if let Some(name) = root.name().filter(|name| TEST_BLOCKS.contains(&name.as_ref())) {
            return Some(name.into_owned());
        }
    }
    if callee.is("Identifier") {
        return callee.name().map(|name| name.into_owned());
    }
    if callee.is("MemberExpression") && !callee.flag("computed") {
        return callee.node("property").and_then(|property| property.name()).map(|name| name.into_owned());
    }
    None
}

fn owner<'v>(node: Node<'v>) -> Option<Node<'v>> {
    node.ancestors().find(|current| {
        current.is("Program") || call_name(Some(*current)).is_some_and(|name| TEST_BLOCKS.contains(&name.as_str()))
    })
}

fn is_in_teardown(node: Node) -> bool {
    node.ancestors().any(|current| call_name(Some(current)).is_some_and(|name| TEARDOWN_HOOKS.contains(&name.as_str())))
}

fn governing_change<'a, 'v>(changes: &'a [Change<'v>], wait: Node<'v>) -> Option<&'a TimerChange> {
    let mut scope = owner(wait);
    while let Some(current) = scope {
        let is_describe = call_name(Some(current)).as_deref() == Some("describe");
        let found = changes.iter().rev().find(|change| {
            change.owner == Some(current) && (is_describe || current.is("Program") || change.node.start() < wait.start())
        });
        if let Some(found) = found {
            return Some(&found.change);
        }
        scope = owner(current);
    }
    None
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut apis = Apis::new();
    let mut changes: Vec<Change> = Vec::new();
    let mut waits: Vec<(Node, &str)> = Vec::new();
    for node in view.nodes() {
        apis.observe(node);
        if !node.is("CallExpression") {
            continue;
        }
        if let Some(kind) = wait_kind(&apis, node) {
            waits.push((node, kind));
        }
        let Some(change) = fake_timer_change(&apis, node) else { continue };
        if !is_in_teardown(node) {
            changes.push(Change { node, owner: owner(node), change });
        }
    }
    for (wait, kind) in waits {
        let Some(change) = governing_change(&changes, wait).filter(|change| change.fake) else { continue };
        if (kind == "vitest") != (change.kind == "vitest") {
            continue;
        }
        let message = match change.kind {
            "node" => MOCKED_WAIT,
            "sinon" => CLOCK_WAIT,
            _ => FAKE_WAIT,
        };
        context.report_range(RULE, wait.start(), Some(wait.end()), message.to_string());
    }
}
