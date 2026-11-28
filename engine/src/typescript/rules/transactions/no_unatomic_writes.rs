//! `no-unatomic-writes`: a write inside a transaction callback that goes through a client from outside it, and, in
//! a project that opens transactions, a function that awaits writes to two tables with no transaction.
use super::branches::in_exclusive_branches;
use super::clients::{ClientOrigin, client_origin, mentions_transaction, root_node, transaction_callback};
use super::units::{OrmCall, WriteOptions, is_transactional_unit, unit_writes};
use crate::typescript::rules::Context;
use crate::typescript::rules::held_scopes::estree_calls::{call_view, runs_with_caller};
use crate::typescript::rules::held_scopes::scopes::Held;
use crate::typescript::rules::jobs::item_work::is_consumed;
use crate::typescript::rules::orm_sites::{OrmKind, orm_site};
use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-unatomic-writes";
const OPTIONS_INDEX: [(&str, usize); 9] =
    [("create", 1), ("bulkCreate", 1), ("update", 1), ("upsert", 1), ("increment", 1), ("decrement", 1), ("destroy", 0), ("restore", 0), ("findOrCreate", 0)];

/// `estreeCallView(call, undefined).label`.
pub fn label(call: Node) -> String {
    call_view(call).map(|view| view.label).unwrap_or_default()
}

fn sequelize_escapes(scopes: &Scopes, found: &OrmCall, function: Node) -> bool {
    let method = found.site.chain.steps.last().and_then(|step| step.name.as_deref());
    let index = OPTIONS_INDEX.iter().find(|(name, _)| Some(*name) == method).map(|(_, index)| *index);
    let args = found.call.nodes("arguments");
    let options = index.and_then(|index| found.call.list("arguments").get(index).copied().flatten());
    if mentions_transaction(scopes, &args, function) {
        return false;
    }
    let Some(options) = options else { return true };
    let properties = options.nodes("properties");
    options.is("ObjectExpression")
        && properties.iter().all(|property| property.is("Property"))
        && !properties.iter().any(|property| property.node("key").and_then(|key| key.name()).as_deref() == Some("transaction"))
}

fn escapes(scopes: &Scopes, found: &OrmCall, function: Node) -> bool {
    match found.site.site.orm {
        "mikro" => false,
        "sequelize" => sequelize_escapes(scopes, found, function),
        _ => {
            let root = root_node(found.call);
            let origin = if root.is("Identifier") { client_origin(scopes, root, function) } else { ClientOrigin::Other };
            origin == ClientOrigin::Other && !mentions_transaction(scopes, &found.call.nodes("arguments"), function)
        }
    }
}

fn conflicting_pair<'w, 'v>(writes: &'w [OrmCall<'v>]) -> Option<(&'w OrmCall<'v>, &'w OrmCall<'v>)> {
    writes.iter().enumerate().find_map(|(index, second)| {
        writes[..index].iter().find(|earlier| earlier.site.site.table != second.site.site.table && !in_exclusive_branches(earlier.call, second.call)).map(|first| (first, second))
    })
}

fn escaped_message(client: &str, opener: &str) -> String {
    format!(
        "This writes through `{client}` inside the transaction opened by `{opener}`, so the write runs outside that transaction and is not rolled back with the others. Write through the callback parameter (or pass it down), not a client or repository from outside. An exception fits only when the write must survive a rollback."
    )
}

fn separate_message(first: &str, second: &str) -> String {
    format!(
        "This function awaits writes to `{first}` and `{second}` with no transaction, so a crash or a concurrent request between them leaves half-written state. Run the writes in one transaction and pass its manager down, or use one atomic statement (`upsert`, `insert ... on conflict`). An exception fits only when the writes are independent (an audit log, a best-effort cleanup)."
    )
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let options = WriteOptions::of(context, RULE);
    if options.orms.is_empty() {
        return;
    }
    let program = view.program();
    let mut held = Held::of(scopes);
    let mut found = Vec::new();
    for node in view.nodes() {
        if node.is("CallExpression") {
            let function = if is_consumed(node) { transaction_callback(node) } else { None };
            let Some(function) = function else { continue };
            let Some(site) = orm_site(node, OrmKind::Write, &options.orms) else { continue };
            let write = OrmCall { call: node, site };
            if escapes(scopes, &write, function) {
                let opener = function.parent().map(label).unwrap_or_default();
                found.push((node.start(), node.end(), escaped_message(&label(node), &opener)));
            }
            continue;
        }
        if !is_function_node(node) || !options.opens_transactions || runs_with_caller(node) || is_transactional_unit(node) {
            continue;
        }
        let Some(body) = node.node("body") else { continue };
        let writes = unit_writes(&mut held, body, program, &options.orms);
        if let Some((first, second)) = conflicting_pair(&writes) {
            found.push((second.call.start(), second.call.end(), separate_message(&label(first.call), &label(second.call))));
        }
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
