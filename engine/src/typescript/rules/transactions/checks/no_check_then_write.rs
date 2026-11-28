//! `no-check-then-write`: in a project that opens transactions, a write that a plain read of the same table decided.
use super::reads::{Unit, decided_write, unit_reads};
use crate::typescript::rules::Context;
use crate::typescript::rules::held_scopes::estree_calls::runs_with_caller;
use crate::typescript::rules::held_scopes::scopes::Held;
use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::transactions::no_unatomic_writes::label;
use crate::typescript::rules::transactions::units::{WriteOptions, is_transactional_unit, unit_writes};

const RULE: &str = "no-check-then-write";

fn message(read: &str) -> String {
    format!(
        "This writes after `{read}` decided it with no transaction or lock, so two concurrent callers can both pass the check (a limit is exceeded, a version is overwritten). Take a row lock inside a transaction (`FOR UPDATE`, a pessimistic lock option), or use an atomic statement (`upsert`, `insert ... on conflict`, `update ... where version = ?`). An exception fits only when a concurrent caller cannot reach this code."
    )
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let options = WriteOptions::of(context, RULE);
    if options.orms.is_empty() || !options.opens_transactions {
        return;
    }
    let program = view.program();
    let mut held = Held::of(scopes);
    let mut found = Vec::new();
    for function in view.nodes().filter(|node| is_function_node(*node)) {
        if runs_with_caller(function) || is_transactional_unit(function) {
            continue;
        }
        let Some(body) = function.node("body") else { continue };
        let mut unit = Unit { held: &mut held, text: context.file.text, body, program };
        let writes = unit_writes(unit.held, body, program, &options.orms);
        for read in unit_reads(&mut unit, &options.orms) {
            if let Some(write) = decided_write(&unit, &read, &writes) {
                found.push((write.call.start(), write.call.end(), message(&label(read.call))));
            }
        }
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
