//! `builders.mts`: the reads and writes of the query builders (Kysely, Drizzle, Knex and TypeORM's query builder)
//! and the table each names.
use super::table_names::table_key;
use super::{CallChain, ChainStep, OrmKind, OrmSite, first_string};
use crate::typescript::rules::secrets::words::words_of;
use crate::typescript::rules::support::view::Node;

const CLIENT_WORDS: [&str; 12] = ["db", "tx", "trx", "txn", "knex", "database", "connection", "conn", "transaction", "kysely", "prisma", "drizzle"];
const KYSELY_WRITE_STARTS: [&str; 5] = ["insertInto", "updateTable", "deleteFrom", "replaceInto", "mergeInto"];
const KNEX_WRITES: [&str; 8] = ["insert", "update", "del", "delete", "upsert", "truncate", "increment", "decrement"];
pub const KNEX_TABLE_STEPS: [&str; 3] = ["table", "from", "into"];
const DRIZZLE_WRITES: [&str; 3] = ["insert", "update", "delete"];
pub const DRIZZLE_READS: [&str; 2] = ["select", "selectDistinct"];
pub const DRIZZLE_FIND: [&str; 2] = ["findFirst", "findMany"];
const QUERY_BUILDER_WRITES: [&str; 5] = ["insert", "update", "delete", "softDelete", "restore"];
const QUERY_BUILDER_TABLES: [&str; 3] = ["into", "from", "update"];
const QUERY_BUILDER_READS: [&str; 8] = ["getMany", "getOne", "getRawMany", "getRawOne", "getManyAndCount", "getCount", "getExists", "getOneOrFail"];
const QUERY_BUILDER_FROM: [&str; 1] = ["from"];
const REPOSITORY_WORDS: [&str; 2] = ["repository", "repo"];

/// `isClientName`.
pub fn is_client_name(name: Option<&str>) -> bool {
    name.is_some_and(|name| words_of(name).iter().any(|word| CLIENT_WORDS.contains(&word.as_str())))
}

/// `stepIn`.
pub fn step_in(names: &[&str], step: Option<&ChainStep>) -> bool {
    step.and_then(|step| step.name.as_deref()).is_some_and(|name| names.contains(&name))
}

fn is_table_argument(node: Option<Node>) -> bool {
    node.is_some_and(|node| node.is("Identifier") || (node.is("MemberExpression") && !node.flag("computed")))
}

fn table_of_argument(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Identifier") {
        return table_key(node.name().as_deref());
    }
    if !node.is("MemberExpression") {
        return None;
    }
    let property = node.node("property").filter(|property| property.is("Identifier") || property.is("PrivateIdentifier"))?;
    table_key(property.name().as_deref())
}

fn args_len(step: &ChainStep) -> usize {
    step.args.as_ref().map_or(0, Vec::len)
}

fn kysely(chain: &CallChain, kind: OrmKind) -> Option<OrmSite> {
    let step = if kind == OrmKind::Write {
        chain.steps.iter().find(|step| step_in(&KYSELY_WRITE_STARTS, Some(step)))
    } else {
        chain.steps.iter().find(|step| step.args.is_some() && step.name.as_deref() == Some("selectFrom"))
    }?;
    Some(OrmSite { orm: "kysely", table: table_key(first_string(step.args.as_ref()).as_deref()) })
}

fn drizzle(chain: &CallChain, kind: OrmKind) -> Option<OrmSite> {
    let names: &[&str] = if kind == OrmKind::Write { &DRIZZLE_WRITES } else { &DRIZZLE_READS };
    let index = chain.steps.iter().position(|step| step_in(names, Some(step)) && step.args.is_some())?;
    let previous = index.checked_sub(1).and_then(|before| chain.steps.get(before));
    let owner = if index == 0 { chain.root.as_deref() } else { previous.and_then(|previous| previous.name.as_deref()) };
    if !is_client_name(owner) || previous.is_some_and(|previous| previous.args.is_some()) {
        return None;
    }
    if kind == OrmKind::Write {
        let table = chain.steps[index].args.as_ref().and_then(|args| args.first().copied());
        return is_table_argument(table).then(|| OrmSite { orm: "drizzle", table: table_of_argument(table) });
    }
    let from = chain.steps[index..].iter().find(|step| step.name.as_deref() == Some("from") && args_len(step) > 0)?;
    Some(OrmSite { orm: "drizzle", table: table_of_argument(from.args.as_ref().and_then(|args| args.first().copied())) })
}

fn drizzle_find(chain: &CallChain, _kind: OrmKind) -> Option<OrmSite> {
    let index = chain.steps.iter().position(|step| step.name.as_deref() == Some("query") && step.args.is_none())?;
    let method = chain.steps.get(index + 2);
    let is_find = step_in(&DRIZZLE_FIND, method) && method.is_some_and(|method| method.args.is_some());
    is_find.then(|| OrmSite { orm: "drizzle", table: table_key(chain.steps.get(index + 1).and_then(|step| step.name.as_deref())) })
}

fn knex_table(steps: &[ChainStep]) -> Option<String> {
    let step = steps.iter().find(|each| {
        each.args.is_some() && first_string(each.args.as_ref()).is_some() && (step_in(&KNEX_TABLE_STEPS, Some(each)) || is_client_name(each.name.as_deref()))
    })?;
    table_key(first_string(step.args.as_ref()).as_deref())
}

fn knex(chain: &CallChain, kind: OrmKind) -> Option<OrmSite> {
    let writes = chain.steps.iter().any(|step| step.args.is_some() && step_in(&KNEX_WRITES, Some(step)));
    let table = knex_table(&chain.steps)?;
    let matches = if kind == OrmKind::Write { writes } else { !writes };
    matches.then_some(OrmSite { orm: "knex", table: Some(table) })
}

fn builder_owner_table(steps: &[ChainStep], index: usize) -> Option<String> {
    let owner = index.checked_sub(1).and_then(|before| steps.get(before)).and_then(|step| step.name.clone()).unwrap_or_default();
    let repository = words_of(&owner).iter().any(|word| REPOSITORY_WORDS.contains(&word.as_str()));
    if repository { table_key(Some(&owner)) } else { None }
}

fn query_builder_table(steps: &[ChainStep], index: usize, names: &[&str]) -> Option<String> {
    let named = steps.iter().find(|step| step_in(names, Some(step)) && args_len(step) > 0);
    let first = steps.get(index).and_then(|step| step.args.as_ref()).and_then(|args| args.first().copied());
    let is_entity = first.is_some_and(|first| first.is("Identifier") && first.name().is_some_and(|name| name.starts_with(|character: char| character.is_ascii_uppercase())));
    let table = match named {
        None => table_of_argument(first.filter(|_| is_entity)),
        Some(named) => table_of_argument(named.args.as_ref().and_then(|args| args.first().copied())),
    };
    table.or_else(|| builder_owner_table(steps, index))
}

fn query_builder(chain: &CallChain, kind: OrmKind) -> Option<OrmSite> {
    let steps = &chain.steps;
    let index = steps.iter().position(|step| step.name.as_deref() == Some("createQueryBuilder"))?;
    let last = steps.last().and_then(|step| step.name.as_deref());
    let write = steps.iter().position(|step| step_in(&QUERY_BUILDER_WRITES, Some(step)) && step.args.is_some());
    if kind == OrmKind::Read {
        let is_read = last.is_some_and(|last| QUERY_BUILDER_READS.contains(&last)) && write.is_none();
        let table = if is_read { query_builder_table(steps, index, &QUERY_BUILDER_FROM) } else { None }?;
        return Some(OrmSite { orm: "typeorm", table: Some(table) });
    }
    let executes = last == Some("execute");
    (write.is_some_and(|write| write > index) && executes).then(|| OrmSite { orm: "typeorm", table: query_builder_table(steps, index, &QUERY_BUILDER_TABLES) })
}

type Recognizer = fn(&CallChain, OrmKind) -> Option<OrmSite>;

const BUILDERS: [(&str, Recognizer); 5] = [("kysely", kysely), ("drizzle", drizzle), ("drizzle", drizzle_find), ("knex", knex), ("typeorm", query_builder)];

/// `builderSite`.
pub fn builder_site(chain: &CallChain, kind: OrmKind, orms: &[String]) -> Option<OrmSite> {
    BUILDERS.iter().filter(|(orm, _)| orms.iter().any(|each| each == orm)).find_map(|(_, recognize)| recognize(chain, kind))
}
