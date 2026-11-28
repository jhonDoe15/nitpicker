//! `sql/sql-sinks.mts`: whether an expression is consumed as SQL text, by a query call, a raw fragment or a
//! query builder clause, directly or through the variable it is assigned to.
use super::chains::assigned_target;
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{member_name, resolve_constant, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Sink {
    Raw,
    Clause,
    Order,
    Query,
}

const RAW_METHODS: [&str; 11] =
    ["whereRaw", "orWhereRaw", "andWhereRaw", "whereNotRaw", "havingRaw", "orHavingRaw", "orderByRaw", "groupByRaw", "joinRaw", "fromRaw", "onRaw"];
const CLAUSE_METHODS: [&str; 6] = ["where", "andWhere", "orWhere", "having", "andHaving", "orHaving"];
const ORDER_METHODS: [&str; 4] = ["orderBy", "addOrderBy", "groupBy", "addGroupBy"];
const WRAPPERS: [&str; 9] = [
    "Property", "ObjectExpression", "ArrayExpression", "AwaitExpression", "TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion",
    "ChainExpression",
];
const CHAIN_LIMIT: usize = 64;

/// `\w` of a JavaScript `/iu` pattern, written for a case-insensitive Rust pattern.
const IU_WORD: &str = "[0-9A-Za-z_]";
static SQL_CALL_NAME: LazyLock<Regex> = LazyLock::new(|| {
    let prefix = r"\$?(?:query|execute|exec|raw|run|all|get|each|prepare|unsafe|batch)";
    let promise = "none|one|many|any|oneOrNone|manyOrNone|result|multi|multiResult";
    Regex::new(&format!("(?i)^(?:{prefix}{IU_WORD}*|{IU_WORD}*(?:query|sql|execute){IU_WORD}*|{promise})$")).expect("pattern")
});
static RAW_OWNER: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)^(?:sql|knex)$").expect("pattern"));
static LITERAL_OWNER: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)sequelize").expect("pattern"));
static BUILDER_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:qb|[0-9A-Za-z_]*(?:QueryBuilder|queryBuilder|Qb))$").expect("pattern"));

fn callee_name<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>) -> Option<String> {
    let target = unwrapped(callee);
    if target.is("MemberExpression") {
        return member_name(target);
    }
    if !target.is("Identifier") {
        return None;
    }
    match leaf_values(scopes, Some(target)).into_iter().find(|leaf| leaf.is("MemberExpression")) {
        Some(alias) => member_name(alias),
        None => target.name().map(|name| name.into_owned()),
    }
}

fn owner_name(callee: Node) -> Option<String> {
    let owner = unwrapped(callee.node("object")?);
    if owner.is("Identifier") {
        return owner.name().map(|name| name.into_owned());
    }
    if owner.is("MemberExpression") { member_name(owner) } else { None }
}

fn constant<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Node<'s>> {
    resolve_constant(scopes, Some(unwrapped(node))).map(unwrapped)
}

fn builder_step<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Node<'s>> {
    let callee = node.node("callee").map(unwrapped).filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"))?;
    if member_name(callee).as_deref() == Some("createQueryBuilder") {
        return None;
    }
    constant(scopes, callee.node("object")?)
}

fn is_query_builder<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let Some(mut last) = constant(scopes, node) else { return false };
    for _ in 0..CHAIN_LIMIT {
        match builder_step(scopes, last) {
            Some(next) => last = next,
            None => break,
        }
    }
    if last.is("Identifier") {
        return last.name().is_some_and(|name| BUILDER_NAME.is_match(&name));
    }
    let callee = last.node("callee").map(unwrapped).filter(|callee| last.is("CallExpression") && callee.is("MemberExpression"));
    callee.is_some_and(|callee| member_name(callee).as_deref() == Some("createQueryBuilder"))
}

fn builder_sink<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>, name: Option<&str>) -> Option<Sink> {
    if name.is_some_and(|name| RAW_METHODS.contains(&name)) {
        return Some(Sink::Raw);
    }
    let owner = owner_name(callee).unwrap_or_default();
    if (name == Some("raw") && RAW_OWNER.is_match(&owner)) || (name == Some("literal") && LITERAL_OWNER.is_match(&owner)) {
        return Some(Sink::Raw);
    }
    let clause = name.is_some_and(|name| CLAUSE_METHODS.contains(&name));
    let order = name.is_some_and(|name| ORDER_METHODS.contains(&name));
    let builder = (clause || order) && callee.node("object").is_some_and(|object| is_query_builder(scopes, object));
    if !builder {
        return None;
    }
    Some(if clause { Sink::Clause } else { Sink::Order })
}

fn sink_of<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>, argument: Node<'s>) -> Option<Sink> {
    let callee = unwrapped(call.node("callee")?);
    let name = callee_name(scopes, callee);
    let first = call.nodes("arguments").first() == Some(&argument);
    let builder = if first && callee.is("MemberExpression") { builder_sink(scopes, callee, name.as_deref()) } else { None };
    builder.or_else(|| name.filter(|name| SQL_CALL_NAME.is_match(name)).map(|_| Sink::Query))
}

fn consuming_sink<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Sink> {
    let mut argument = node;
    for owner in node.ancestors() {
        if WRAPPERS.contains(&owner.kind()) {
            argument = owner;
            continue;
        }
        let consumed = owner.is("CallExpression") && owner.node("callee") != Some(argument);
        return if consumed { sink_of(scopes, owner, argument) } else { None };
    }
    None
}

fn variable_sink<'s>(scopes: &Scopes<'_, 's>, target: Node<'s>) -> Option<Sink> {
    let name = target.name().filter(|_| target.is("Identifier"))?;
    let variable = scopes.variable_by_name(&name, target.start())?;
    let sinks: Vec<Sink> =
        scopes.references(variable).into_iter().filter(|reference| reference.read).filter_map(|reference| consuming_sink(scopes, reference.identifier)).collect();
    sinks.iter().copied().find(|sink| *sink != Sink::Query).or_else(|| sinks.first().copied())
}

/// `sinkFor`: how `node` reaches SQL, itself or through the variable it is assigned to.
pub fn sink_for<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Sink> {
    consuming_sink(scopes, node).or_else(|| assigned_target(node).and_then(|target| variable_sink(scopes, target)))
}
