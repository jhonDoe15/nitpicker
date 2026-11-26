//! `no-remote-call-in-transaction` and `no-remote-call-under-lock`: a call whose effects include a remote call,
//! made while a database transaction is open (when the scope also proves a connection by a database call) or
//! while a lock is held (unless the call fills state once).
use super::fill_once::is_fill_once;
use super::owners::compiler_call;
use super::scopes::{Held, HeldScope, ScopeKind, held_scope};
use super::estree_calls::call_view;
use crate::typescript::rules::Context;
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::effects::describe_path;
use crate::typescript::rules::effects::summaries::State;
use crate::typescript::rules::effects::tags::{get, has};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;

const TRANSACTION: &str = "no-remote-call-in-transaction";
const LOCK: &str = "no-remote-call-under-lock";

const TRANSACTION_MESSAGE: &str = "This calls {{callee}} inside the transaction of `{{scope}}`, so a database connection stays held for the remote call's latency and the pool runs dry under load. Make the remote call before the transaction starts or after it commits; when its side effect must match the transaction's outcome, write an outbox row inside the transaction and send it from a worker. An exception fits only when the remote call must see uncommitted state and has a short timeout.";
const LOCK_MESSAGE: &str = "This calls {{callee}} while `{{scope}}` holds a lock, so every waiter queues behind the remote call's latency (lock exhaustion under load). Make the remote call before taking the lock or after releasing it, and keep only the shared-state change under the lock; when the remote side effect must match it, record it in an outbox row and send it from a worker. A fill-once block stays allowed: the call under an `if` that tests the state the block then sets (a token refresh, a cached download), so callers wait for one request instead of each sending their own. An exception fits only when the lock exists to serialize that remote call.";

fn effects_of(types: &mut Types, state: &mut State, call: Node) -> Option<std::rc::Rc<Vec<(&'static str, Vec<String>)>>> {
    let compiler = compiler_call(types, call)?;
    Some(state.call_effects(types, &compiler))
}

/// `chainOuterCall`: the call a call's result is a link of (`a.b().c()` for `a.b()`).
fn outer_call(call: Node) -> Option<Node> {
    let member = call.parent().filter(|member| member.is("MemberExpression") && member.node("object") == Some(call))?;
    member.parent().filter(|outer| outer.is("CallExpression") && outer.node("callee") == Some(member))
}

fn remote_path(types: &mut Types, state: &mut State, call: Node) -> Option<Vec<String>> {
    let effects = effects_of(types, state, call)?;
    let path = get(&effects, "remote").cloned();
    let repeated = outer_call(call).and_then(|outer| effects_of(types, state, outer)).is_some_and(|effects| has(&effects, "remote"));
    if repeated { None } else { path }
}

fn proves_connection(types: &mut Types, state: &mut State, scope: &HeldScope) -> bool {
    scope.calls.iter().any(|call| effects_of(types, state, *call).is_some_and(|effects| has(&effects, "database")))
}

fn check(context: &mut Context, kind: ScopeKind) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let (rule, message) = if kind == ScopeKind::Transaction { (TRANSACTION, TRANSACTION_MESSAGE) } else { (LOCK, LOCK_MESSAGE) };
    let source = context.file.text;
    let setting = context.setting(&format!("{rule}.test-sources")).map(str::to_string);
    let mut types = types.borrow_mut();
    if types.refused.is_some() {
        return;
    }
    let mut state: State = types.take_store();
    state.with_tests(setting.as_deref());
    let mut held = Held::of(scopes);
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression") || node.is("TaggedTemplateExpression")) {
        if types.refused.is_some() {
            break;
        }
        let Some(scope) = held_scope(&mut types, &mut held, kind, node, view.program()) else { continue };
        let Some(path) = remote_path(&mut types, &mut state, node) else { continue };
        let skipped = if kind == ScopeKind::Transaction { !proves_connection(&mut types, &mut state, &scope) } else { is_fill_once(source, node, scope.root) };
        if skipped {
            continue;
        }
        let label = call_view(scope.opener).map(|view| view.label).unwrap_or_default();
        found.push((node.start(), node.end(), interpolate(message, &[("callee", &describe_path(&path)), ("scope", &label)])));
    }
    let refused = types.refused.is_some();
    types.put_store(if refused { state.after_refusal() } else { state });
    drop(types);
    if refused {
        return;
    }
    for (start, end, text) in found {
        context.report_range(rule, start, Some(end), text);
    }
}

pub fn no_remote_call_in_transaction(context: &mut Context) {
    check(context, ScopeKind::Transaction);
}

pub fn no_remote_call_under_lock(context: &mut Context) {
    check(context, ScopeKind::Lock);
}
