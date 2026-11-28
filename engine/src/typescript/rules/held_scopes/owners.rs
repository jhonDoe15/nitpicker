//! `isOwned`: whether a scope opener belongs to a database (transactions) or a lock library, from the
//! package its callee is declared in, or for project code and locks by the receiver's name.
use super::scopes::ScopeKind;
use crate::typescript::rules::effects::callees::calls::{CalleeOrigin, callee_origin};
use crate::typescript::rules::effects::packages::is_database_package;
use crate::typescript::rules::effects::tags::words_of;
use crate::typescript::rules::effects::views::{At, CallView};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind as k;

const LOCK_OWNERS: [&str; 4] = ["lock", "locks", "mutex", "redlock"];
const LOCK_PACKAGES: [&str; 2] = ["async-lock", "redlock"];

pub struct Opener<'o, 'v> {
    pub call: Node<'v>,
    pub view: &'o CallView<Node<'v>>,
    /// The opener runs a callback (`role: 'callbacks'`), rather than beginning a range.
    pub callbacks: bool,
}

/// The compiler's node of a call of the file being checked.
pub fn compiler_call(types: &mut Types, call: Node) -> Option<At> {
    let kind = if call.is("TaggedTemplateExpression") { k::TAGGED_TEMPLATE_EXPRESSION } else { k::CALL_EXPRESSION };
    let found = types.handle_at(Some(kind), call.start(), call.end()).and_then(|handle| At::of(types, &handle));
    if found.is_none() {
        types.refuse("the compiler has no node for a call of the file");
    }
    found
}

fn single_permit(scopes: &Scopes, call: Node) -> bool {
    let receiver = call.node("callee").filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object"));
    let Some(receiver) = receiver.filter(|receiver| receiver.is("Identifier")) else { return false };
    let Some(name) = receiver.name() else { return false };
    let Some(variable) = scopes.variable_by_name(&name, receiver.start()) else { return false };
    let Some(definition) = scopes.defs(variable).into_iter().next() else { return false };
    let init = definition.node.node("init").filter(|_| definition.kind == DefKind::Variable);
    let permits = init.filter(|init| init.is("NewExpression")).and_then(|init| init.nodes("arguments").first().copied());
    permits.is_some_and(|permits| permits.is("Literal") && permits.get("value") == Value::Number(1.0))
}

fn named_lock(scopes: &Scopes, opener: &Opener) -> bool {
    let names = &opener.view.names;
    let owners: Vec<Option<String>> = names[..names.len().saturating_sub(1)].iter().map(|name| words_of(name).pop()).collect();
    if owners.iter().any(|owner| owner.as_deref() == Some("semaphore")) {
        return single_permit(scopes, opener.call);
    }
    opener.view.method.as_deref() == Some("runExclusive") || owners.iter().flatten().any(|owner| LOCK_OWNERS.contains(&owner.as_str()))
}

fn typed_lock(scopes: &Scopes, origin: &CalleeOrigin, opener: &Opener) -> bool {
    match origin.package.as_deref() {
        None => named_lock(scopes, opener),
        Some("async-mutex") => !origin.owner.as_deref().is_some_and(|owner| owner.starts_with("Semaphore")) || single_permit(scopes, opener.call),
        Some("lib") => origin.owner.as_deref() == Some("LockManager"),
        Some(package) => LOCK_PACKAGES.contains(&package),
    }
}

/// Without types (`services === undefined`) every transaction opener is owned and locks go by name.
pub fn is_owned(types: Option<&mut Types>, scopes: &Scopes, kind: ScopeKind, opener: &Opener) -> bool {
    let origin = types.and_then(|types| compiler_call(types, opener.call).and_then(|call| callee_origin(types, &call)));
    match (kind, origin) {
        (ScopeKind::Transaction, None) => true,
        (ScopeKind::Transaction, Some(origin)) => {
            is_database_package(origin.package.as_deref().unwrap_or_default()) || (opener.callbacks && origin.package.is_none())
        }
        (ScopeKind::Lock, None) => named_lock(scopes, opener),
        (ScopeKind::Lock, Some(origin)) => typed_lock(scopes, &origin, opener),
    }
}
