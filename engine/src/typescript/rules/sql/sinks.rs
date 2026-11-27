//! `sql-sinks.mts`: the call a text goes to, a raw-SQL method, a query builder clause or a query call, read from
//! where the text is written or from the reads of the variable that holds it.
use crate::typescript::rules::queries::chains::assigned_target;
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{member_name, resolve_constant, unwrapped, variable_of};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use oxc_semantic::SymbolId;
use regex::Regex;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Sink {
    Raw,
    Clause,
    Order,
    Query,
}

const MAX_CHAIN: usize = 256;
const RAW_METHODS: [&str; 11] = ["whereRaw", "orWhereRaw", "andWhereRaw", "whereNotRaw", "havingRaw", "orHavingRaw", "orderByRaw", "groupByRaw", "joinRaw", "fromRaw", "onRaw"];
const CLAUSE_METHODS: [&str; 6] = ["where", "andWhere", "orWhere", "having", "andHaving", "orHaving"];
const ORDER_METHODS: [&str; 4] = ["orderBy", "addOrderBy", "groupBy", "addGroupBy"];
const WRAPPERS: [&str; 9] = ["Property", "ObjectExpression", "ArrayExpression", "AwaitExpression", "TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];
const WORD: &str = "[0-9A-Za-z_]";

static SQL_CALL_NAME: LazyLock<Regex> = LazyLock::new(|| {
    let prefix = r"\$?(?:query|execute|exec|raw|run|all|get|each|prepare|unsafe|batch)";
    let pg_promise = "none|one|many|any|oneOrNone|manyOrNone|result|multi|multiResult";
    Regex::new(&format!("(?i)^(?:{prefix}{WORD}*|{WORD}*(?:query|sql|execute){WORD}*|{pg_promise})$")).expect("call name")
});
static RAW_OWNER: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)^(?:sql|knex)$").expect("raw owner"));
static LITERAL_OWNER: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)sequelize").expect("literal owner"));
static BUILDER_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(&format!("^(?:qb|{WORD}*(?:QueryBuilder|queryBuilder|Qb))$")).expect("builder name"));

/// The name with the two characters `iu` patterns count as word characters, U+017F and U+212A, as `s` and `k`.
fn folded(name: &str) -> String {
    name.replace('\u{17F}', "s").replace('\u{212A}', "k")
}

fn has(names: &[&str], name: &Option<String>) -> bool {
    name.as_deref().is_some_and(|name| names.contains(&name))
}

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

fn builder_step<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Node<'s>> {
    let callee = node.node("callee").filter(|_| node.is("CallExpression")).map(unwrapped)?;
    let stepped = callee.is("MemberExpression") && member_name(callee).as_deref() != Some("createQueryBuilder");
    if stepped { resolve_constant(scopes, callee.node("object").map(unwrapped)).map(unwrapped) } else { None }
}

fn is_query_builder<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let Some(mut last) = resolve_constant(scopes, Some(unwrapped(node))).map(unwrapped) else { return false };
    for _ in 0..MAX_CHAIN {
        match builder_step(scopes, last) {
            Some(next) => last = next,
            None => break,
        }
    }
    if last.is("Identifier") {
        return last.name().is_some_and(|name| BUILDER_NAME.is_match(&name));
    }
    let callee = last.node("callee").filter(|_| last.is("CallExpression")).map(unwrapped);
    callee.is_some_and(|callee| callee.is("MemberExpression") && member_name(callee).as_deref() == Some("createQueryBuilder"))
}

fn builder_sink<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>, name: &Option<String>) -> Option<Sink> {
    if has(&RAW_METHODS, name) {
        return Some(Sink::Raw);
    }
    let owner = folded(&owner_name(callee).unwrap_or_default());
    let raw = (name.as_deref() == Some("raw") && RAW_OWNER.is_match(&owner)) || (name.as_deref() == Some("literal") && LITERAL_OWNER.is_match(&owner));
    if raw {
        return Some(Sink::Raw);
    }
    let clause = has(&CLAUSE_METHODS, name);
    let builder = (clause || has(&ORDER_METHODS, name)) && callee.node("object").is_some_and(|object| is_query_builder(scopes, object));
    if !builder {
        return None;
    }
    Some(if clause { Sink::Clause } else { Sink::Order })
}

fn sink_of<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>, argument: Node<'s>) -> Option<Sink> {
    let callee = unwrapped(call.node("callee")?);
    let name = callee_name(scopes, callee);
    let first = call.list("arguments").first().copied().flatten() == Some(argument);
    let builder = if first && callee.is("MemberExpression") { builder_sink(scopes, callee, &name) } else { None };
    builder.or_else(|| name.filter(|name| SQL_CALL_NAME.is_match(&folded(name))).map(|_| Sink::Query))
}

fn consuming_sink<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Sink> {
    let mut argument = node;
    for owner in node.ancestors() {
        if !WRAPPERS.contains(&owner.kind()) {
            let consumed = owner.is("CallExpression") && owner.node("callee") != Some(argument);
            return if consumed { sink_of(scopes, owner, argument) } else { None };
        }
        argument = owner;
    }
    None
}

/// `variableSink`: the sink a read of the variable gives its value to, a sink other than a plain query first.
pub fn variable_sink<'s>(scopes: &Scopes<'_, 's>, variable: Option<SymbolId>) -> Option<Sink> {
    let references = variable.map(|variable| scopes.references(variable)).unwrap_or_default();
    let sinks: Vec<Sink> = references.into_iter().filter(|reference| reference.read).filter_map(|reference| consuming_sink(scopes, reference.identifier)).collect();
    sinks.iter().copied().find(|sink| *sink != Sink::Query).or(sinks.first().copied())
}

/// `sinkFor`: the sink of the text where it is written, or of the variable it is assigned to.
pub fn sink_for<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Sink> {
    let target = assigned_target(node).filter(|target| target.is("Identifier"));
    consuming_sink(scopes, node).or_else(|| variable_sink(scopes, target.and_then(|target| variable_of(scopes, target))))
}
