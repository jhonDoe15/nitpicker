//! What a call does when nothing better than its names is known (`orderRepository.save`, `httpClient.post`),
//! and the tags a direct input/output call carries: its kind, `cache`, `write` and `unsafe` (a write a retry
//! would repeat).
use super::packages::{IoKind, deduplication_key, is_cache_package};
use super::views::{Argument, CallView, Literal};
use regex::Regex;
use std::sync::LazyLock;

/// The effects of a call or a function: each tag with the call path that has it, in the order found.
pub type Effects = Vec<(&'static str, Vec<String>)>;

pub fn get<'e>(effects: &'e Effects, tag: &str) -> Option<&'e Vec<String>> {
    effects.iter().find(|(each, _)| *each == tag).map(|(_, path)| path)
}

pub fn has(effects: &Effects, tag: &str) -> bool {
    get(effects, tag).is_some()
}

const SPACE: &str = r"[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]";
const DATABASE_OWNERS: [&str; 6] = ["repo", "repository", "dao", "db", "database", "prisma"];
const MORE_DATABASE_OWNERS: [&str; 6] = ["connection", "knex", "redis", "sql", "pg", "mongo"];
const POOL_METHODS: [&str; 3] = ["query", "connect", "execute"];
const CALLBACK_SEARCHES: [&str; 5] = ["find", "filter", "some", "every", "map"];
const REMOTE_OWNERS: [&str; 4] = ["http", "axios", "api", "gateway"];
const WRITE_WORDS: [&str; 5] = ["update", "delete", "remove", "replace", "upsert"];
const METHOD_PREFIXES: [&str; 14] = ["find", "fetch", "load", "read", "query", "select", "insert", "save", "create", "count", "execute", "write", "list", "update"];
const MORE_METHOD_PREFIXES: [&str; 4] = ["delete", "remove", "replace", "upsert"];
const GETTER_LOOKUPS: [&str; 5] = ["by", "all", "many", "one", "page"];
const METHOD_NAMES: [&str; 8] = ["exists", "exec", "send", "post", "put", "patch", "request", "raw"];
const SQL_METHODS: [&str; 7] = ["query", "execute", "exec", "raw", "run", "select", "insert"];
const WRITE_FIRST_WORDS: [&str; 18] =
    ["update", "delete", "remove", "replace", "upsert", "save", "insert", "del", "destroy", "create", "persist", "put", "increment", "decrement", "bulk", "restore", "soft", "truncate"];
const BUILDERS: [&str; 2] = ["createQueryBuilder", "createQueryRunner"];
const STORE_WRITES: [&str; 16] = ["set", "hset", "hmset", "hdel", "mset", "setex", "incr", "incrby", "decr", "lpush", "rpush", "sadd", "srem", "zadd", "zrem", "expire"];
const RAW_WRITES: [&str; 2] = ["$executeRaw", "$executeRawUnsafe"];
const SOCKETS: [&str; 5] = ["connection", "socket", "ws", "websocket", "peer"];
const DRIVER_HELPERS: [&str; 2] = ["createParameter", "createGeneratedMap"];
pub const REPLACERS: [&str; 2] = ["replace", "replaceAll"];
pub const STRING_STEPS: [&str; 12] = ["trim", "trimStart", "trimEnd", "toLowerCase", "toUpperCase", "slice", "substring", "split", "concat", "padStart", "padEnd", "normalize"];

static LOWER_UPPER: LazyLock<Regex> = LazyLock::new(|| Regex::new("([a-z0-9])([A-Z])").unwrap());
static UPPER_RUN: LazyLock<Regex> = LazyLock::new(|| Regex::new("([A-Z]+)([A-Z][a-z])").unwrap());
static NOT_WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new("[^A-Za-z0-9]+").unwrap());
static WRITE_COMMAND: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:Put|Update|Delete|BatchWrite|TransactWrite)(?:Item|Items)?Command$").unwrap());
static LOOSE_STATEMENT: LazyLock<Regex> = LazyLock::new(|| statement(&loose_forms()));
static UPSERT_STATEMENT: LazyLock<Regex> = LazyLock::new(|| statement(r"UPSERT{s}+INTO(?-u:\b)"));
static WRITE_STATEMENT: LazyLock<Regex> = LazyLock::new(|| statement(r"(?:WITH(?-u:\b)[\s\S]*?\){s}*)?(?:INSERT|UPDATE|DELETE|MERGE|REPLACE|UPSERT)(?-u:\b)"));
static INSERT_STATEMENT: LazyLock<Regex> = LazyLock::new(|| statement(r"(?:WITH(?-u:\b)[\s\S]*?\){s}*)?INSERT(?-u:\b)"));
static UPSERT_CLAUSE: LazyLock<Regex> = LazyLock::new(|| {
    let source = r"(?-u:\b)ON{s}+CONFLICT(?-u:\b)|(?-u:\b)ON{s}+DUPLICATE{s}+KEY(?-u:\b)|(?-u:\b)INSERT{s}+IGNORE(?-u:\b)|(?-u:\b)INSERT{s}+OR{s}+(?:IGNORE|REPLACE)(?-u:\b)";
    Regex::new(&format!("(?i){}", source.replace("{s}", SPACE))).unwrap()
});

/// `LOOSE_STATEMENT` of the SQL text helpers: the statement forms, case-insensitive.
fn loose_forms() -> String {
    [
        r"SELECT(?-u:\b)[\s\S]+?(?-u:\b)FROM(?-u:\b)", r"INSERT{s}+INTO(?-u:\b)", r"UPDATE{s}+{S}+{s}+SET(?-u:\b)", r"DELETE{s}+FROM(?-u:\b)",
        r"REPLACE{s}+INTO(?-u:\b)", r"MERGE{s}+INTO(?-u:\b)", r"TRUNCATE{s}+TABLE(?-u:\b)", r"DROP{s}+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)(?-u:\b)",
        r"ALTER{s}+TABLE(?-u:\b)", r"CREATE{s}+(?:UNIQUE{s}+)?(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)(?-u:\b)", r"WITH{s}+{S}+{s}+AS{s}*\(",
    ]
    .join("|")
}

fn statement(body: &str) -> Regex {
    let not_space = r"[^\t\n\x0B\x0C\r\p{Z}\x{FEFF}]";
    Regex::new(&format!("(?i)^{SPACE}*(?:{})", body.replace("{s}", SPACE).replace("{S}", not_space))).unwrap()
}

/// `wordsOf`: the lower-case words of a camelCase, PascalCase or snake_case name.
pub fn words_of(name: &str) -> Vec<String> {
    let spaced = LOWER_UPPER.replace_all(name, "$1 $2");
    let spaced = UPPER_RUN.replace_all(&spaced, "$1 $2");
    NOT_WORD.split(&spaced).filter(|word| !word.is_empty()).map(|word| word.to_ascii_lowercase()).collect()
}

fn is_io_method(name: &str) -> bool {
    let words = words_of(name);
    let first = words.first().map(String::as_str);
    if first == Some("get") {
        return words.get(1).is_none_or(|second| GETTER_LOOKUPS.contains(&second.as_str()));
    }
    METHOD_NAMES.contains(&name) || first.is_some_and(|first| METHOD_PREFIXES.contains(&first) || MORE_METHOD_PREFIXES.contains(&first))
}

fn owner_kind(owner: &str, method: &str) -> Option<IoKind> {
    let words = words_of(owner);
    let last = words.last().map(String::as_str).unwrap_or_default();
    let stored = |word: &str| DATABASE_OWNERS.contains(&word) || MORE_DATABASE_OWNERS.contains(&word);
    if !words.is_empty() && (stored(last) || (last == "pool" && POOL_METHODS.contains(&method))) {
        return Some(IoKind::Database);
    }
    if last == "client" {
        let database = words.iter().any(|word| stored(word)) || SQL_METHODS.contains(&method);
        return Some(if database { IoKind::Database } else { IoKind::Remote });
    }
    (!words.is_empty() && REMOTE_OWNERS.contains(&last)).then_some(IoKind::Remote)
}

fn replaces_text<R>(view: &CallView<R>) -> bool {
    if !view.method.as_deref().is_some_and(|method| REPLACERS.contains(&method)) {
        return false;
    }
    let (pattern, replacement) = (view.args.first(), view.args.get(1));
    let textual = replacement.is_some_and(|replacement| matches!(replacement, Argument::Literal(Literal::Text(_) | Literal::Function)));
    matches!(pattern, Some(Argument::Literal(Literal::Pattern))) || (view.textual && view.args.len() == 2 && textual)
}

fn sends_over_socket<R>(view: &CallView<R>) -> bool {
    let socket = view.owner().is_some_and(|owner| words_of(owner).last().is_some_and(|word| SOCKETS.contains(&word.as_str())));
    view.method.as_deref() == Some("send") && socket
}

fn is_plain_call<R>(view: &CallView<R>) -> bool {
    view.method.as_deref().is_some_and(|method| DRIVER_HELPERS.contains(&method) || STRING_STEPS.contains(&method)) || replaces_text(view) || sends_over_socket(view)
}

/// `namedKind`.
pub fn named_kind<R>(view: &CallView<R>) -> Option<IoKind> {
    let method = view.method.as_deref()?;
    if view.names.len() == 1 && method == "fetch" {
        return Some(IoKind::Remote);
    }
    let searches = CALLBACK_SEARCHES.contains(&method) && view.args.iter().any(Argument::is_function);
    if view.names.len() < 2 || searches || !is_io_method(method) || is_plain_call(view) {
        return None;
    }
    let kinds: Vec<Option<IoKind>> = view.names[..view.names.len() - 1].iter().map(|owner| owner_kind(owner, method)).collect();
    kinds.iter().flatten().find(|kind| **kind == IoKind::Database).or_else(|| kinds.iter().flatten().next()).copied()
}

fn statement_text<R>(view: &CallView<R>) -> Option<&str> {
    let text = view.args.first()?.text()?;
    (LOOSE_STATEMENT.is_match(text) || UPSERT_STATEMENT.is_match(text)).then_some(text)
}

fn is_write_name(name: &str) -> bool {
    let words = words_of(name);
    !BUILDERS.contains(&name)
        && (words.first().is_some_and(|first| WRITE_FIRST_WORDS.contains(&first.as_str()))
            || words.iter().any(|word| WRITE_WORDS.contains(&word.as_str()))
            || STORE_WRITES.contains(&name)
            || RAW_WRITES.contains(&name))
}

fn is_database_write<R>(view: &CallView<R>) -> bool {
    if let Some(text) = statement_text(view) {
        return WRITE_STATEMENT.is_match(text);
    }
    let command = match view.args.first() {
        Some(Argument::New { name, .. }) => name.as_str(),
        _ => "",
    };
    WRITE_COMMAND.is_match(command) || view.names.iter().skip(1).any(|name| is_write_name(name))
}

fn has_key(argument: Option<&Argument>, key: &str) -> bool {
    let input = match argument {
        Some(Argument::New { input, .. }) => input.as_ref(),
        Some(Argument::Literal(literal)) => Some(literal),
        None => None,
    };
    match input {
        None => false,
        Some(Literal::Object { keys, .. }) => keys.contains(key) || keys.contains("..."),
        Some(_) => true,
    }
}

fn is_deduplicated<R>(package: Option<&str>, view: &CallView<R>) -> bool {
    let Some((package, (key, index))) = package.and_then(|package| deduplication_key(package).map(|contract| (package, contract))) else { return false };
    let position = if package.starts_with("@aws-sdk/") || view.method.as_deref() == Some("addBulk") { 0 } else { index };
    has_key(view.args.get(position), key)
}

fn is_unsafe_write<R>(kind: IoKind, package: Option<&str>, view: &CallView<R>) -> bool {
    if kind == IoKind::Message {
        return !is_deduplicated(package, view);
    }
    let unkeyed_payment = package == Some("stripe") && view.method.as_deref() == Some("create") && !has_key(view.args.get(1), "idempotencyKey");
    let plain_insert = kind == IoKind::Database && statement_text(view).is_some_and(|text| INSERT_STATEMENT.is_match(text) && !UPSERT_CLAUSE.is_match(text));
    unkeyed_payment || plain_insert
}

fn is_cache<R>(package: Option<&str>, view: &CallView<R>) -> bool {
    match package {
        Some(package) => is_cache_package(package),
        None => view.names[..view.names.len().saturating_sub(1)].iter().any(|name| words_of(name).iter().any(|word| word == "redis")),
    }
}

/// `directEffects`: every tag of a direct call, with the call's label as its path.
pub fn direct_effects<R>(kind: Option<IoKind>, package: Option<&str>, view: &CallView<R>) -> Effects {
    let Some(kind) = kind else { return Vec::new() };
    let mut tags = vec![kind.tag()];
    if kind == IoKind::Database && is_cache(package, view) {
        tags.push("cache");
    }
    if kind == IoKind::Database && is_database_write(view) {
        tags.push("write");
    }
    if is_unsafe_write(kind, package, view) {
        tags.push("unsafe");
    }
    tags.into_iter().map(|tag| (tag, vec![view.label.clone()])).collect()
}
