import ast
import re

from checks.common import dotted_name, last_name

MUTEX_CONSTRUCTORS = {
    "asyncio.Lock",
    "asyncio.Condition",
    "anyio.Lock",
    "anyio.Condition",
    "trio.Lock",
    "trio.StrictFIFOLock",
    "trio.Condition",
}
COUNTED_CONSTRUCTORS = {
    "asyncio.Semaphore": ("value", 1),
    "asyncio.BoundedSemaphore": ("value", 1),
    "anyio.Semaphore": ("initial_value", None),
    "anyio.CapacityLimiter": ("total_tokens", None),
    "trio.Semaphore": ("initial_value", None),
    "trio.CapacityLimiter": ("total_tokens", None),
}
LOCK_WORD = re.compile(r"lock|mutex", re.IGNORECASE)


def targets_of(node):
    if isinstance(node, ast.Assign):
        return node.targets
    return [node.target] if isinstance(node, ast.AnnAssign) else []


def capacity_argument(call, keyword):
    if call.args:
        return call.args[0]
    return next((item.value for item in call.keywords if item.arg == keyword), None)


def is_one(value):
    return isinstance(value, ast.Constant) and type(value.value) is int and value.value == 1


def excludes_others(call, name):
    if name in MUTEX_CONSTRUCTORS:
        return True
    keyword, default = COUNTED_CONSTRUCTORS[name]
    value = capacity_argument(call, keyword)
    return default == 1 if value is None else is_one(value)


def constructed_locks(tree, aliases):
    found = {}
    for node in ast.walk(tree):
        value = getattr(node, "value", None)
        if not isinstance(value, ast.Call):
            continue
        name = dotted_name(value.func, aliases)
        if name not in MUTEX_CONSTRUCTORS and name not in COUNTED_CONSTRUCTORS:
            continue
        exclusive = excludes_others(value, name)
        for target in targets_of(node):
            key = ast.unparse(target)
            found[key] = found.get(key, True) and exclusive
    return found


FRESH_LOCKS = {name.rsplit(".", 1)[1] for name in MUTEX_CONSTRUCTORS | set(COUNTED_CONSTRUCTORS)}


def named_like_a_lock(expression):
    if isinstance(expression, ast.Call):
        expression = expression.func
        if last_name(expression) in FRESH_LOCKS:
            return False
    while isinstance(expression, ast.Subscript):
        expression = expression.value
    name = last_name(expression)
    return name is not None and LOCK_WORD.search(name) is not None


def is_lock(expression, constructed):
    key = ast.unparse(expression)
    if key in constructed:
        return constructed[key]
    return named_like_a_lock(expression)
