//! `no-assertion-in-loop`: an assertion in a loop or iterating callback that can run zero times, reported once per
//! outermost loop at its first assertion, in the test and in the helpers it calls.
mod loops;
mod sites;
mod subtests;

use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::resolve_constant;
use crate::typescript::rules::signatures::{ASSERTION_FORMS, unwrap};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::hosts::file_bindings;
use loops::{Construct, loops_around};
use sites::{LoopEnv, Site, facts_of, site_kind};

const RULE: &str = "no-assertion-in-loop";
const ALLOWED_FORMS: &str = "Assert the whole collection at once (`expect(orders).toEqual([...])`, `assert.deepStrictEqual(orders, [...])`), put a table of cases in a parameterized test (`it.each`/`test.each`, or node:test subtests registered from a literal table), or use the loop only to build data before an unconditional assertion.";
const EXCEPTION_HINT: &str = "An exception fits only when the loop cannot be replaced by one of these, for example cases generated at run time.";

struct Finding<'v> {
    site: Node<'v>,
    kind: Site,
    loop_: Construct<'v>,
}

fn is_literal_table(scopes: &Scopes, collection: Option<Node>) -> bool {
    let table = resolve_constant(scopes, collection).map(|resolved| unwrap(resolved, ASSERTION_FORMS));
    table.is_some_and(|table| table.is("ArrayExpression") && !table.list("elements").is_empty())
}

fn loop_findings<'s>(env: &mut LoopEnv<'_, '_, 's>, function: Node<'s>) -> Vec<Finding<'s>> {
    let facts = facts_of(env, function);
    let mut groups: Vec<(u32, Finding)> = Vec::new();
    for node in facts.nodes.iter().copied() {
        let Some(kind) = site_kind(env, node) else { continue };
        let mut loops = loops_around(node, function);
        if kind == Site::Subtest {
            loops.retain(|each| !is_literal_table(env.scopes, each.collection));
        }
        let Some(outer) = loops.pop() else { continue };
        let key = outer.node.index;
        match groups.iter_mut().find(|(group, _)| *group == key) {
            Some((_, best)) if node.start() < best.site.start() => *best = Finding { site: node, kind, loop_: outer },
            Some(_) => {}
            None => groups.push((key, Finding { site: node, kind, loop_: outer })),
        }
    }
    groups.into_iter().map(|(_, finding)| finding).collect()
}

fn reachable_findings<'s>(env: &mut LoopEnv<'_, '_, 's>, test: Node<'s>) -> Vec<Finding<'s>> {
    let mut queued = vec![test];
    let mut index = 0;
    let mut findings = Vec::new();
    while index < queued.len() {
        let function = queued[index];
        index += 1;
        if !env.analyzed.insert(function.index) {
            continue;
        }
        findings.extend(loop_findings(env, function));
        for callee in facts_of(env, function).callees.iter() {
            if !queued.contains(callee) {
                queued.push(*callee);
            }
        }
    }
    findings
}

fn message(scopes: &Scopes, finding: &Finding) -> String {
    let construct = &finding.loop_.name;
    if finding.kind == Site::Subtest {
        return format!("These node:test subtests are registered in a `{construct}` over a collection that can be empty, so no case may run and the test can pass without asserting anything. Register them from a literal, non-empty table (`for (const row of [...]) {{ await t.test(row.name, () => {{ ... }}); }}`, or a same-file const holding that array), or assert the whole collection at once. {EXCEPTION_HINT}");
    }
    if is_literal_table(scopes, finding.loop_.collection) {
        return format!("This assertion runs once per row of a literal table in a `{construct}`: in Vitest, Jest and Mocha write the table as `it.each([...])('name', (row) => {{ ... }})` (or `test.each`), so each row is its own test and a table that comes up empty cannot pass unnoticed; in node:test register one subtest per row (`for (const row of [...]) {{ await t.test(row.name, () => {{ ... }}); }}`). To check one collection instead, assert it whole (`expect(rows).toEqual([...])`). {EXCEPTION_HINT}");
    }
    format!("This assertion sits in a `{construct}` whose body can run zero times (an empty collection, or a condition that is false at the start), so the test can pass without asserting anything. {ALLOWED_FORMS} {EXCEPTION_HINT}")
}

fn assertion_names(context: &Context) -> Vec<String> {
    let names = context.setting(&format!("{RULE}.assertion-function-names")).unwrap_or("[]");
    serde_json::from_str(names).unwrap_or_default()
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let bindings = file_bindings(view.program(), &assertion_names(context));
    let mut env = LoopEnv::new(scopes, &bindings);
    let mut found = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(test) = subtests::test_body(scopes, call) else { continue };
        for finding in reachable_findings(&mut env, test) {
            found.push((finding.site.start(), finding.site.end(), message(scopes, &finding)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
