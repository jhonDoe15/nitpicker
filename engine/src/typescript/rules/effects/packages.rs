//! Which libraries do input and output: database drivers and ORMs, HTTP and cloud clients, message brokers,
//! and Node.js's own network modules. `library_kind` says what a call of a package's API does.
use super::views::{Argument, CallView};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum IoKind {
    Database,
    Remote,
    Message,
}

impl IoKind {
    pub fn tag(self) -> &'static str {
        match self {
            IoKind::Database => "database",
            IoKind::Remote => "remote",
            IoKind::Message => "message",
        }
    }
}

const DATABASE_PACKAGES: [&str; 32] = [
    "pg", "pg-pool", "pg-promise", "postgres", "mysql", "mysql2", "mysql2/promise", "mariadb", "mongodb", "mongoose", "redis", "@redis/client",
    "ioredis", "typeorm", "sequelize", "sequelize-typescript", "knex", "kysely", "objection", "drizzle-orm", "@prisma/client", ".prisma/client",
    "@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb", "@neondatabase/serverless", "@planetscale/database", "@libsql/client",
    "cassandra-driver", "@google-cloud/firestore", "@google-cloud/datastore", "@google-cloud/spanner", "@elastic/elasticsearch",
];
const DATABASE_SCOPES: [&str; 2] = ["@mikro-orm/", "drizzle-orm/"];
const BUILDER_PACKAGES: [&str; 5] = ["knex", "mongoose", "kysely", "objection", "drizzle-orm"];
const CACHE_PACKAGES: [&str; 6] = ["redis", "@redis/client", "ioredis", "cache-manager", "keyv", "node-cache"];
const SYNC_DATABASE_PACKAGES: [&str; 3] = ["better-sqlite3", "sqlite3", "node:sqlite"];
const SYNC_DATABASE_CALLS: [&str; 7] = ["get", "all", "run", "iterate", "exec", "pragma", "each"];
const REMOTE_PACKAGES: [&str; 12] = ["axios", "got", "undici", "undici-types", "node-fetch", "cross-fetch", "ky", "superagent", "needle", "@grpc/grpc-js", "stripe", "googleapis"];
const REMOTE_SCOPES: [&str; 3] = ["@aws-sdk/", "@google-cloud/", "@azure/"];
const REQUESTS: &[&str] = &["request", "get"];
const BUILT_IN_CALLS: [(&str, &[&str]); 7] = [
    ("http", REQUESTS),
    ("https", REQUESTS),
    ("http2", &["connect", "request"]),
    ("net", &["connect", "createConnection"]),
    ("tls", &["connect"]),
    ("dns", &["lookup", "lookupService", "reverse"]),
    ("dns/promises", &["lookup", "lookupService", "reverse"]),
];
const PUBLISH: &[&str] = &["publish", "publishMessage", "publishJSON"];
const AMQP_PUBLISH: &[&str] = &["publish", "sendToQueue"];
const MESSAGE_PACKAGES: [(&str, &[&str]); 9] = [
    ("kafkajs", &["send", "sendBatch"]),
    ("amqplib", AMQP_PUBLISH),
    ("amqp-connection-manager", AMQP_PUBLISH),
    ("@google-cloud/pubsub", PUBLISH),
    ("nats", &["publish"]),
    ("bullmq", &["add", "addBulk"]),
    ("bull", &["add", "addBulk"]),
    ("bee-queue", &["createJob"]),
    ("@azure/service-bus", &["sendMessages", "scheduleMessages"]),
];
/// Broker clients that also make plain remote calls: (package, publishing commands, publishing methods).
const BROKER_CLIENTS: [(&str, &[&str], &[&str]); 2] = [
    ("@aws-sdk/client-sqs", &["SendMessageCommand", "SendMessageBatchCommand"], &["sendMessage", "sendMessageBatch"]),
    ("@aws-sdk/client-sns", &["PublishCommand", "PublishBatchCommand"], &["publish", "publishBatch"]),
];
const DRIZZLE_OPERATORS: [&str; 28] = [
    "eq", "ne", "gt", "gte", "lt", "lte", "and", "or", "not", "isNull", "isNotNull", "inArray", "notInArray", "like", "ilike", "notLike",
    "notIlike", "between", "notBetween", "exists", "notExists", "asc", "desc", "sql", "placeholder", "arrayContains", "arrayContained",
    "arrayOverlaps",
];
const SQL_FRAGMENTS: [&str; 5] = ["raw", "join", "identifier", "placeholder", "empty"];
const PRISMA_FRAGMENTS: [&str; 4] = ["sql", "raw", "join", "empty"];

fn module_name(specifier: &str) -> &str {
    let bare = specifier.strip_prefix("node:").unwrap_or(specifier);
    if BUILT_IN_CALLS.iter().any(|(name, _)| *name == bare) { bare } else { specifier }
}

/// `packageFromPath`: the package a file of `node_modules` belongs to, `@types/` left out.
pub fn package_from_path(file: &str) -> Option<String> {
    let normalized = file.replace('\\', "/");
    let index = normalized.rfind("/node_modules/")?;
    let parts: Vec<&str> = normalized[index + "/node_modules/".len()..].split('/').collect();
    let first = parts.first().copied().unwrap_or_default();
    let count = if first.starts_with('@') || first == ".prisma" { 2 } else { 1 };
    let joined = parts.iter().take(count).copied().collect::<Vec<_>>().join("/");
    Some(joined.strip_prefix("@types/").map(str::to_string).unwrap_or(joined))
}

pub fn is_database_package(name: &str) -> bool {
    DATABASE_PACKAGES.contains(&name) || DATABASE_SCOPES.iter().any(|scope| name.starts_with(scope))
}

fn is_remote_package(name: &str) -> bool {
    REMOTE_PACKAGES.contains(&name) || REMOTE_SCOPES.iter().any(|scope| name.starts_with(scope))
}

pub fn is_cache_package(name: &str) -> bool {
    CACHE_PACKAGES.contains(&name)
}

fn is_builder_package(name: &str) -> bool {
    BUILDER_PACKAGES.contains(&name) || name.starts_with("drizzle-orm/")
}

fn has_method(methods: &[&str], view: &CallView<impl Sized>) -> bool {
    view.method.as_deref().is_some_and(|method| methods.contains(&method))
}

fn is_expression_helper(package: &str, view: &CallView<impl Sized>) -> bool {
    let Some(first) = view.names.first().map(String::as_str) else { return false };
    let second = view.names.get(1).map(String::as_str);
    let rest = view.names.len() > 2;
    if package == "drizzle-orm" || package.starts_with("drizzle-orm/") {
        let fragment = second.is_some_and(|second| first == "sql" && SQL_FRAGMENTS.contains(&second));
        return !rest && second.map_or(DRIZZLE_OPERATORS.contains(&first), |_| fragment);
    }
    let prisma = package == "@prisma/client" || package == ".prisma/client" || package.starts_with("@prisma/client/");
    prisma && first == "Prisma" && !rest && second.is_some_and(|second| PRISMA_FRAGMENTS.contains(&second))
}

/// `libraryKind`; `is_async(builder)` says whether the call's result is awaited (for query builders, only when
/// the chain ends in an executing method or the result is consumed).
pub fn library_kind<R>(specifier: &str, view: &CallView<R>, is_async: &mut dyn FnMut(bool) -> bool) -> Option<IoKind> {
    let name = module_name(specifier);
    if is_expression_helper(name, view) {
        return None;
    }
    if let Some((_, calls)) = BUILT_IN_CALLS.iter().find(|(built_in, _)| *built_in == name) {
        let resolves = name.starts_with("dns") && view.method.as_deref().is_some_and(|method| method.starts_with("resolve"));
        return (has_method(calls, view) || resolves).then_some(IoKind::Remote);
    }
    if let Some((_, methods)) = MESSAGE_PACKAGES.iter().find(|(package, _)| *package == name) {
        return has_method(methods, view).then_some(IoKind::Message);
    }
    if let Some((_, commands, methods)) = BROKER_CLIENTS.iter().find(|(package, _, _)| *package == name) {
        let command = match view.args.first() {
            Some(Argument::New { name, .. }) => Some(name.as_str()),
            _ => None,
        };
        let publishes = command.is_some_and(|command| commands.contains(&command)) || has_method(methods, view);
        let kind = if publishes { IoKind::Message } else { IoKind::Remote };
        return is_async(false).then_some(kind);
    }
    if SYNC_DATABASE_PACKAGES.contains(&name) {
        return if has_method(&SYNC_DATABASE_CALLS, view) { Some(IoKind::Database) } else { is_async(false).then_some(IoKind::Database) };
    }
    if is_database_package(name) {
        return is_async(is_builder_package(name)).then_some(IoKind::Database);
    }
    (is_remote_package(name) && is_async(false)).then_some(IoKind::Remote)
}

/// The publishing contract of a broker package: the key that deduplicates a message and the argument it is in.
pub fn deduplication_key(package: &str) -> Option<(&'static str, usize)> {
    match package {
        "@aws-sdk/client-sqs" | "@aws-sdk/client-sns" => Some(("MessageDeduplicationId", 2)),
        "bullmq" | "bull" => Some(("jobId", 2)),
        "nats" => Some(("msgID", 2)),
        "@azure/service-bus" => Some(("messageId", 0)),
        _ => None,
    }
}
