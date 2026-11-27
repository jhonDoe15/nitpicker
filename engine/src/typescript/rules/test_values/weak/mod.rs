//! `no-weak-assertion`: an expectation or `assert` call that passes for any present value, any non-empty value or a
//! call with any arguments.
mod forms;
mod text;

use crate::typescript::rules::Context;
use forms::{Family, assert_form, expect_form};
use text::{assert_text, expect_text, narrowed_later};

const RULE: &str = "no-weak-assertion";
const EXCEPTION_ROUTE: &str = "An exception fits only when the value cannot be pinned.";

fn matcher_message(family: Family, found: &str) -> String {
    match family {
        Family::Presence(absent) => format!(
            "`{found}` passes for any value but {absent}, the same weak check as `not.toBeNull`. Assert the value itself with `toBe` or `toEqual`, such as `expect(user).toEqual({{ id: 1 }})`. {EXCEPTION_ROUTE}"
        ),
        Family::NonEmpty => format!(
            "`{found}` passes for any non-empty value. Assert the contents or the exact length, such as `expect(rows).toEqual([...])` or `expect(rows).toHaveLength(3)`. {EXCEPTION_ROUTE}"
        ),
        Family::WildcardCall => format!(
            "`{found}` passes for a call with any arguments. Pass the values the call should receive, such as `expect(spy).toHaveBeenCalledWith(orderId)`; keep `expect.any(Type)` for an argument that varies and pin the others. {EXCEPTION_ROUTE}"
        ),
    }
}

fn assert_message(family: Family, found: &str) -> String {
    match family {
        Family::Presence(absent) => format!(
            "`{found}` passes for any value but {absent}. Assert the value itself, such as `assert.deepStrictEqual(user, {{ id: 1 }})` or `assert.strictEqual(user.id, 1)`. {EXCEPTION_ROUTE}"
        ),
        _ => format!(
            "`{found}` passes for any non-empty value. Assert the contents or the exact length, such as `assert.deepStrictEqual(rows, [...])` or `assert.strictEqual(rows.length, 3)`. {EXCEPTION_ROUTE}"
        ),
    }
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut found: Vec<(u32, u32, String)> = Vec::new();
    let mut asserts = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression")) {
        if let Some((family, expectation)) = expect_form(call) {
            if let Some(property) = expectation.property {
                found.push((property.start(), property.end(), matcher_message(family, &expect_text(context, &expectation))));
            }
            continue;
        }
        if let Some(form) = assert_form(call) {
            asserts.push((call, form));
        }
    }
    let asked: Vec<_> = asserts
        .iter()
        .filter_map(|(call, form)| form.narrowed.filter(|subject| matches!(subject.kind(), "Identifier" | "MemberExpression")).map(|subject| (*call, subject)))
        .collect();
    let mut narrowed = if asked.is_empty() { Vec::new() } else { narrowed_later(context, view.program(), &asked) }.into_iter();
    for (call, form) in &asserts {
        let checked = form.narrowed.is_some_and(|subject| matches!(subject.kind(), "Identifier" | "MemberExpression"));
        if checked && narrowed.next().unwrap_or(false) {
            continue;
        }
        found.push((call.start(), call.end(), assert_message(form.family, &assert_text(context, *call))));
    }
    found.sort_by_key(|(start, end, _)| (*start, *end));
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
