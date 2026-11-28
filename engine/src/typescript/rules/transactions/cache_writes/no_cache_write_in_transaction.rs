//! `no-cache-write-in-transaction`: a cache client written, or an in-memory map filled with a value an ORM write
//! returned, inside a database transaction and not in an after-commit hook.
use super::after_commit::in_after_commit_hook;
use super::cache_clients::{CacheKind, Clients, cache_kind_of};
use super::written_values::written_value;
use crate::typescript::rules::Context;
use crate::typescript::rules::held_scopes::scopes::{Held, ScopeKind, held_scope};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::transactions::clients::transaction_callback;
use crate::typescript::rules::transactions::no_unatomic_writes::label;
use crate::typescript::rules::writes::imports::imported_bindings;

const RULE: &str = "no-cache-write-in-transaction";
const ROLLBACK: &str = "a rollback undoes the database change but not the cache write";

struct Transaction<'v> {
    opener: Node<'v>,
    body: Node<'v>,
}

fn transaction_of<'v>(held: &mut Held<'_, 'v>, node: Node<'v>, program: Node<'v>) -> Option<Transaction<'v>> {
    if let Some(function) = transaction_callback(node) {
        return Some(Transaction { opener: function.parent()?, body: function.node("body")? });
    }
    let scope = held_scope(None, held, ScopeKind::Transaction, node, program)?;
    let builder = scope.opener.parent().is_some_and(|parent| parent.is("MemberExpression"));
    (scope.param.is_some() && !builder).then_some(Transaction { opener: scope.opener, body: scope.root })
}

fn cache_message(write: &str, opener: &str) -> String {
    format!(
        "This writes the cache with `{write}` inside the transaction opened by `{opener}`: {ROLLBACK}, so other requests and nodes keep reading a value or an eviction that never happened until it expires. Move the cache write after the transaction commits: after `await {opener}` returns (a TypeORM `afterTransactionCommit` subscriber also runs after the commit)."
    )
}

fn local_message(written: &str, write: &str, opener: &str) -> String {
    format!(
        "This stores a value written by `{written}` in the in-memory `{write}` inside the transaction opened by `{opener}`: {ROLLBACK}, so the map keeps a row or generated id that was never committed. Fill the map after the transaction commits (after `await {opener}` returns) from the returned value."
    )
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let program = view.program();
    let clients = Clients { scopes, bindings: imported_bindings(program) };
    let mut held = Held::of(scopes);
    let mut found = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(kind) = cache_kind_of(&clients, call) else { continue };
        let Some(transaction) = transaction_of(&mut held, call, program) else { continue };
        if in_after_commit_hook(call, transaction.body) {
            continue;
        }
        let write = label(call);
        let opener = label(transaction.opener);
        if kind == CacheKind::Client {
            found.push((call.start(), call.end(), cache_message(&write, &opener)));
            continue;
        }
        let written = written_value(scopes, &call.nodes("arguments"), transaction.body).filter(|written| written.is("CallExpression"));
        if let Some(written) = written {
            found.push((call.start(), call.end(), local_message(&label(written), &write, &opener)));
        }
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
