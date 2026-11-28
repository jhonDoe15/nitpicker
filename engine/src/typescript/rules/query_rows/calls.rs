//! `queryScope`, `callChain`, `isOrmCall` and `isQueryResult`: the ORM families a file imports, and whether an
//! awaited call reads a whole list of rows through one of them.
use crate::typescript::rules::held_scopes::estree_calls::is_function;
use crate::typescript::rules::stale_retries::module_scope::module_bindings;
use crate::typescript::rules::stale_retries::receivers::{is_repository_like, receiver_names};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::writes::syntax::{member_name, static_key, string_value, unwrapped};
use regex::Regex;
use std::sync::LazyLock;

pub const TYPEORM: &str = "typeorm";
pub const SEQUELIZE: &str = "sequelize";
pub const MIKRO_ORM: &str = "mikro-orm";
pub const DRIZZLE: &str = "drizzle";

const SEQUELIZE_MODULES: [&str; 4] = ["sequelize", "sequelize-typescript", "@sequelize/core", "@nestjs/sequelize"];
const LIST_QUERIES: [&str; 6] = ["find", "findBy", "findByIds", "findMany", "findAll", "getMany"];
const DRIZZLE_SELECTS: [&str; 2] = ["select", "selectDistinct"];
const PAGES: [&str; 5] = ["take", "skip", "limit", "offset", "cursor"];
static PRISMA_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^prisma(?:service|client)?$").expect("pattern"));

pub struct QueryScope {
    pub families: Vec<&'static str>,
    pub orm: bool,
}

/// `ormFamilyOf`: the ORM family of a module name.
pub fn orm_family_of(source: &str) -> Option<&'static str> {
    if source == "typeorm" || source == "@nestjs/typeorm" {
        return Some(TYPEORM);
    }
    if SEQUELIZE_MODULES.contains(&source) {
        return Some(SEQUELIZE);
    }
    if source.starts_with("@mikro-orm/") {
        return Some(MIKRO_ORM);
    }
    (source == "drizzle-orm" || source.starts_with("drizzle-orm/")).then_some(DRIZZLE)
}

pub fn query_scope(program: Node) -> QueryScope {
    let bindings = module_bindings(program);
    let mut families: Vec<&'static str> = bindings.values().filter_map(|source| orm_family_of(source)).collect();
    families.sort_unstable();
    families.dedup();
    let prisma = bindings.values().any(|source| source.starts_with("@prisma/"));
    QueryScope { orm: !families.is_empty() || prisma, families }
}

pub fn is_member_call(node: Node) -> bool {
    node.is("CallExpression") && node.node("callee").is_some_and(|callee| callee.is("MemberExpression"))
}

/// `callChain`: the calls along a chain of member calls, outermost first.
pub fn call_chain(node: Node) -> Vec<Node> {
    let mut calls = Vec::new();
    let mut current = Some(unwrapped(node));
    while let Some(step) = current {
        if step.is("CallExpression") {
            calls.push(step);
        }
        current = if is_member_call(step) { step.node("callee").and_then(|callee| callee.node("object")).map(unwrapped) } else { None };
    }
    calls
}

fn callee_member_name(call: Node) -> Option<String> {
    call.node("callee").filter(|callee| callee.is("MemberExpression")).and_then(member_name)
}

fn names_of(call: Node) -> Vec<Option<String>> {
    call_chain(call).into_iter().map(callee_member_name).collect()
}

fn is_aggregate_select(call: Node) -> bool {
    let Some(shape) = call.nodes("arguments").into_iter().next().filter(|shape| shape.is("ObjectExpression")) else { return false };
    shape.nodes("properties").into_iter().any(|property| {
        property.is("Property") && property.node("value").is_some_and(|value| unwrapped(value).is("CallExpression"))
    })
}

fn is_drizzle_select(scope: &QueryScope, call: Node) -> bool {
    if !scope.families.contains(&DRIZZLE) {
        return false;
    }
    let calls = call_chain(call);
    let names = names_of(call);
    let Some(from) = names.iter().position(|name| name.as_deref() == Some("from")) else { return false };
    let Some(select) = calls.get(from + 1) else { return false };
    let selected = names.get(from + 1).and_then(|name| name.as_deref()).is_some_and(|name| DRIZZLE_SELECTS.contains(&name));
    selected && !is_aggregate_select(*select) && !names.iter().any(|name| name.as_deref() == Some("groupBy"))
}

fn is_paged(call: Node) -> bool {
    let keyed = call.nodes("arguments").into_iter().map(unwrapped).filter(|options| options.is("ObjectExpression")).any(|options| {
        options.nodes("properties").into_iter().filter_map(static_key).any(|key| PAGES.contains(&key.as_str()))
    });
    keyed || names_of(call).iter().flatten().any(|name| PAGES.contains(&name.as_str()))
}

/// `isOrmCall` with the list queries.
pub fn is_list_call(scope: &QueryScope, call: Node) -> bool {
    is_orm_call(scope, call, &LIST_QUERIES)
}

/// `isOrmCall`: a call of one of the methods on a receiver that reads like a repository, in a file that uses an ORM.
pub fn is_orm_call(scope: &QueryScope, call: Node, methods: &[&str]) -> bool {
    let Some(callee) = call.node("callee") else { return false };
    let names = callee.node("object").map(receiver_names).unwrap_or_default();
    let prisma = names.iter().any(|name| PRISMA_NAME.is_match(name));
    let textual = string_value(call.nodes("arguments").into_iter().next().map(unwrapped)).is_some();
    let method = member_name(callee).is_some_and(|name| methods.contains(&name.as_str()));
    method && !textual && (scope.orm || prisma) && is_repository_like(&names)
}

/// `isQueryResult`: an awaited list query without a callback argument or paging.
pub fn is_query_result(scope: &QueryScope, node: Node) -> bool {
    let awaited = unwrapped(node);
    let call = if awaited.is("AwaitExpression") { awaited.node("argument").map(unwrapped) } else { None };
    let Some(call) = call.filter(|call| is_member_call(*call)) else { return false };
    if call.nodes("arguments").into_iter().any(|argument| is_function(unwrapped(argument))) || is_paged(call) {
        return false;
    }
    is_list_call(scope, call) || is_drizzle_select(scope, call)
}
