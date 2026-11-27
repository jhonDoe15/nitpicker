//! `query-calls.mts`: the awaited ORM list query whose rows a file loads whole, recognised without type information
//! by the receiver's names and the ORMs the file imports.
use crate::typescript::rules::database::modules::{Family, ModuleScope};
use crate::typescript::rules::queries::js_patterns::member_name;
use crate::typescript::rules::security_values::{is_function_node, static_key, unwrapped};
use crate::typescript::rules::urls::values::string_value;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const LIST_QUERIES: [&str; 6] = ["find", "findBy", "findByIds", "findMany", "findAll", "getMany"];
const PRISMA_PACKAGE: &str = "@prisma/";
const DRIZZLE_FROM: &str = "from";
const DRIZZLE_SELECTS: [&str; 2] = ["select", "selectDistinct"];
const DRIZZLE_GROUPING: &str = "groupBy";
const PAGES: [&str; 5] = ["take", "skip", "limit", "offset", "cursor"];
const RECEIVER_NAMES: [&str; 5] = ["em", "db", "tx", "trx", "query"];

static PRISMA_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^prisma(?:service|client)?$").expect("pattern"));
static RECEIVER_WORDS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)repo|manager|model|prisma|orm|entit").expect("pattern"));

/// `queryScope`: whether the file loads an ORM or Prisma, and whether it loads Drizzle.
pub struct QueryScope {
    pub orm: bool,
    pub drizzle: bool,
}

impl QueryScope {
    pub fn of(module: &ModuleScope) -> QueryScope {
        let prisma = module.sources().any(|source| source.starts_with(PRISMA_PACKAGE));
        QueryScope { orm: !module.families.is_empty() || prisma, drizzle: module.has(Family::Drizzle) }
    }
}

fn is_member_call(node: Node) -> bool {
    node.is("CallExpression") && node.node("callee").is_some_and(|callee| callee.is("MemberExpression"))
}

/// `callChain`: the calls of a member call chain, outermost first.
pub fn call_chain(node: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut current = Some(unwrapped(node));
    while let Some(node) = current {
        found.push(node);
        current = if is_member_call(node) { node.node("callee").and_then(|callee| callee.node("object")).map(unwrapped) } else { None };
    }
    found.retain(|node| node.is("CallExpression"));
    found
}

fn is_aggregate_select(call: Node) -> bool {
    let Some(shape) = call.nodes("arguments").first().copied().filter(|shape| shape.is("ObjectExpression")) else { return false };
    shape.nodes("properties").into_iter().any(|property| property.is("Property") && property.node("value").is_some_and(|value| unwrapped(value).is("CallExpression")))
}

fn names_of(call: Node) -> Vec<Option<String>> {
    call_chain(call).into_iter().map(|current| current.node("callee").filter(|callee| callee.is("MemberExpression")).and_then(member_name)).collect()
}

fn is_drizzle_select(scope: &QueryScope, call: Node) -> bool {
    if !scope.drizzle {
        return false;
    }
    let calls = call_chain(call);
    let names = names_of(call);
    let Some(from) = names.iter().position(|name| name.as_deref() == Some(DRIZZLE_FROM)) else { return false };
    let Some(select) = calls.get(from + 1) else { return false };
    let selects = names.get(from + 1).and_then(|name| name.as_deref()).is_some_and(|name| DRIZZLE_SELECTS.contains(&name));
    selects && !is_aggregate_select(*select) && !names.iter().any(|name| name.as_deref() == Some(DRIZZLE_GROUPING))
}

/// `receiverNames`: the identifiers and member names of a receiver chain, outermost first.
pub fn receiver_names(receiver: Node) -> Vec<String> {
    let mut names = Vec::new();
    let mut current = Some(unwrapped(receiver));
    while let Some(step) = current {
        if step.is("Identifier") {
            names.extend(step.name().map(|name| name.into_owned()));
        } else if step.is("MemberExpression") {
            names.extend(member_name(step));
        }
        current = match step.kind() {
            "CallExpression" => step.node("callee").map(unwrapped),
            "MemberExpression" => step.node("object").map(unwrapped),
            _ => None,
        };
    }
    names
}

/// `isRepositoryLike`.
pub fn is_repository_like(names: &[String]) -> bool {
    let model = names.first().is_some_and(|last| last.chars().next().is_some_and(|first| first.is_ascii_uppercase()));
    model || names.iter().any(|name| RECEIVER_NAMES.contains(&name.as_str()) || RECEIVER_WORDS.is_match(name))
}

fn is_paged(call: Node) -> bool {
    let keyed = call.nodes("arguments").into_iter().map(unwrapped).filter(|options| options.is("ObjectExpression")).flat_map(|options| options.nodes("properties")).any(|property| {
        static_key(property).is_some_and(|key| PAGES.contains(&key.as_str()))
    });
    keyed || names_of(call).iter().any(|name| name.as_deref().is_some_and(|name| PAGES.contains(&name)))
}

/// `isOrmCall` with the list query methods.
pub fn is_orm_call(scope: &QueryScope, call: Node) -> bool {
    let Some(callee) = call.node("callee") else { return false };
    let names = callee.node("object").map(receiver_names).unwrap_or_default();
    let prisma = names.iter().any(|name| PRISMA_NAME.is_match(name));
    let textual = string_value(call.nodes("arguments").first().copied().map(unwrapped)).is_some();
    let listed = member_name(callee).is_some_and(|method| LIST_QUERIES.contains(&method.as_str()));
    listed && !textual && (scope.orm || prisma) && is_repository_like(&names)
}

/// `isQueryResult`: an awaited, unpaged list query of an ORM or a Drizzle select.
pub fn is_query_result(scope: &QueryScope, node: Node) -> bool {
    let awaited = unwrapped(node);
    let Some(call) = awaited.node("argument").filter(|_| awaited.is("AwaitExpression")).map(unwrapped) else { return false };
    if !is_member_call(call) {
        return false;
    }
    if call.nodes("arguments").into_iter().any(|argument| is_function_node(unwrapped(argument))) || is_paged(call) {
        return false;
    }
    is_orm_call(scope, call) || is_drizzle_select(scope, call)
}
