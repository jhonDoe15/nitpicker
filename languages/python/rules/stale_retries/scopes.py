import ast

from checks.common import dotted_name, last_name, walk_statements
from retries.scopes import ATTEMPTS, DECORATORS
from smells.loops import exits_loop, handler_retries

STALE = "StaleDataError"
COMMITS = {"commit", "flush"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
LOOP_LABEL = "retry loop"


class Scope:
    def __init__(self, label, statements):
        self.label = label
        self.statements = statements


def names_stale(node):
    return any(
        last_name(item) == STALE
        for item in ast.walk(node)
        if isinstance(item, (ast.Name, ast.Attribute))
    )


def imports_sqlalchemy(context):
    return any(
        value.split(".")[0] == "sqlalchemy"
        for table in context.aliases[:2]
        for value in table.values()
    )


def catches_stale(handler):
    return handler.type is not None and names_stale(handler.type)


def commit_calls(statements):
    return [
        node
        for node in walk_statements(statements)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in COMMITS
        and not node.args
    ]


def is_stale_retry(node):
    retries = node.handlers and all(handler_retries(h) for h in node.handlers)
    caught = any(catches_stale(h) for h in node.handlers)
    return bool(retries and caught and exits_loop(node.body + node.orelse))


def loop_scopes(loop):
    return [
        Scope(LOOP_LABEL, loop.body)
        for node in walk_statements(loop.body)
        if isinstance(node, ast.Try)
        and is_stale_retry(node)
        and commit_calls(node.body)
    ][:1]


def decorator_scopes(function, context):
    found = []
    for decorator in function.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        name = dotted_name(target, context.aliases)
        if name in DECORATORS and names_stale(decorator):
            found.append(Scope(f"@{name.rsplit('.', 1)[-1]}", function.body))
    return found


def attempt_scopes(loop, context):
    call = loop.iter
    if not isinstance(call, ast.Call):
        return []
    name = dotted_name(call.func, context.aliases)
    if name in ATTEMPTS and names_stale(call):
        return [Scope(name.rsplit(".", 1)[-1], loop.body)]
    return []


def retry_scopes(context):
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTIONS):
            found.extend(decorator_scopes(node, context))
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            found.extend(attempt_scopes(node, context) or loop_scopes(node))
        elif isinstance(node, ast.While):
            found.extend(loop_scopes(node))
    return found
