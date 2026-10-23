import ast

from checks.common import dotted_name, own_nodes, words_of
from security.resolve.classes import (
    attribute_values,
    instance_classes,
    is_self,
    method_named,
)
from security.resolve.scopes import (
    FUNCTIONS,
    definition,
    enclosing_class,
    lookup,
    module_where,
    scope_of,
    where_of,
)

LITERALS = (
    ast.Dict,
    ast.List,
    ast.Set,
    ast.Tuple,
    ast.Constant,
    ast.JoinedStr,
    ast.ListComp,
    ast.SetComp,
    ast.DictComp,
)
PLAIN_CALLS = {
    "dict",
    "list",
    "set",
    "tuple",
    "frozenset",
    "str",
    "bytes",
    "bytearray",
    "collections.defaultdict",
    "collections.Counter",
    "collections.deque",
    "collections.OrderedDict",
    "collections.ChainMap",
}
EXECUTORS = {
    "concurrent.futures.ThreadPoolExecutor",
    "concurrent.futures.ProcessPoolExecutor",
    "multiprocessing.Pool",
    "multiprocessing.pool.Pool",
    "multiprocessing.pool.ThreadPool",
}
EXECUTOR_WORDS = {"executor", "pool"}
DEFINITIONS = (ast.ClassDef, *FUNCTIONS)


def local_functions(scope, context):
    def build(_):
        return {n.name: n for n in own_nodes(scope) if isinstance(n, FUNCTIONS)}

    return context.project.memo(("local-functions", context.path, id(scope)), build)


def named_function(function, context):
    scope = scope_of(function, context)
    while scope is not None:
        if isinstance(scope, FUNCTIONS):
            found = local_functions(scope, context).get(function.id)
            if found is not None:
                return found
        scope = scope_of(scope, context)
    found = definition(function, where_of(function, context), FUNCTIONS)
    return found[0] if found else None


def class_method(cls, place, name):
    found = method_named(cls, place, name)
    return found[0] if found else None


def method_of(function, context):
    receiver, where = function.value, where_of(function, context)
    if is_self(receiver, context):
        cls = enclosing_class(receiver, context)
        return class_method(cls, module_where(context), function.attr) if cls else None
    if isinstance(receiver, (ast.Name, ast.Attribute)):
        cls = definition(receiver, where)
        if cls is not None:
            return class_method(cls[0], cls[1], function.attr)
    for cls, place in instance_classes(receiver, where):
        found = class_method(cls, place, function.attr)
        if found is not None:
            return found
    found = definition(function, where, FUNCTIONS)
    return found[0] if found else None


def callee_of(function, context):
    if isinstance(function, ast.Name):
        return named_function(function, context)
    if isinstance(function, ast.Attribute):
        return method_of(function, context)
    return None


def is_plain(value, where):
    if isinstance(value, LITERALS):
        return True
    if isinstance(value, ast.Call):
        return dotted_name(value.func, where.context.aliases) in PLAIN_CALLS
    return False


def is_foreign(value, where):
    if is_plain(value, where):
        return True
    if not isinstance(value, ast.Call) or isinstance(value.func, ast.Call):
        return False
    return definition(value.func, where, DEFINITIONS) is None


def receiver_values(receiver, context):
    where = where_of(receiver, context)
    if isinstance(receiver, ast.Name):
        entries = lookup(receiver.id, where)
        if any(kind != "value" for kind, _, _ in entries):
            return []
        return [(value, place) for _, value, place in entries]
    if isinstance(receiver, ast.Attribute) and is_self(receiver.value, context):
        return attribute_values(receiver, where) or []
    return []


def plain_receiver(function, context):
    if not isinstance(function, ast.Attribute):
        return False
    values = receiver_values(function.value, context)
    return bool(values) and all(is_plain(value, place) for value, place in values)


def shares_method(function, context):
    receiver = function.value if isinstance(function, ast.Attribute) else None
    if not isinstance(receiver, ast.Attribute):
        return True
    values = receiver_values(receiver, context)
    return not any(is_foreign(value, place) for value, place in values)


def is_executor(receiver, context):
    if isinstance(receiver, ast.Call):
        return dotted_name(receiver.func, context.aliases) in EXECUTORS
    if not isinstance(receiver, (ast.Name, ast.Attribute)):
        return False
    last = receiver.id if isinstance(receiver, ast.Name) else receiver.attr
    if set(words_of(last)) & EXECUTOR_WORDS:
        return True
    return any(
        isinstance(value, ast.Call)
        and dotted_name(value.func, place.context.aliases) in EXECUTORS
        for value, place in receiver_values(receiver, context)
    )
