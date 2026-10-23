import ast
import re

from checks.common import dotted_name, last_name

LOCK_CONSTRUCTORS = {
    "asyncio.Lock",
    "asyncio.Semaphore",
    "asyncio.BoundedSemaphore",
    "asyncio.Condition",
    "anyio.Lock",
    "anyio.Semaphore",
    "anyio.Condition",
    "anyio.CapacityLimiter",
    "trio.Lock",
    "trio.StrictFIFOLock",
    "trio.Semaphore",
    "trio.CapacityLimiter",
}
LOCK_WORD = re.compile(r"lock|mutex|semaphore|limiter", re.IGNORECASE)


def targets_of(node):
    if isinstance(node, ast.Assign):
        return node.targets
    return [node.target] if isinstance(node, ast.AnnAssign) else []


def constructed_locks(tree, aliases):
    found = set()
    for node in ast.walk(tree):
        value = getattr(node, "value", None)
        if not isinstance(value, ast.Call):
            continue
        if dotted_name(value.func, aliases) in LOCK_CONSTRUCTORS:
            found.update(ast.unparse(target) for target in targets_of(node))
    return found


def named_like_a_lock(expression):
    if isinstance(expression, ast.Call):
        expression = expression.func
    while isinstance(expression, ast.Subscript):
        expression = expression.value
    name = last_name(expression)
    return name is not None and LOCK_WORD.search(name) is not None


def is_lock(expression, constructed):
    return ast.unparse(expression) in constructed or named_like_a_lock(expression)
