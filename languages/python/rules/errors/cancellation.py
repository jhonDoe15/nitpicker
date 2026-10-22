import ast

from checks.common import finding, own_nodes, type_text
from errors.cancellation_names import caught_cancellations
from errors.cancellation_paths import (
    BREAK,
    CONTINUE,
    LOST,
    NEXT,
    binds_error,
    block_outcomes,
)

RULE = "cancellation-not-propagated"
CONSUMING = {NEXT, LOST, BREAK, CONTINUE}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def unchanged_error(handler):
    name = handler.name
    return (
        name
        if name and not any(binds_error(node, name) for node in own_nodes(handler))
        else None
    )


def awaited_task(statement):
    value = getattr(statement, "value", None)
    if isinstance(statement, (ast.Expr, ast.Assign)) and isinstance(value, ast.Await):
        return value.value.id if isinstance(value.value, ast.Name) else None
    return None


def enclosing_function(node, context):
    current = context.parents.get(id(node))
    while current is not None and not isinstance(current, FUNCTIONS):
        current = context.parents.get(id(current))
    return current


def cancelled_before(function, task, line):
    return any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "cancel"
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == task
        and node.lineno < line
        for node in own_nodes(function)
    )


def awaits_cancelled_task(handler, context):
    block = context.parents.get(id(handler))
    function = enclosing_function(handler, context)
    caught = caught_cancellations(handler, context)
    if not (isinstance(block, ast.Try) and function and caught):
        return False
    if not all(name.startswith("asyncio.") for name in caught):
        return False
    tasks = [awaited_task(statement) for statement in block.body]
    return bool(tasks) and all(
        task and cancelled_before(function, task, block.lineno) for task in tasks
    )


def cancellation_finding(handler, context):
    if type(context.parents.get(id(handler))).__name__ == "TryStar":
        return None
    caught = caught_cancellations(handler, context)
    if not caught:
        return None
    outcomes = block_outcomes(handler.body, unchanged_error(handler), context, caught)
    if not outcomes & CONSUMING:
        return None
    subject = f"except {type_text(handler.type)}"
    return finding(context.path, RULE, subject, handler)
