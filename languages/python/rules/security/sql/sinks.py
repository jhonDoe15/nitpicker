import ast
import re

from checks.common import dotted_name, own_nodes
from security.resolve.calls import bound_callee
from security.resolve.classes import function_of
from security.resolve.scopes import FUNCTIONS, where_of

SINK_NAME = re.compile(
    r"^(?:\w*(?:query|sql|execute)\w*|fetch\w*|prepare|mogrify|raw|text|exec"
    r"|copy_expert|copy_from|copy_to)$",
    re.I,
)
NOT_SINKS = {"execute_command", "to_sql"}
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
DOTTED_SINKS = {
    "psycopg2.extras.execute_values": 1,
    "psycopg2.extras.execute_batch": 1,
    "psycopg.extras.execute_values": 1,
}
QUERY_KEYWORDS = {"sql", "query", "statement", "operation", "sql_query", "querystring"}
RAW_KEYWORDS = QUERY_KEYWORDS | {"text", "string", "obj"}
WRAPPER_PASSES = 2


def query_arguments(call, index=0, name=None, keywords=QUERY_KEYWORDS):
    found = []
    if index is not None and len(call.args) > index:
        found.append(call.args[index])
    names = keywords | ({name} if name else set())
    return found + [k.value for k in call.keywords if k.arg in names]


def last_name(function):
    if isinstance(function, ast.Attribute):
        return function.attr
    return function.id if isinstance(function, ast.Name) else None


def named_sink(name):
    return bool(name) and name not in NOT_SINKS and SINK_NAME.match(name) is not None


def direct_sink(call, aliases):
    function = call.func
    name = dotted_name(function, aliases)
    if name in RAW_BUILDERS:
        return name, True, query_arguments(call, keywords=RAW_KEYWORDS)
    if name in DOTTED_SINKS:
        return name, False, query_arguments(call, DOTTED_SINKS[name])
    last = last_name(function)
    resolved = (name or "").rsplit(".", 1)[-1]
    if named_sink(last) or (resolved != last and named_sink(resolved)):
        return name or last, False, query_arguments(call)
    return None


def aliased_sink(call, where):
    merged = bound_callee(call, where)
    if merged is None:
        return None
    found = direct_sink(merged[0], merged[1].context.aliases)
    if found is None:
        return None
    subject = dotted_name(merged[0].func, merged[1].context.aliases) or found[0]
    return subject, found[1], query_arguments(merged[0])


def parameters_of(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args
    positional = [a.arg for a in every if a.arg not in {"self", "cls"}]
    return positional, [a.arg for a in arguments.kwonlyargs]


def wrapped_parameter(function, context, wrappers):
    positional, keyword_only = parameters_of(function)
    for node in own_nodes(function):
        if not isinstance(node, ast.Call):
            continue
        sink = sink_of(node, context, wrappers)
        for value in sink[2] if sink else []:
            if isinstance(value, ast.Name) and value.id in positional:
                return positional.index(value.id), value.id, sink[1]
            if isinstance(value, ast.Name) and value.id in keyword_only:
                return None, value.id, sink[1]
    return None


class Wrappers:
    def __init__(self):
        self.functions = {}
        self.names = set()

    def add(self, function, found):
        self.functions[id(function)] = found
        self.names.add(function.name)


def build_wrappers(project):
    wrappers = Wrappers()
    for _ in range(WRAPPER_PASSES):
        for context in project.contexts.values():
            if context.tests:
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, FUNCTIONS) and id(node) not in wrappers.functions:
                    found = wrapped_parameter(node, context, wrappers)
                    if found is not None:
                        wrappers.add(node, found)
    return wrappers


def wrapper_sink(call, where, context, wrappers):
    if last_name(call.func) not in wrappers.names:
        return None
    target = function_of(call, where)
    wrapper = wrappers.functions.get(id(target[0])) if target else None
    if wrapper is None:
        return None
    subject = dotted_name(call.func, context.aliases) or target[0].name
    return subject, wrapper[2], query_arguments(call, wrapper[0], wrapper[1])


def sink_of(call, context, wrappers):
    name = dotted_name(call.func, context.aliases)
    if name in RAW_BUILDERS or name in DOTTED_SINKS:
        return direct_sink(call, context.aliases)
    where = where_of(call, context)
    return (
        wrapper_sink(call, where, context, wrappers)
        or direct_sink(call, context.aliases)
        or aliased_sink(call, where)
    )
