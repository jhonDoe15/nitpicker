import ast
import re

from checks.common import dotted_name
from effects.tables import UNSAFE_SQL, WRITE
from security.resolve.scopes import where_of
from security.sql.pieces import Pieces
from security.sql.sinks import (
    RAW_BUILDERS,
    RAW_KEYWORDS,
    build_wrappers,
    query_arguments,
    wrapper_sink,
)

SQL_METHODS = {"execute", "executemany", "exec_driver_sql", "executescript"}
SQL_WRITE = re.compile(r"^\s*(?:insert|update|delete|merge|replace)\b", re.I)
INSERT = re.compile(r"^\s*insert\b", re.I)
UPSERT = re.compile(
    r"on\s+conflict|on\s+duplicate\s+key|insert\s+(?:or\s+)?(?:ignore|replace)"
    r"|\bmerge\b|replace\s+into",
    re.I,
)
CONSTRUCT_WRITES = {
    "sqlalchemy.insert",
    "sqlalchemy.update",
    "sqlalchemy.delete",
    "sqlalchemy.dialects.postgresql.insert",
    "sqlalchemy.dialects.mysql.insert",
    "sqlalchemy.dialects.sqlite.insert",
}
INSERT_CONSTRUCTS = {name for name in CONSTRUCT_WRITES if name.endswith(".insert")}
UPSERT_METHODS = ("on_conflict", "on_duplicate")


def construct_of(node, aliases):
    attributes = []
    while isinstance(node, (ast.Call, ast.Attribute)):
        if isinstance(node, ast.Call):
            name = dotted_name(node.func, aliases)
            if name in CONSTRUCT_WRITES:
                return name, attributes
            node = node.func
        else:
            attributes.append(node.attr)
            node = node.value
    return None, attributes


def unwrap_raw(value, aliases):
    if isinstance(value, ast.Call) and dotted_name(value.func, aliases) in RAW_BUILDERS:
        inner = query_arguments(value, keywords=RAW_KEYWORDS)
        return inner[0] if inner else None
    return value


def statement_arguments(call, names, database, routed, site, context):
    if names[-1] in SQL_METHODS and database:
        return query_arguments(call)
    if not routed:
        return []
    wrappers = context.project.memo("sql-wrappers", build_wrappers)
    if names[-1] not in wrappers.names:
        return []
    sink = wrapper_sink(call, where_of(site, context), context, wrappers)
    return sink[2] if sink else []


def statement_of(arguments, site, context):
    for argument in arguments:
        construct = construct_of(argument, context.aliases)
        if construct[0] is not None:
            return None, construct
        value = unwrap_raw(argument, context.aliases)
        text = Pieces().of(value, where_of(site, context))[0] if value else ""
        if text:
            return text, None
    return None, None


def sql_tags(call, names, flags, site, context, text):
    database, routed = flags
    arguments = statement_arguments(call, names, database, routed, site, context)
    if not arguments:
        return {}
    statement, construct = statement_of(arguments, site, context)
    if construct is not None:
        name, attributes = construct
        tags = {WRITE: (text,)}
        upsert = any(a.startswith(UPSERT_METHODS) for a in attributes)
        if name in INSERT_CONSTRUCTS and not upsert:
            tags[UNSAFE_SQL] = (text,)
        return tags
    if statement is None or not SQL_WRITE.match(statement):
        return {}
    tags = {WRITE: (text,)}
    if INSERT.match(statement) and not UPSERT.search(statement):
        tags[UNSAFE_SQL] = (text,)
    return tags
