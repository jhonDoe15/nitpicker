//! `no-unowned-async-assertion`: an assertion in a timer, microtask, listener or Node callback that the test does
//! not wait for. The plan and `done` checks of `plans.mts` sit here too.
mod completion;
mod facts;
pub mod hosts;
pub mod nodes;
mod steps;

use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::{is_function_node, resolve_constant};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_quality::test_calls::{chain_has_property, is_nested_test, test_callback};
use hosts::{Host, Kind, file_bindings, host_of};
use nodes::{Env, all_nodes, counts_as_assertion, nodes_in, property_name};

const RULE: &str = "no-unowned-async-assertion";
const EXCEPTION_HINT: &str = "An exception fits only when the test waits for the callback in a way nitpicker cannot see.";
const LOST: &str = "a failure is lost or blamed on another test";

fn message(host: &Host) -> String {
    let name = &host.name;
    match host.kind {
        Kind::Timer => format!("This assertion runs in a `{name}` callback the test does not wait for: the test function returns first, so {LOST}. Await a promise the callback resolves, or fake the timers and advance them past it in the test. {EXCEPTION_HINT}"),
        Kind::Microtask => format!("This assertion runs in a `{name}` callback the test does not wait for: the test function returns first, so {LOST}. Await a promise the callback resolves, or `await` after scheduling it so it runs before the test ends. {EXCEPTION_HINT}"),
        Kind::Listener => format!("This assertion runs in a `{name}` handler, and nothing after it in the test triggers the event or waits for it, so the event can arrive after the test has finished and {LOST}. Trigger the event in the test after adding the handler, or await it (`await once(emitter, 'ready')`, or a promise the handler resolves). {EXCEPTION_HINT}"),
        Kind::Callback => format!("This assertion runs in the callback of `{name}`, which Node calls after the test function returns, so {LOST}. Await the promise form of the API (`node:fs/promises`, `util.promisify`) instead. {EXCEPTION_HINT}"),
    }
}

fn uses_vitest(program: Node) -> bool {
    program.nodes("body").into_iter().any(|statement| {
        let source = statement.node("source").and_then(|source| source.text("value")).unwrap_or_default();
        statement.is("ImportDeclaration") && source.strip_prefix("vitest").is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
    })
}

fn row_arity(scopes: &Scopes, call: Node) -> Option<usize> {
    let callee = call.node("callee")?;
    let first = if callee.is("CallExpression") { callee.list("arguments").first().copied().flatten() } else { None };
    let rows = resolve_constant(scopes, first).filter(|rows| rows.is("ArrayExpression"))?;
    let elements = rows.list("elements");
    if elements.is_empty() || elements.iter().any(|row| row.is_none_or(|row| row.is("SpreadElement"))) {
        return None;
    }
    let mut sizes: Vec<usize> = elements.iter().flatten().map(|row| if row.is("ArrayExpression") { row.list("elements").len() } else { 1 }).collect();
    sizes.dedup();
    sizes.sort_unstable();
    sizes.dedup();
    if sizes.len() == 1 { sizes.first().copied() } else { None }
}

fn takes_done(env: &Env, test: Node, call: Node) -> bool {
    if test.flag("async") || uses_vitest(env.program) {
        return false;
    }
    let parameters: Vec<Node> = test.nodes("params").into_iter().filter(|parameter| !(parameter.is("Identifier") && parameter.name().as_deref() == Some("this"))).collect();
    let is_table = ["each", "for"].iter().any(|name| call.node("callee").is_some_and(|callee| chain_has_property(callee, name)));
    let (parameter, must_be_called) = if is_table {
        match row_arity(env.scopes, call) {
            None => (parameters.last().copied(), true),
            Some(arity) => ((parameters.len() == arity + 1).then(|| parameters.last().copied()).flatten(), false),
        }
    } else {
        let node_test = !env.bindings.node_test.named.is_empty() || !env.bindings.node_test.namespaces.is_empty();
        (parameters.get(usize::from(node_test)).copied(), false)
    };
    let Some(parameter) = parameter.filter(|parameter| parameter.is("Identifier")) else { return false };
    let Some(symbol) = env.scopes.variable_named(parameter) else { return false };
    let references = env.scopes.references(symbol);
    if must_be_called {
        references.iter().any(|reference| {
            reference.identifier.parent().is_some_and(|parent| parent.is("CallExpression") && parent.node("callee") == Some(reference.identifier))
        })
    } else {
        !references.is_empty()
    }
}

enum Plan {
    AtLeastOne,
    Count(f64),
}

fn plan_count(statement: Node, test: Node) -> Option<Plan> {
    let call = statement.node("expression").filter(|call| statement.is("ExpressionStatement") && call.is("CallExpression"))?;
    let callee = call.node("callee");
    let receiver = callee.filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object")).filter(|receiver| receiver.is("Identifier"))?;
    let context_name = test.list("params").first().copied().flatten().filter(|first| first.is("Identifier")).and_then(|first| first.name());
    let receiver_name = receiver.name();
    if receiver_name.as_deref() != Some("expect") && (context_name.is_none() || receiver_name != context_name) {
        return None;
    }
    let method = property_name(callee)?;
    if method == "hasAssertions" {
        return Some(Plan::AtLeastOne);
    }
    if method != "assertions" && method != "plan" {
        return None;
    }
    let count = call.list("arguments").first().copied().flatten().filter(|count| count.is("Literal"))?;
    match count.get("value") {
        Value::Number(number) if number.fract() == 0.0 && number >= 1.0 => Some(Plan::Count(number)),
        _ => None,
    }
}

fn is_owned_by_plan(test: Node, sync_assertions: usize) -> bool {
    let statements = test.node("body").filter(|body| body.is("BlockStatement")).map(|body| body.nodes("body")).unwrap_or_default();
    statements.into_iter().filter_map(|statement| plan_count(statement, test)).any(|plan| match plan {
        Plan::AtLeastOne => sync_assertions == 0,
        Plan::Count(count) => count > sync_assertions as f64,
    })
}

fn test_hosts<'s>(env: &Env<'_, '_, 's>, test: Node<'s>) -> (Vec<Host<'s>>, usize) {
    let nodes = nodes_in(test.node("body"), |child| !is_nested_test(env.scopes, child));
    let hosts: Vec<Host> = nodes.iter().filter_map(|node| host_of(env, *node)).collect();
    let in_hosts: std::collections::HashSet<u32> =
        hosts.iter().flat_map(|host| host.callbacks.iter().flat_map(|callback| all_nodes(Some(*callback)))).map(|node| node.index).collect();
    let sync_assertions = nodes.iter().filter(|node| !in_hosts.contains(&node.index) && counts_as_assertion(**node, env.bindings)).count();
    let inside: Vec<bool> = hosts
        .iter()
        .map(|host| {
            let ancestors: Vec<Node> = host.node.ancestors().collect();
            hosts.iter().any(|other| other.node != host.node && other.callbacks.iter().any(|callback| ancestors.contains(callback)))
        })
        .collect();
    let kept = hosts.into_iter().zip(inside).filter(|(_, inside)| !inside).map(|(host, _)| host).collect();
    (kept, sync_assertions)
}

fn is_owned<'s>(env: &Env<'_, '_, 's>, host: &Host<'s>, test: Node<'s>) -> bool {
    if completion::is_inside_completed_promise(env.scopes, host.node, test) || completion::is_inside_scheduler(host.node, test) {
        return true;
    }
    let owners: Vec<Node> = host.node.ancestors().filter(|ancestor| is_function_node(*ancestor)).collect();
    let roots = steps::owner_roots(env.scopes, host.node, test);
    steps::is_owned_by_later_step(host, &steps::step_facts(env, &roots, &owners))
}

fn unowned_hosts<'s>(env: &Env<'_, '_, 's>, call: Node<'s>) -> Vec<Host<'s>> {
    let Some(test) = test_callback(env.scopes, call) else { return Vec::new() };
    if takes_done(env, test, call) {
        return Vec::new();
    }
    let (hosts, sync_assertions) = test_hosts(env, test);
    if hosts.is_empty() || is_owned_by_plan(test, sync_assertions) {
        return Vec::new();
    }
    hosts.into_iter().filter(|host| !is_owned(env, host, test)).collect()
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let program = view.program();
    let bindings = file_bindings(program, &[]);
    let env = Env { scopes, bindings: &bindings, program };
    let mut found = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression")) {
        for host in unowned_hosts(&env, call) {
            found.push((host.node.start(), host.node.end(), message(&host)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
