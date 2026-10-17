import ast
import re

from checks.common import dotted_name, finding, own_nodes
from security.sql.pieces import Pieces
from security.values import FUNCTIONS, function_of, where_of

RULE = "sql-string-formatting"
STATEMENT = re.compile(
    r"\b(?:select\s.+?\sfrom\s|delete\s+from\s|(?:insert|replace)\s.+?\svalues\s"
    r"|update\s.+?\sset\s)",
    re.I | re.S,
)
CLAUSE = re.compile(
    r"\b(?:where|order\s+by|group\s+by|having|limit|offset|returning|values|join)\b",
    re.I,
)
UPPER_CLAUSE = re.compile(r"\b(?:SELECT|FROM|UPDATE|DELETE|INSERT|SET|AND|OR|IN|ON)\b")
NAMED_SINKS = {
    "execute",
    "executemany",
    "executescript",
    "exec_driver_sql",
    "read_sql",
    "read_sql_query",
    "read_sql_table",
    "raw",
    "text",
    "query",
    "fetch",
    "fetchrow",
    "fetchval",
    "fetch_all",
    "fetch_one",
    "fetch_val",
    "copy_expert",
}
RAW_BUILDERS = {
    "sqlalchemy.text",
    "sqlalchemy.sql.text",
    "sqlalchemy.sql.expression.text",
    "sqlalchemy.literal_column",
    "sqlalchemy.sql.literal_column",
    "sqlalchemy.sql.expression.literal_column",
    "peewee.SQL",
    "psycopg.sql.SQL",
    "psycopg2.sql.SQL",
}
QUERY_KEYWORDS = {"sql", "query", "statement", "operation", "sql_query"}
WRAPPER_PASSES = 2


def is_sql(text):
    return bool(
        STATEMENT.search(text) or CLAUSE.search(text) or UPPER_CLAUSE.search(text)
    )


def query_arguments(call, index=0, name=None):
    found = [call.args[index]] if len(call.args) > index else []
    names = QUERY_KEYWORDS | ({name} if name else set())
    return found + [k.value for k in call.keywords if k.arg in names]


def direct_sink(call, aliases):
    function = call.func
    name = dotted_name(function, aliases)
    if name in RAW_BUILDERS:
        return name, True, query_arguments(call)
    last = function.attr if isinstance(function, ast.Attribute) else None
    last = last or (function.id if isinstance(function, ast.Name) else None)
    if last in NAMED_SINKS:
        return name or last, False, query_arguments(call)
    return None


def parameters_of(function):
    every = function.args.posonlyargs + function.args.args
    return [a.arg for a in every if a.arg not in {"self", "cls"}]


def wrapped_parameter(function, context, wrappers):
    parameters = parameters_of(function)
    for node in own_nodes(function):
        if not isinstance(node, ast.Call):
            continue
        sink = sink_of(node, context, wrappers)
        for value in sink[2] if sink else []:
            if isinstance(value, ast.Name) and value.id in parameters:
                return parameters.index(value.id), value.id, sink[1]
    return None


def build_wrappers(project):
    wrappers = {}
    for _ in range(WRAPPER_PASSES):
        for context in project.contexts.values():
            if context.tests:
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, FUNCTIONS) and id(node) not in wrappers:
                    found = wrapped_parameter(node, context, wrappers)
                    if found is not None:
                        wrappers[id(node)] = found
    return wrappers


def sink_of(call, context, wrappers):
    direct = direct_sink(call, context.aliases)
    if direct is not None or not wrappers:
        return direct
    target = function_of(call, where_of(call, context))
    wrapper = wrappers.get(id(target[0])) if target else None
    if wrapper is None:
        return None
    subject = dotted_name(call.func, context.aliases) or target[0].name
    return subject, wrapper[2], query_arguments(call, wrapper[0], wrapper[1])


def composed_raw(call, context):
    function = call.func
    if not (isinstance(function, ast.Attribute) and function.attr == "format"):
        return []
    receiver = getattr(function.value, "func", None)
    if dotted_name(receiver, context.aliases) not in RAW_BUILDERS:
        return []
    return [
        argument
        for argument in call.args
        if isinstance(argument, ast.Call)
        and dotted_name(argument.func, context.aliases) in RAW_BUILDERS
    ]


def check(context):
    if context.tests:
        return []
    wrappers = context.project.memo("sql-wrappers", build_wrappers)
    pieces = Pieces()
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        for raw in composed_raw(node, context):
            text, unsafe, _ = pieces.of(raw.args[0], where_of(raw, context))
            if unsafe:
                found.append(
                    finding(
                        context.path, RULE, dotted_name(raw.func, context.aliases), raw
                    )
                )
        sink = sink_of(node, context, wrappers)
        if sink is None:
            continue
        subject, raw, arguments = sink
        where = where_of(node, context)
        for value in arguments:
            text, unsafe, built = pieces.of(value, where)
            if built and unsafe and (raw or is_sql(text)):
                found.append(finding(context.path, RULE, subject, node))
                break
    return found
