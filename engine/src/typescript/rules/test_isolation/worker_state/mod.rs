//! `no-worker-state-in-concurrent-tests`: fake timers, spies, stubs, `process.env` writes, `process.chdir` and
//! implementations set on shared mocks in a test or `beforeEach`/`afterEach` hook that runs beside other
//! concurrent tests of its suite. The `concurrent` setting says whether tests run concurrently by default.
mod state;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_quality::test_calls::{callback_of, chain_has_property, is_suite_call, test_callback};
use crate::typescript::rules::test_runtime::runner_apis::Apis;
use state::{env_write, worker_state_call};

const RULE: &str = "no-worker-state-in-concurrent-tests";
const CONCURRENT: &str = "concurrent";
const SEQUENTIAL: &str = "sequential";
const EACH_HOOKS: [&str; 2] = ["beforeEach", "afterEach"];
const REPEATED_CASES: [&str; 2] = ["each", "for"];
const REPEATED_WEIGHT: usize = 2;
const SWITCHED_OFF: [&str; 2] = ["skip", "todo"];
const ENV_WRITE: &str = "the write to `process.env`";

#[derive(PartialEq, Clone, Copy)]
enum Mode {
    Concurrent,
    Sequential,
    Inherit,
}

struct Owner<'v> {
    call: Node<'v>,
    body: Node<'v>,
    hook: bool,
    concurrent: bool,
}

fn option_is(call: Node, name: &str, value: bool) -> bool {
    call.nodes("arguments").into_iter().any(|argument| {
        argument.is("ObjectExpression")
            && argument.nodes("properties").into_iter().any(|property| {
                property.is("Property")
                    && property.node("key").is_some_and(|key| key.is("Identifier") && key.name().as_deref() == Some(name))
                    && property.node("value").is_some_and(|literal| literal.is("Literal") && literal.get("value") == Value::Bool(value))
            })
    })
}

fn mode_of(call: Node) -> Mode {
    let Some(callee) = call.node("callee") else { return Mode::Inherit };
    if chain_has_property(callee, SEQUENTIAL) || option_is(call, SEQUENTIAL, true) || option_is(call, CONCURRENT, false) {
        return Mode::Sequential;
    }
    if chain_has_property(callee, CONCURRENT) || option_is(call, CONCURRENT, true) { Mode::Concurrent } else { Mode::Inherit }
}

fn is_switched_off(call: Node) -> bool {
    call.node("callee").is_some_and(|callee| SWITCHED_OFF.iter().any(|name| chain_has_property(callee, name)))
}

fn suite_of(call: Node) -> Option<Node> {
    call.ancestors().find(|ancestor| is_suite_call(*ancestor))
}

fn runs_concurrently(call: Node, by_default: bool) -> bool {
    let own = mode_of(call);
    if own != Mode::Inherit {
        return own == Mode::Concurrent;
    }
    let suite = call.ancestors().filter(|ancestor| is_suite_call(*ancestor)).map(mode_of).find(|mode| *mode != Mode::Inherit);
    suite.map_or(by_default, |mode| mode == Mode::Concurrent)
}

fn each_hook_body(call: Node) -> Option<Node> {
    let callee = call.node("callee").filter(|callee| callee.is("Identifier"))?;
    callee.name().is_some_and(|name| EACH_HOOKS.contains(&name.as_ref())).then(|| callback_of(call)).flatten()
}

fn weight_of(owner: &Owner) -> usize {
    let repeated = owner.call.node("callee").is_some_and(|callee| REPEATED_CASES.iter().any(|name| chain_has_property(callee, name)));
    if repeated { REPEATED_WEIGHT } else { 1 }
}

fn owner_of(owners: &[Owner], node: Node) -> Option<usize> {
    (0..owners.len()).rev().find(|at| owners[*at].body.contains(node))
}

fn concurrent_tests_beside(owners: &[Owner], suite: Option<Node>) -> usize {
    owners.iter().filter(|test| !test.hook && test.concurrent && suite_of(test.call) == suite).map(weight_of).sum()
}

fn runs_beside_others(owners: &[Owner], owner: &Owner) -> bool {
    if !owner.hook {
        return owner.concurrent && concurrent_tests_beside(owners, suite_of(owner.call)) >= 2;
    }
    let container = owner.call.parent().and_then(|parent| parent.parent()).unwrap_or(owner.call);
    owners.iter().any(|test| {
        !test.hook && test.concurrent && container.contains(test.call) && concurrent_tests_beside(owners, suite_of(test.call)) >= 2
    })
}

fn visit_call<'v>(scopes: &Scopes<'_, 'v>, apis: &Apis, owners: &mut Vec<Owner<'v>>, by_default: bool, node: Node<'v>) -> Option<String> {
    let test = test_callback(scopes, node);
    let hook = if test.is_none() { each_hook_body(node) } else { None };
    if let Some(body) = test.or(hook) {
        let concurrent = test.is_some() && !is_switched_off(node) && runs_concurrently(node, by_default);
        owners.push(Owner { call: node, body, hook: hook.is_some(), concurrent });
    }
    let owner = owner_of(owners, node)?;
    worker_state_call(apis, scopes, node, owners[owner].body)
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let by_default = context.setting(&format!("{RULE}.{CONCURRENT}")) == Some("true");
    let mut apis = Apis::new();
    let mut owners: Vec<Owner> = Vec::new();
    let mut changes: Vec<(Node, usize, String)> = Vec::new();
    for node in view.nodes() {
        apis.observe(node);
        let what = match node.kind() {
            "CallExpression" => visit_call(scopes, &apis, &mut owners, by_default, node),
            "AssignmentExpression" => env_write(scopes, node.node("left")).then(|| ENV_WRITE.to_string()),
            "UnaryExpression" if node.text("operator").as_deref() == Some("delete") => {
                env_write(scopes, node.node("argument")).then(|| ENV_WRITE.to_string())
            }
            _ => None,
        };
        if let Some((what, owner)) = what.and_then(|what| owner_of(&owners, node).map(|owner| (what, owner))) {
            changes.push((node, owner, what));
        }
    }
    let found: Vec<(u32, u32, String)> = changes
        .into_iter()
        .filter(|(_, owner, _)| runs_beside_others(&owners, &owners[*owner]))
        .map(|(node, _, what)| (node.start(), node.end(), what))
        .collect();
    for (start, end, what) in found {
        let message = format!(
            "Concurrent tests interleave in one worker, so {what} is also live in the other concurrent tests of this file while they await, and which test sees it depends on timing. Run the tests that change worker-wide state in sequence (`describe.sequential`, or drop `.concurrent`), or keep the state inside the test."
        );
        context.report_range(RULE, start, Some(end), message);
    }
}
