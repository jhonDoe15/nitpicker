//! `query-advice.mts`, `batch-forms.mts` and `messages.mts`: which message a per-item call gets (a plain query,
//! one that already takes a set of keys, one keyed by a foreign key the loop holds, one that depends on the
//! previous pass) and the batch form of its package.
use crate::typescript::rules::collections::loops::Site;
use crate::typescript::rules::effects::tags::words_of;
use crate::typescript::rules::held_scopes::estree_calls::call_view;
use crate::typescript::rules::loop_repeats::chains::{chain_arguments, chain_top, inner_calls, outer_calls};
use crate::typescript::rules::loop_repeats::names::{callee_name, descendants, is_function, item_names, name_of, referenced_names};
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Advice {
    Query,
    SetQuery,
    ForeignKeyQuery,
    DependentQuery,
}

const SET_FUNCTIONS: [&str; 3] = ["In", "Any", "inArray"];
const SET_KEYS: [&str; 3] = ["in", "$in", "_in"];
const SET_METHODS: [&str; 5] = ["whereIn", "andWhereIn", "orWhereIn", "whereInIds", "andWhereInIds"];
const READ_WORDS: [&str; 7] = ["find", "get", "load", "read", "select", "count", "exists"];
static FOREIGN_KEY: LazyLock<Regex> = LazyLock::new(|| Regex::new("^[a-z][A-Za-z0-9]*Id$|_id$").expect("pattern"));

const EXCEPTION: &str = "An exception fits only when a call per item is intended";
const PAGING: &str = "Paging, cursor and retry loops are fine, and so is a call that takes a whole chunk of the items.";
const BATCH_QUERY: &str = "Fetch or write them in one query: {{form}}, run before the loop.";
const GENERIC_FORM: &str = "a batch method (`findByIds`, `findAllById`, `createMany`, `insertMany`) or `WHERE id IN (...)`";
const DRIZZLE_ORM: &str = "drizzle-orm";
const FORMS: [(&str, &str); 5] = [
    ("typeorm", "a set condition such as `findBy({ id: In(ids) })`, or `insert(rows)` for several rows"),
    ("@prisma/client", "`findMany({ where: { id: { in: ids } } })`, or `createMany` and `updateMany` for writes"),
    ("knex", "`whereIn(column, ids)`, or `insert(rows)` with an array of rows"),
    (DRIZZLE_ORM, "`inArray(column, ids)` in the `where`, or `insert(table).values(rows)`"),
    ("mongoose", "`find({ _id: { $in: ids } })`, or `insertMany(docs)`"),
];

/// The message of a message id of `IO_IN_LOOP_MESSAGES`.
pub fn message(id: &str) -> String {
    let parts: Vec<String> = match id {
        "query" => vec!["This runs {{callee}} once per item of a loop, one query per item.".into(), BATCH_QUERY.into(), PAGING.into(), format!("{EXCEPTION} (a store with no batch form).")],
        "setQuery" => vec![
            "This runs {{callee}} once per item of a loop, and the call already takes a set of keys,".into(),
            "so the cost is the number of iterations of the outer loop.".into(),
            "Keep that loop small and bounded (a few workspaces or pages), or collect the keys of all its".into(),
            "items and run one such call after it.".into(),
            PAGING.into(),
        ],
        "foreignKeyQuery" => vec![
            "This runs {{callee}} once per item of a loop, and its key is a foreign key of a row the loop".into(),
            "already holds.".into(),
            "Load the related rows with the query that loaded those rows (`relations`, `include` or a join),".into(),
            "or fetch all the keys at once before the loop.".into(),
            PAGING.into(),
            format!("{EXCEPTION} (a store with no batch form)."),
        ],
        "dependentQuery" => vec![
            "This runs {{callee}} once per item of a loop, and its key comes from the previous iteration:".into(),
            "the calls depend on each other and cannot be batched, so a call per item is expected.".into(),
            "If the chain is long, look for one recursive query or endpoint that returns it whole.".into(),
        ],
        "cacheQuery" => vec![
            "This runs {{callee}} once per item of a loop, one round trip per item.".into(),
            "Fetch or write them in one round trip: `mget`/`mset`/`hmget`, or queue the commands on".into(),
            "`pipeline()` (or `multi()`) and `exec()` it once after the loop.".into(),
            PAGING.into(),
            format!("{EXCEPTION} (a command with no multi-key form)."),
        ],
        "concurrentQuery" => vec![
            "This runs {{callee}} once per item inside a concurrent `Promise.all`:".into(),
            "running them concurrently still sends one query per item.".into(),
            BATCH_QUERY.into(),
            format!("{EXCEPTION} (a store with no batch form)."),
        ],
        _ => vec![
            "This calls {{callee}} once per item of a loop, one request after another.".into(),
            "Use the API's batch endpoint when it has one; otherwise run the requests with bounded concurrency:".into(),
            "`p-limit`, `p-map` with `{ concurrency }`, or `Promise.all` over fixed-size chunks.".into(),
            PAGING.into(),
            format!("{EXCEPTION} (an API with no batch form and a rate limit)."),
        ],
    };
    parts.join(" ")
}

fn untyped_package(label: &str) -> Option<&'static str> {
    let root: String = label.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '$').collect();
    let starts = label.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$');
    match root.to_lowercase().as_str() {
        "prisma" if starts => Some("@prisma/client"),
        "knex" if starts => Some("knex"),
        _ => None,
    }
}

/// `batchForm`.
pub fn batch_form(label: &str, package: Option<&str>) -> &'static str {
    let known = match package {
        None => untyped_package(label).map(str::to_string),
        Some(package) => Some(package.to_string()),
    };
    let name = known.map(|known| if known.starts_with(DRIZZLE_ORM) { DRIZZLE_ORM.to_string() } else { known });
    name.and_then(|name| FORMS.iter().find(|(package, _)| *package == name).map(|(_, form)| *form)).unwrap_or(GENERIC_FORM)
}

fn operand_of(node: Node) -> Option<Node> {
    if node.is("CallExpression") {
        let name = callee_name(node.node("callee"));
        let is_set = SET_FUNCTIONS.contains(&name.as_str()) || SET_METHODS.contains(&name.as_str());
        return if is_set { node.list("arguments").last().copied().flatten() } else { None };
    }
    if !node.is("Property") || node.flag("computed") {
        return None;
    }
    let key = name_of(node.node("key"))?;
    if SET_KEYS.contains(&key.as_str()) { node.node("value") } else { None }
}

fn set_operands(call: Node) -> Vec<Node> {
    let calls = std::iter::once(call).chain(inner_calls(call)).chain(outer_calls(call));
    let roots = calls.flat_map(|each| {
        let arguments = if each.is("CallExpression") { each.nodes("arguments") } else { Vec::new() };
        std::iter::once(each).chain(arguments)
    });
    roots.flat_map(|root| descendants(root, is_function)).filter_map(operand_of).collect()
}

fn is_item_keys(operand: Node, items: &HashSet<String>) -> bool {
    let mentions = referenced_names(operand).iter().any(|name| items.contains(name));
    mentions && operand.is("ArrayExpression")
}

fn is_property_key(node: Node) -> bool {
    node.parent().is_some_and(|parent| parent.is("Property") && parent.node("key") == Some(node) && !parent.flag("computed") && !parent.flag("shorthand"))
}

fn uses_item_outside(call: Node, operands: &[Node], items: &HashSet<String>) -> bool {
    chain_arguments(call).into_iter().flat_map(|argument| descendants(argument, is_function)).any(|node| {
        node.is("Identifier")
            && name_of(Some(node)).is_some_and(|name| items.contains(&name))
            && !is_property_key(node)
            && !operands.iter().any(|operand| operand.contains(node))
    })
}

fn has_foreign_key(call: Node, items: &HashSet<String>) -> bool {
    chain_arguments(call).into_iter().flat_map(|argument| descendants(argument, is_function)).any(|node| {
        let object = node.node("object").filter(|object| node.is("MemberExpression") && object.is("Identifier"));
        object.and_then(|object| name_of(Some(object))).is_some_and(|name| items.contains(&name)) && FOREIGN_KEY.is_match(&name_of(node.node("property")).unwrap_or_default())
    })
}

fn is_carried(call: Node) -> bool {
    let top = chain_top(call);
    let value = top.parent().filter(|parent| parent.is("AwaitExpression")).unwrap_or(top);
    let Some(holder) = value.parent() else { return false };
    let target = holder.node("left").filter(|_| holder.is("AssignmentExpression") && holder.node("right") == Some(value));
    let Some(name) = target.filter(|target| target.is("Identifier")).and_then(|target| name_of(Some(target))) else { return false };
    chain_arguments(call).into_iter().any(|argument| referenced_names(argument).contains(&name))
}

fn is_read(call: Node) -> bool {
    let method = call_view(call).and_then(|view| view.method);
    method.is_some_and(|method| words_of(&method).first().is_some_and(|word| READ_WORDS.contains(&word.as_str())))
}

/// `adviceOf`.
pub fn advice_of(call: Node, found: &Site) -> Advice {
    if is_carried(call) {
        return Advice::DependentQuery;
    }
    let items = item_names(found);
    let operands = set_operands(call);
    if !operands.is_empty() {
        let item = operands.iter().any(|operand| is_item_keys(*operand, &items)) || uses_item_outside(call, &operands, &items);
        return if item { Advice::Query } else { Advice::SetQuery };
    }
    if is_read(call) && has_foreign_key(call, &items) { Advice::ForeignKeyQuery } else { Advice::Query }
}
