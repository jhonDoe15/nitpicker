//! `models.mts`: the reads and writes of the model and repository ORMs (Prisma, TypeORM and MikroORM
//! repositories and managers, Sequelize models) and the table each names.
use super::builders::{is_client_name, step_in};
use super::table_names::table_key;
use super::{CallChain, ChainStep, OrmKind, OrmSite};
use crate::typescript::rules::secrets::words::words_of;
use crate::typescript::rules::urls::values::string_value;
use crate::typescript::rules::support::view::Node;

pub const REPOSITORY_WORDS: [&str; 3] = ["repository", "repo", "dao"];
pub const MANAGER_WORDS: [&str; 6] = ["manager", "em", "entitymanager", "tx", "trx", "txn"];
const REPOSITORY_GETTERS: [&str; 2] = ["getRepository", "getCustomRepository"];
const GLOBAL_OBJECTS: [&str; 17] =
    ["Object", "Array", "Promise", "Map", "Set", "JSON", "Math", "Reflect", "Number", "String", "Date", "Buffer", "Symbol", "Intl", "Proxy", "WeakMap", "WeakSet"];
const PRISMA_MIN_STEPS: usize = 3;

/// `methodsOf`.
pub fn methods_of(orm: &str, kind: OrmKind) -> &'static [&'static str] {
    match (orm, kind) {
        ("prisma", OrmKind::Write) => &["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"],
        ("prisma", OrmKind::Read) => &["findUnique", "findFirst", "findMany", "findUniqueOrThrow", "findFirstOrThrow", "count"],
        ("typeorm", OrmKind::Write) => &["save", "insert", "update", "upsert", "delete", "remove", "softDelete", "softRemove", "restore", "recover", "increment", "decrement"],
        ("typeorm", OrmKind::Read) => &["find", "findBy", "findOne", "findOneBy", "findOneOrFail", "findOneByOrFail", "findAndCount", "count", "countBy", "exist", "exists", "existsBy"],
        ("mikro", OrmKind::Write) => &["persistAndFlush", "removeAndFlush", "nativeInsert", "nativeUpdate", "nativeDelete", "upsert", "upsertMany", "insert", "insertMany"],
        ("mikro", OrmKind::Read) => &["find", "findOne", "findOneOrFail", "findAndCount", "count"],
        ("sequelize", OrmKind::Write) => &["create", "bulkCreate", "update", "destroy", "upsert", "increment", "decrement", "restore", "findOrCreate"],
        ("sequelize", OrmKind::Read) => &["findOne", "findAll", "findByPk", "findAndCountAll", "count"],
        _ => &[],
    }
}

fn starts_upper(name: &str) -> bool {
    name.starts_with(|character: char| character.is_ascii_uppercase())
}

struct Receiver<'c, 's> {
    name: Option<&'c str>,
    args: Option<&'c Vec<Node<'s>>>,
}

fn receiver_of<'c, 's>(chain: &'c CallChain<'s>) -> Receiver<'c, 's> {
    match chain.from_end(2).filter(|_| chain.steps.len() >= 2) {
        Some(previous) => Receiver { name: previous.name.as_deref(), args: previous.args.as_ref() },
        None => Receiver { name: chain.root.as_deref(), args: None },
    }
}

fn has(orms: &[String], orm: &str) -> bool {
    orms.iter().any(|each| each == orm)
}

fn argument_table(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Identifier") && node.name().is_some_and(|name| starts_upper(&name)) {
        return table_key(node.name().as_deref());
    }
    if node.is("NewExpression") {
        let callee = node.node("callee").filter(|callee| callee.is("Identifier"))?;
        return table_key(callee.name().as_deref());
    }
    if node.is("Literal") { table_key(string_value(Some(node)).as_deref()) } else { None }
}

fn prisma(chain: &CallChain, method: &ChainStep, kind: OrmKind, orms: &[String]) -> Option<OrmSite> {
    let model = chain.from_end(2);
    let client = if chain.steps.len() >= PRISMA_MIN_STEPS { chain.from_end(3).and_then(|step| step.name.as_deref()) } else { chain.root.as_deref() };
    let model_name = model.and_then(|model| model.name.as_deref());
    let is_model = model.is_none_or(|model| model.args.is_none()) && model_name.is_some_and(|name| !name.starts_with('$'));
    let matches = has(orms, "prisma") && step_in(methods_of("prisma", kind), Some(method));
    let found = matches && method.args.is_some() && is_model && is_client_name(client) && !model_name.is_some_and(starts_upper);
    found.then(|| OrmSite { orm: "prisma", table: table_key(model_name) })
}

fn repository(chain: &CallChain, method: &ChainStep, kind: OrmKind, orms: &[String]) -> Option<OrmSite> {
    let receiver = receiver_of(chain);
    let orm = ["typeorm", "mikro"].into_iter().find(|each| has(orms, each) && step_in(methods_of(each, kind), Some(method)))?;
    let (Some(args), Some(name)) = (method.args.as_ref(), receiver.name) else { return None };
    if let Some(receiver_args) = receiver.args {
        return REPOSITORY_GETTERS.contains(&name).then(|| OrmSite { orm, table: argument_table(receiver_args.first().copied()) });
    }
    let words = words_of(name);
    let last = words.last().map(String::as_str)?;
    if REPOSITORY_WORDS.contains(&last) {
        return Some(OrmSite { orm, table: table_key(Some(name)) });
    }
    MANAGER_WORDS.contains(&last).then(|| OrmSite { orm, table: argument_table(args.first().copied()) })
}

fn sequelize(chain: &CallChain, method: &ChainStep, kind: OrmKind, orms: &[String]) -> Option<OrmSite> {
    let receiver = receiver_of(chain);
    let name = receiver.name.unwrap_or_default();
    let is_model = (starts_upper(name) && !GLOBAL_OBJECTS.contains(&name)) || name.ends_with("Model");
    let matches = has(orms, "sequelize") && step_in(methods_of("sequelize", kind), Some(method));
    (matches && method.args.is_some() && receiver.args.is_none() && is_model).then(|| OrmSite { orm: "sequelize", table: table_key(Some(name)) })
}

/// `modelSite`.
pub fn model_site(chain: &CallChain, kind: OrmKind, orms: &[String]) -> Option<OrmSite> {
    let method = chain.steps.last()?;
    prisma(chain, method, kind, orms).or_else(|| repository(chain, method, kind, orms)).or_else(|| sequelize(chain, method, kind, orms))
}
