import ast
from collections import namedtuple

from checks.common import dotted_name
from smells.io_index import chain_names

Retry = namedtuple("Retry", "label body callable")
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
            found.append(Retry(f"@{name.rsplit('.', 1)[-1]}", function.body, None))
    return found


def attempt_loops(node, aliases):
    if not isinstance(node, (ast.For, ast.AsyncFor)):
        return []
    call = node.iter
    if isinstance(call, ast.Call) and dotted_name(call.func, aliases) in ATTEMPTS:
        name = dotted_name(call.func, aliases).rsplit(".", 1)[-1]
        return [Retry(name, node.body, None)]
    return []


def retried_calls(node, aliases):
    function = node.func if isinstance(node, ast.Call) else None
    if isinstance(function, ast.Attribute) and function.attr == "call":
        function = function.value
    if (
        isinstance(function, ast.Call)
        and dotted_name(function.func, aliases) in ATTEMPTS
    ):
        name = dotted_name(function.func, aliases).rsplit(".", 1)[-1]
        if node.args and chain_names(node.args[0]):
            return [Retry(name, [], node.args[0])]
    return []


def retry_scopes(context):
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTIONS):
            found.extend(decorator_retries(node, context.aliases))
        found.extend(attempt_loops(node, context.aliases))
        found.extend(retried_calls(node, context.aliases))
    return found
