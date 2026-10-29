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
FIELD = "dataclasses.field"
FACTORY = "default_factory"
KEYED_CONTAINERS = {"collections.defaultdict"}
LOCK_WORD = re.compile(r"lock|mutex", re.IGNORECASE)
FRESH_LOCKS = {
    name.rsplit(".", 1)[1] for name in MUTEX_CONSTRUCTORS | set(COUNTED_CONSTRUCTORS)
}


def capacity_argument(call, keyword):
    if call.args:
        return call.args[0]
    return keyword_value(call, keyword)


def keyword_value(call, keyword):
    return next((item.value for item in call.keywords if item.arg == keyword), None)


def is_one(value):
    return (
        isinstance(value, ast.Constant)
        and type(value.value) is int
        and value.value == 1
    )


def excludes_others(call, name):
    if name in MUTEX_CONSTRUCTORS:
        return True
    keyword, default = COUNTED_CONSTRUCTORS[name]
    value = capacity_argument(call, keyword)
    return default == 1 if value is None else is_one(value)


def builds_exclusive(factory, aliases):
    if isinstance(factory, ast.Lambda):
        return is_exclusive_construction(factory.body, aliases)
    name = dotted_name(factory, aliases)
    if name in MUTEX_CONSTRUCTORS:
        return True
    return COUNTED_CONSTRUCTORS.get(name, (None, None))[1] == 1


def is_exclusive_construction(value, aliases):
    if not isinstance(value, ast.Call):
        return False
    name = dotted_name(value.func, aliases)
    if name in MUTEX_CONSTRUCTORS or name in COUNTED_CONSTRUCTORS:
        return excludes_others(value, name)
    if name == FIELD:
        factory = keyword_value(value, FACTORY)
        return factory is not None and builds_exclusive(factory, aliases)
    return False


def is_keyed_exclusive(value, aliases):
    if not isinstance(value, ast.Call) or len(value.args) != 1 or value.keywords:
        return False
    if dotted_name(value.func, aliases) not in KEYED_CONTAINERS:
        return False
    return builds_exclusive(value.args[0], aliases)


def named_like_a_lock(expression):
    if isinstance(expression, ast.Call):
        expression = expression.func
        if last_name(expression) in FRESH_LOCKS:
            return False
    while isinstance(expression, ast.Subscript):
        expression = expression.value
    name = last_name(expression)
    return name is not None and LOCK_WORD.search(name) is not None
