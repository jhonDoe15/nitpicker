//! `writes-in-units.mts`: the ORM writes of a function that run outside any transaction, and whether the function
//! is a transactional unit itself (a `@Transactional()` method, or one that begins a transaction).
use super::clients::{opener_callback, root_node};
use crate::typescript::rules::held_scopes::estree_calls::calls_within;
use crate::typescript::rules::held_scopes::scopes::{Held, ScopeKind, held_scope};
use crate::typescript::rules::jobs::item_work::is_consumed;
use crate::typescript::rules::orm_sites::{FoundSite, OrmKind, orm_site};
use crate::typescript::rules::security_values::defs;
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;

const TRANSACTION_NAMES: [&str; 10] = ["tx", "trx", "txn", "t", "manager", "em", "runner", "queryRunner", "transaction", "entityManager"];
const BEGINNERS: [&str; 3] = ["begin", "beginTransaction", "startTransaction"];
const TRANSACTIONAL_DECORATORS: [&str; 2] = ["Transactional", "Transaction"];

/// `OrmCall`.
pub struct OrmCall<'v> {
    pub call: Node<'v>,
    pub site: FoundSite<'v>,
}

/// The settings `orms` and `opensTransactions` of a rule.
pub struct WriteOptions {
    pub orms: Vec<String>,
    pub opens_transactions: bool,
}

impl WriteOptions {
    pub fn of(context: &crate::typescript::rules::Context, rule: &str) -> WriteOptions {
        let setting = |key: &str| context.setting(&format!("{rule}.{key}")).and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok());
        let orms = setting("orms").and_then(|value| serde_json::from_value(value).ok()).unwrap_or_default();
        let opens_transactions = setting("opens-transactions").is_some_and(|value| value == serde_json::Value::Bool(true));
        WriteOptions { orms, opens_transactions }
    }
}

fn has_name(name: Option<std::borrow::Cow<str>>) -> bool {
    name.is_some_and(|name| TRANSACTION_NAMES.contains(&name.as_ref()))
}

fn mentions_transaction_name(args: &[Node]) -> bool {
    args.iter().any(|argument| {
        argument.descendants().into_iter().any(|node| {
            (node.is("Identifier") && has_name(node.name())) || (node.is("Property") && has_name(node.node("key").and_then(|key| key.name())))
        })
    })
}

fn root_is_parameter(held: &Held, call: Node) -> bool {
    let root = root_node(call);
    root.is("Identifier") && defs(held.scopes, root).first().is_some_and(|definition| definition.kind == DefKind::Parameter)
}

fn in_fallback_block(call: Node) -> bool {
    call.ancestors().any(|ancestor| {
        ancestor.is("CatchClause") || (ancestor.is("TryStatement") && ancestor.node("finalizer").is_some_and(|finalizer| finalizer.start() <= call.start()))
    })
}

fn begins_transaction(unit: Node) -> bool {
    let Some(body) = unit.node("body") else { return false };
    calls_within(body).into_iter().any(|call| {
        let callee = call.node("callee").filter(|callee| call.is("CallExpression") && callee.is("MemberExpression"));
        callee.and_then(|callee| callee.node("property")).and_then(|property| property.name()).is_some_and(|name| BEGINNERS.contains(&name.as_ref()))
    })
}

fn has_transactional_decorator(unit: Node) -> bool {
    let decorators = unit.parent().map(|parent| parent.nodes("decorators")).unwrap_or_default();
    decorators.into_iter().any(|decorator| {
        let Some(expression) = decorator.node("expression") else { return false };
        let named = if expression.is("CallExpression") { expression.node("callee") } else { Some(expression) };
        named.and_then(|named| named.name()).is_some_and(|name| TRANSACTIONAL_DECORATORS.contains(&name.as_ref()))
    })
}

/// `isTransactionalUnit`.
pub fn is_transactional_unit(unit: Node) -> bool {
    has_transactional_decorator(unit) || begins_transaction(unit)
}

/// `heldScope('transaction', ...)` without types.
pub fn in_held_transaction<'v>(held: &mut Held<'_, 'v>, node: Node<'v>, program: Node<'v>) -> bool {
    held_scope(None, held, ScopeKind::Transaction, node, program).is_some()
}

/// `unitWrites`.
pub fn unit_writes<'v>(held: &mut Held<'_, 'v>, body: Node<'v>, program: Node<'v>, orms: &[String]) -> Vec<OrmCall<'v>> {
    let mut found = Vec::new();
    for call in calls_within(body).into_iter().filter(|call| call.is("CallExpression") && is_consumed(*call)) {
        let Some(site) = orm_site(call, OrmKind::Write, orms).filter(|site| site.site.table.is_some()) else { continue };
        let free = opener_callback(call).is_none()
            && !in_held_transaction(held, call, program)
            && !in_fallback_block(call)
            && !root_is_parameter(held, call)
            && !mentions_transaction_name(&call.nodes("arguments"));
        if free {
            found.push(OrmCall { call, site });
        }
    }
    found
}
