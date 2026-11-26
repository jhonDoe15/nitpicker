//! Which package a file belongs to, and which of its types are persistence handles or request and response
//! objects.
use super::prisma::is_generated_prisma_client;
use regex::Regex;
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Kind {
    Persistence,
    Transport { request: bool },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Infrastructure {
    pub kind: Kind,
    pub name: String,
    pub package: String,
}

impl Infrastructure {
    pub fn message_id(&self) -> &'static str {
        if self.kind == Kind::Persistence { "persistence" } else { "transport" }
    }

    pub fn is_request(&self) -> bool {
        self.kind == Kind::Transport { request: true }
    }

    pub fn is_transport(&self) -> bool {
        matches!(self.kind, Kind::Transport { .. })
    }
}

const NODE_MODULES: &str = "/node_modules/";
const PRISMA_CLIENT: &str = "@prisma/client";

const PERSISTENCE: &[(&str, &str)] = &[
    ("@prisma/client", r"^(?:PrismaClient|TransactionClient|[A-Za-z0-9_]+Delegate)$"),
    ("knex", r"^(?:Knex|Transaction|QueryBuilder)$"),
    ("pg", r"^(?:Pool|PoolClient|Client|QueryResult)$"),
    ("mysql", r"^(?:Connection|Pool|PoolConnection)$"),
    ("mysql2", r"^(?:Connection|Pool|PoolConnection)$"),
    ("mongodb", r"^(?:MongoClient|Db|Collection|ClientSession|FindCursor|AggregationCursor)$"),
    ("mongoose", r"^(?:Connection|ClientSession|Model|Query)$"),
    ("typeorm", r"^(?:DataSource|Connection|EntityManager|QueryRunner|(?:Tree|Mongo)?Repository|SelectQueryBuilder)$"),
    ("sequelize", r"^(?:Sequelize|Transaction)$"),
    ("drizzle-orm", r"(?:Database|Transaction)$"),
    ("kysely", r"^(?:Kysely|Transaction)$"),
    ("better-sqlite3", r"^(?:Database|Statement)$"),
    ("sqlite3", r"^(?:Database|Statement)$"),
    ("@libsql/client", r"^(?:Client|Transaction)$"),
    ("postgres", r"^(?:Sql|TransactionSql)$"),
    ("@mikro-orm/*", r"^(?:EntityManager|MikroORM|EntityRepository)$"),
];

const TRANSPORT: &[(&str, &str)] = &[
    ("express", r"^(?:Request|Response)$"),
    ("express-serve-static-core", r"^(?:Request|Response)$"),
    ("fastify", r"^(?:FastifyRequest|FastifyReply)$"),
    ("koa", r"^(?:Context|ParameterizedContext|ExtendableContext|Request|Response)$"),
    ("hono", r"^Context$"),
    ("next", r"^(?:NextRequest|NextResponse)$"),
    ("node", r"^(?:IncomingMessage|ServerResponse)$"),
];

const REQUEST_NAMES: &str = r"^(?:Request|FastifyRequest|Context|ParameterizedContext|ExtendableContext|NextRequest|IncomingMessage)$";

type Table = Vec<(&'static str, Regex)>;

struct Tables {
    persistence: Table,
    transport: Table,
    request: Regex,
}

fn compile(rows: &[(&'static str, &str)]) -> Table {
    rows.iter().map(|(package, names)| (*package, Regex::new(names).expect("infrastructure names"))).collect()
}

fn tables() -> &'static Tables {
    static TABLES: OnceLock<Tables> = OnceLock::new();
    TABLES.get_or_init(|| Tables { persistence: compile(PERSISTENCE), transport: compile(TRANSPORT), request: Regex::new(REQUEST_NAMES).expect("request names") })
}

thread_local! {
    static PACKAGES: RefCell<HashMap<String, Option<String>>> = RefCell::new(HashMap::new());
}

fn types_package(name: &str) -> String {
    match name.split_once("__") {
        Some((scope, rest)) => format!("@{scope}/{rest}"),
        None => name.to_string(),
    }
}

fn package_name(file: &str) -> Option<String> {
    let normalized = file.replace('\\', "/");
    let Some(index) = normalized.rfind(NODE_MODULES) else {
        return is_generated_prisma_client(file).then(|| PRISMA_CLIENT.to_string());
    };
    let mut parts = normalized[index + NODE_MODULES.len()..].split('/');
    let (first, second) = (parts.next().unwrap_or_default(), parts.next().unwrap_or_default());
    if first == ".prisma" {
        return Some(PRISMA_CLIENT.to_string());
    }
    let name = if first.starts_with('@') { format!("{first}/{second}") } else { first.to_string() };
    Some(name.strip_prefix("@types/").map_or(name.clone(), types_package))
}

/// `packageOf`: the package a file of `node_modules` belongs to, or the Prisma client for a generated one.
pub fn package_of(file: &str) -> Option<String> {
    if let Some(known) = PACKAGES.with(|packages| packages.borrow().get(file).cloned()) {
        return known;
    }
    let found = package_name(file);
    PACKAGES.with(|packages| packages.borrow_mut().insert(file.to_string(), found.clone()));
    found
}

/// Whether a package name matches a name of a list that may end in `/*`.
pub fn matches_package(pattern: &str, name: &str) -> bool {
    pattern.strip_suffix('*').filter(|prefix| prefix.ends_with('/')).map_or(pattern == name, |prefix| name.starts_with(prefix))
}

fn is_in(table: &Table, package: &str, name: &str) -> bool {
    table.iter().any(|(pattern, names)| matches_package(pattern, package) && names.is_match(name))
}

/// `infrastructureOf` for a symbol with this name whose first declaration is in `file`.
pub fn infrastructure_of(file: &str, name: &str) -> Option<Infrastructure> {
    let package = package_of(file)?;
    let tables = tables();
    if is_in(&tables.persistence, &package, name) {
        return Some(Infrastructure { kind: Kind::Persistence, name: name.to_string(), package });
    }
    is_in(&tables.transport, &package, name).then(|| Infrastructure { kind: Kind::Transport { request: tables.request.is_match(name) }, name: name.to_string(), package })
}

/// Compares text by UTF-16 code units, as JavaScript does.
pub fn compare_utf16(left: &str, right: &str) -> std::cmp::Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

/// ESLint's message interpolation: each `{{name}}` of the template is replaced once, and the values put in are
/// not searched again.
pub fn interpolate(template: &str, data: &[(&str, &str)]) -> String {
    let mut out = String::new();
    let mut rest = template;
    while let Some(open) = rest.find("{{") {
        let after = &rest[open + 2..];
        let Some(close) = after.find("}}").filter(|close| *close > 0 && !after[..*close].contains(['{', '}'])) else {
            out.push_str(&rest[..open + 2]);
            rest = after;
            continue;
        };
        out.push_str(&rest[..open]);
        let name = after[..close].trim();
        match data.iter().find(|(key, _)| *key == name) {
            Some((_, value)) => out.push_str(value),
            None => out.push_str(&rest[open..open + close + 4]),
        }
        rest = &after[close + 2..];
    }
    out.push_str(rest);
    out
}
