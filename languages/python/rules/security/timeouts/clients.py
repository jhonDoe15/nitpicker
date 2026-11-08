import ast
import re

from checks.common import dotted_name, finding
from security.resolve.booleans import is_none
from security.resolve.calls import (
    argument,
    dict_entries,
    effective_calls,
    keyword_entries,
)
from security.resolve.scopes import module_where, values_of, where_of
from security.support import exempt

RULE = "client-without-timeout"
TIMEOUT_TEXT = re.compile(r"statement_timeout|query_timeout|command_timeout")
POSTGRES_URL = re.compile(r"^postgres(?:ql)?(?:\+\w+)?(?::|$)", re.IGNORECASE)
SET, MISSING, UNKNOWN = "set", "missing", "unknown"
MAX_DEPTH = 4
PSYCOPG_CONNECTS = {
    "psycopg.connect": 0,
    "psycopg.Connection.connect": 0,
    "psycopg.AsyncConnection.connect": 0,
    "psycopg2.connect": 0,
    "psycopg2.pool.SimpleConnectionPool": 2,
    "psycopg2.pool.ThreadedConnectionPool": 2,
}
PSYCOPG_POOLS = {"psycopg_pool.ConnectionPool", "psycopg_pool.AsyncConnectionPool"}
ASYNCPG = {"asyncpg.connect", "asyncpg.create_pool"}
ENGINES = {
    "sqlalchemy.create_engine",
    "sqlalchemy.ext.asyncio.create_async_engine",
    "sqlmodel.create_engine",
}
URL_FACTORIES = {"sqlalchemy.URL.create", "sqlalchemy.engine.URL.create"}
DJANGO_POSTGRES = "django.db.backends.postgresql"


def text_value(node, where, depth=0):
    if depth > MAX_DEPTH or node is None:
        return None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        parts = [text_value(value, where, depth + 1) for value in node.values]
        return " ".join(part for part in parts if part is not None)
    if isinstance(node, ast.Name):
        values = values_of(node.id, where)
        if len(values) == 1:
            return text_value(values[0][0], values[0][1], depth + 1)
    return None


def either(states):
    if SET in states:
        return SET
    return UNKNOWN if UNKNOWN in states else MISSING


def text_state(node, where):
    text = text_value(node, where)
    return SET if text is not None and TIMEOUT_TEXT.search(text) else MISSING


def entry_state(entries, key, judge):
    values = [(value, place) for name, value, place in entries.items if name == key]
    if not values:
        return MISSING if entries.complete else UNKNOWN
    value, place = values[-1]
    return judge(value, place)


def set_unless_none(value, place):
    return MISSING if is_none(value, place) else SET


def options_state(value, place):
    text = text_value(value, place)
    if text is None:
        return UNKNOWN
    return SET if TIMEOUT_TEXT.search(text) else MISSING


def settings_state(value, place):
    entries = dict_entries(value, place)
    return entry_state(entries, "statement_timeout", set_unless_none)


def libpq_state(entries):
    return either(
        [
            entry_state(entries, "options", options_state),
            entry_state(entries, "command_timeout", set_unless_none),
            entry_state(entries, "server_settings", settings_state),
        ]
    )


def psycopg_state(call, where, position):
    conninfo = argument(call, position, "conninfo") or argument(call, None, "dsn")
    keywords = keyword_entries(call.keywords, where)
    return either([text_state(conninfo, where), libpq_state(keywords)])


def pool_state(call, where):
    conninfo = argument(call, 0, "conninfo")
    keywords = keyword_entries(call.keywords, where)
    kwargs = entry_state(keywords, "kwargs", lambda v, p: libpq_state(dict_entries(v, p)))
    return either([text_state(conninfo, where), kwargs])


def asyncpg_state(call, where):
    dsn = argument(call, 0, "dsn")
    keywords = keyword_entries(call.keywords, where)
    return either([text_state(dsn, where), libpq_state(keywords)])


def engine_url(call, where):
    url = argument(call, 0, "url")
    if isinstance(url, ast.Call) and dotted_name(url.func, where.context.aliases) in URL_FACTORIES:
        return text_value(argument(url, 0, "drivername"), where), url
    return text_value(url, where), url


def engine_state(call, where):
    text, url = engine_url(call, where)
    if text is None or not POSTGRES_URL.search(text):
        return None
    keywords = keyword_entries(call.keywords, where)
    connect = entry_state(keywords, "connect_args", lambda v, p: libpq_state(dict_entries(v, p)))
    return either([text_state(url, where), connect])


def call_state(call, where):
    name = dotted_name(call.func, where.context.aliases) or ""
    if name in PSYCOPG_CONNECTS:
        return name, psycopg_state(call, where, PSYCOPG_CONNECTS[name])
    if name in PSYCOPG_POOLS:
        return name, pool_state(call, where)
    if name in ASYNCPG:
        return name, asyncpg_state(call, where)
    if name in ENGINES:
        return name, engine_state(call, where)
    return name, None


def django_findings(context):
    where = module_where(context)
    found = []
    for node in context.tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else []
        if not any(isinstance(t, ast.Name) and t.id == "DATABASES" for t in targets):
            continue
        if not isinstance(node.value, ast.Dict):
            continue
        for key, value in zip(node.value.keys, node.value.values):
            entries = dict_entries(value, where)
            engine = [v for k, v, _ in entries.items if k == "ENGINE"]
            text = text_value(engine[-1], where) if engine else None
            if text is None or not text.startswith(DJANGO_POSTGRES):
                continue
            options = entry_state(entries, "OPTIONS", lambda v, p: libpq_state(dict_entries(v, p)))
            if options == MISSING:
                alias = text_value(key, where) or "default"
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
