import ast
import re

from checks.common import dotted_name, finding
from security.resolve.calls import argument, dict_entries, effective_calls, keyword_entries
from security.resolve.scopes import module_where, where_of
from security.support import exempt
from security.timeouts.client_settings import (
    MISSING,
    UNKNOWN,
    asyncpg_state,
    either,
    entry_state,
    libpq_state,
    mapping_state,
    present,
    text_state,
    text_value,
)

RULE = "client-without-timeout"
POSTGRES_URL = re.compile(r"^postgres(?:ql)?(?:\+\w+)?(?::|$)", re.IGNORECASE)
POSTGRES_ENGINE = re.compile(r"postgresql|postgis", re.IGNORECASE)
CONNECT_HOOKS = re.compile(r"listens_for|event\.listen\(")
PSYCOPG_CONNECTS = {
    "psycopg.connect": 0,
    "psycopg.Connection.connect": 0,
    "psycopg.AsyncConnection.connect": 0,
    "psycopg2.connect": 0,
    "psycopg2.pool.SimpleConnectionPool": 2,
    "psycopg2.pool.ThreadedConnectionPool": 2,
}
PSYCOPG_POOLS = {"psycopg_pool.ConnectionPool", "psycopg_pool.AsyncConnectionPool"}
ASYNCPG = {"asyncpg.connect", "asyncpg.create_pool", "asyncpg.pool.create_pool"}
ENGINES = {
    "sqlalchemy.create_engine",
    "sqlalchemy.ext.asyncio.create_async_engine",
    "sqlmodel.create_engine",
}
URL_FACTORIES = {"sqlalchemy.URL.create", "sqlalchemy.engine.URL.create"}


def psycopg_state(call, where, position):
    conninfo = argument(call, position, "conninfo") or argument(call, None, "dsn")
    keywords = keyword_entries(call.keywords, where)
    return either([text_state(conninfo, where), libpq_state(keywords)])


def pool_state(call, where):
    keywords = keyword_entries(call.keywords, where)
    if present(keywords, "configure"):
        return UNKNOWN
    conninfo = argument(call, 0, "conninfo")
    kwargs = entry_state(keywords, "kwargs", mapping_state(libpq_state))
    return either([text_state(conninfo, where), kwargs])


def connect_state(call, where):
    dsn = argument(call, 0, "dsn")
    keywords = keyword_entries(call.keywords, where)
    return either([text_state(dsn, where), asyncpg_state(keywords)])


def engine_url(call, where):
    url = argument(call, 0, "url")
    if isinstance(url, ast.Call) and dotted_name(url.func, where.context.aliases) in URL_FACTORIES:
        return text_value(argument(url, 0, "drivername"), where), url
    return text_value(url, where), url


def engine_state(call, where):
    text, url = engine_url(call, where)
    if text is None or not POSTGRES_URL.search(text):
        return None
    if CONNECT_HOOKS.search(where.context.text):
        return UNKNOWN
    keywords = keyword_entries(call.keywords, where)
    judge = asyncpg_state if "+asyncpg" in text.lower() else libpq_state
    connect = entry_state(keywords, "connect_args", mapping_state(judge))
    return either([text_state(url, where), connect])


def call_state(call, where):
    name = dotted_name(call.func, where.context.aliases) or ""
    if name in PSYCOPG_CONNECTS:
        return name, psycopg_state(call, where, PSYCOPG_CONNECTS[name])
    if name in PSYCOPG_POOLS:
        return name, pool_state(call, where)
    if name in ASYNCPG:
        return name, connect_state(call, where)
    if name in ENGINES:
        return name, engine_state(call, where)
    return name, None


def is_databases(target):
    return isinstance(target, ast.Name) and target.id == "DATABASES"


def databases_values(context):
    found = []
    mutated = False
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else []
        if isinstance(node, ast.AnnAssign):
            targets = [node.target]
        if any(is_databases(target) for target in targets) and node.value is not None:
            found.append(node.value)
        mutated = mutated or any(
            isinstance(target, ast.Subscript) and "DATABASES" in ast.unparse(target)
            for target in targets
        )
        is_update = isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
        if is_update and node.func.attr == "update" and "DATABASES" in ast.unparse(node.func):
            mutated = True
    return [] if mutated else found


def django_findings(context):
    where = module_where(context)
    found = []
    for value in databases_values(context):
        for alias, database, _ in dict_entries(value, where).items:
            entries = dict_entries(database, where)
            engine = [v for k, v, _ in entries.items if k == "ENGINE"]
            text = text_value(engine[-1], where) if engine else None
            if text is None or not POSTGRES_ENGINE.search(text):
                continue
            if entry_state(entries, "OPTIONS", mapping_state(libpq_state)) == MISSING:
                subject = f"DATABASES['{alias}']"
                found.append(finding(context.path, RULE, subject, engine[-1]))
    return found


def check(context):
    if exempt(context):
        return []
    found = django_findings(context)
    for node, call, where, _ in effective_calls(context, where_of):
        name, state = call_state(call, where)
        if state == MISSING:
            found.append(finding(context.path, RULE, name, node))
    return found
