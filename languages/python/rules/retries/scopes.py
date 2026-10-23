import ast
from collections import namedtuple

from checks.common import dotted_name
from kinds.names import chain_names
from security.resolve.scopes import values_of, where_of

Retry = namedtuple("Retry", "label body callable call")
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
DECORATORS = {
    "tenacity.retry",
    "retrying.retry",
    "backoff.on_exception",
    "backoff.on_predicate",
    "stamina.retry",
}
ATTEMPTS = {"tenacity.Retrying", "tenacity.AsyncRetrying", "stamina.retry_context"}


def decorator_retries(function, aliases):
    found = []
    for decorator in function.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        name = dotted_name(target, aliases)
        if name in DECORATORS:
            found.append(
                Retry(f"@{name.rsplit('.', 1)[-1]}", function.body, None, None)
            )
    return found


def attempt_loops(node, aliases):
    if not isinstance(node, (ast.For, ast.AsyncFor)):
        return []
    call = node.iter
    if isinstance(call, ast.Call) and dotted_name(call.func, aliases) in ATTEMPTS:
        name = dotted_name(call.func, aliases).rsplit(".", 1)[-1]
        return [Retry(name, node.body, None, None)]
    return []


def attempt_factory(function, context):
    if isinstance(function, ast.Name):
        values = values_of(function.id, where_of(function, context))
        function = values[0][0] if len(values) == 1 else None
    if isinstance(function, ast.Call):
        name = dotted_name(function.func, context.aliases)
        return name if name in ATTEMPTS else None
    return None


def retried_calls(node, context):
    function = node.func if isinstance(node, ast.Call) else None
    if isinstance(function, ast.Attribute) and function.attr == "call":
        function = function.value
    name = attempt_factory(function, context) if function is not None else None
    if name is not None and node.args and chain_names(node.args[0]):
        return [Retry(name.rsplit(".", 1)[-1], [], node.args[0], node)]
    return []


def imports_attempts(context):
    roots = {name.split(".")[0] for name in ATTEMPTS}
    return any(
        value.split(".")[0] in roots
        for table in context.aliases[:2]
        for value in table.values()
    )


def retry_scopes(context):
    found = []
    attempts = imports_attempts(context)
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTIONS):
            found.extend(decorator_retries(node, context.aliases))
        found.extend(attempt_loops(node, context.aliases))
        if attempts:
            found.extend(retried_calls(node, context))
    return found
