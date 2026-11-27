//! `no-fixed-sleep-synchronization`: a test that sleeps for a fixed time, or asserts absence by letting a wait time
//! out. The test fixtures (the `fixture` setting) are left alone.
mod numbers;
mod waits;

use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::resolve_constant;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::{module_bindings, property_name};
use crate::typescript::rules::test_checks::is_expect_call;
use crate::typescript::rules::test_quality::runner_words::runner_word;
use numbers::constant_number;
use waits::{is_promise_executor_sleep, is_ui_wait};

const RULE: &str = "no-fixed-sleep-synchronization";
const TIMER_PROMISE_MODULES: [&str; 2] = ["timers/promises", "node:timers/promises"];
const EXCEPTION_HINT: &str = "An exception fits only when a real wait is unavoidable.";

#[derive(Clone, Copy, PartialEq)]
enum Found {
    FixedSleep,
    NegativeTimeout,
    PlaywrightTimeout,
    CypressWait,
}

fn first_argument(call: Node) -> Option<Node> {
    call.list("arguments").first().copied().flatten()
}

fn is_cypress_wait(scopes: &Scopes, call: Node) -> bool {
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    let object = callee.node("object").filter(|object| object.is("Identifier"));
    object.is_some_and(|object| object.name().as_deref() == Some("cy"))
        && property_name(Some(callee)).as_deref() == Some("wait")
        && !call.list("arguments").is_empty()
        && constant_number(scopes, first_argument(call)).is_some_and(|delay| delay > 0.0)
}

fn is_playwright_timeout(call: Node) -> bool {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
    property_name(callee).as_deref() == Some("waitForTimeout")
}

fn findings<'v>(view: &'v crate::typescript::rules::support::view::View, scopes: &Scopes<'_, 'v>) -> Vec<(Found, Node<'v>)> {
    let timer_promises = module_bindings(view.program(), &TIMER_PROMISE_MODULES);
    let mut found = Vec::new();
    for node in view.nodes() {
        match node.kind() {
            "AwaitExpression" if node.node("argument").is_some_and(|argument| is_promise_executor_sleep(argument, &timer_promises)) => {
                found.push((Found::FixedSleep, node));
            }
            "CallExpression" => {
                if is_playwright_timeout(node) {
                    found.push((Found::PlaywrightTimeout, node));
                }
                if is_cypress_wait(scopes, node) {
                    found.push((Found::CypressWait, node));
                }
            }
            "MemberExpression" if property_name(Some(node)).as_deref() == Some("rejects") => {
                let Some(expect_call) = node.node("object").filter(|object| object.is("CallExpression") && is_expect_call(Some(*object))) else { continue };
                if is_ui_wait(scopes, resolve_constant(scopes, first_argument(expect_call))) {
                    found.push((Found::NegativeTimeout, expect_call));
                }
            }
            _ => {}
        }
    }
    found
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    if context.setting(&format!("{RULE}.fixture")) == Some("true") {
        return;
    }
    let found = findings(view, scopes);
    let wait = runner_word(context, RULE, "wait-on-condition").to_string();
    let advance = runner_word(context, RULE, "advance-fake-time").to_string();
    for (kind, node) in found {
        let message = match kind {
            Found::FixedSleep => format!("Fixed sleeps are non-deterministic; wait on a condition with {wait}. {EXCEPTION_HINT}"),
            Found::NegativeTimeout => format!("Do not assert absence by letting a wait time out: `.rejects` passes only after the full timeout, so the test is slow and depends on the delay. Advance fake timers past the delay (`{advance}`) and assert absence at once, such as `expect(screen.queryByRole('tooltip')).toBeNull()`. {EXCEPTION_HINT}"),
            Found::PlaywrightTimeout => format!("`waitForTimeout` sleeps on wall-clock time. Wait on a condition instead, such as `await expect(locator).toBeVisible()`. {EXCEPTION_HINT}"),
            Found::CypressWait => format!("`cy.wait(<number>)` sleeps on wall-clock time. Wait on a request alias (`cy.wait('@request')`) or retry an assertion (`cy.get(selector).should('be.visible')`). {EXCEPTION_HINT}"),
        };
        context.report_range(RULE, node.start(), Some(node.end()), message);
    }
}
