import ast

from checks.common import dotted_name, finding
from signatures.annotations import (
    FUNCTION_TYPES,
    decorator_names,
    is_hook,
    members_of,
    parameters_of,
    qualified_name,
)
from signatures.copies import copy_positions
from signatures.scopes import key_of, position, visible_nodes

RULE = "parameter-mutation"
CONTAINERS = {
    "list": {"append", "extend", "insert", "remove", "pop", "clear", "sort", "reverse"},
    "dict": {"update", "setdefault", "pop", "popitem", "clear"},
    "set": {
        "add",
        "discard",
        "remove",
        "pop",
        "clear",
        "update",
        "difference_update",
        "intersection_update",
        "symmetric_difference_update",
    },
    "deque": {
        "append",
        "appendleft",
        "extend",
        "extendleft",
        "insert",
        "remove",
        "pop",
        "popleft",
        "clear",
        "reverse",
        "rotate",
    },
    "bytearray": {"append", "extend", "insert", "remove", "pop", "clear", "reverse"},
}
KIND_BY_NAME = {
    "list": "list",
    "List": "list",
    "MutableSequence": "list",
    "dict": "dict",
    "Dict": "dict",
    "MutableMapping": "dict",
    "defaultdict": "dict",
    "DefaultDict": "dict",
    "OrderedDict": "dict",
    "Counter": "dict",
    "ChainMap": "dict",
    "set": "set",
    "Set": "set",
    "MutableSet": "set",
    "deque": "deque",
    "Deque": "deque",
    "bytearray": "bytearray",
}
OPERATOR_SYMBOLS = {
    ast.Add: "+=",
    ast.Mult: "*=",
    ast.BitOr: "|=",
    ast.BitAnd: "&=",
    ast.Sub: "-=",
    ast.BitXor: "^=",
}
IN_PLACE_OPERATORS = {
    "list": (ast.Add, ast.Mult),
    "dict": (ast.BitOr,),
    "set": (ast.BitOr, ast.BitAnd, ast.Sub, ast.BitXor),
    "deque": (ast.Add, ast.Mult),
    "bytearray": (ast.Add, ast.Mult),
}
MODULE_MUTATORS = {
    "random.shuffle",
    "heapq.heappush",
    "heapq.heappop",
    "heapq.heapify",
    "heapq.heapreplace",
    "heapq.heappushpop",
    "bisect.insort",
    "bisect.insort_left",
    "bisect.insort_right",
}


FIXED_SIGNATURE_DECORATORS = {"override", "overload"}
ANY_MUTATORS = set().union(*CONTAINERS.values())


def container_kind(annotation):
    return next(
        (KIND_BY_NAME[name] for name in members_of(annotation) if name in KIND_BY_NAME),
        None,
    )


def container_parameters(function):
    kinds = {
        argument.arg: container_kind(argument.annotation)
        for argument in parameters_of(function)
    }
    return {name: kind for name, kind in kinds.items() if kind is not None}


def root_key(node):
    while isinstance(node, ast.Subscript):
        node = node.value
    return key_of(node)


def flattened(targets):
    pending = list(targets)
    for target in pending:
        if isinstance(target, (ast.Tuple, ast.List)):
            pending.extend(target.elts)
        elif isinstance(target, ast.Starred):
            pending.append(target.value)
        else:
            yield target


def targets_of(node):
    if isinstance(node, (ast.Assign, ast.Delete)):
        return list(flattened(node.targets))
    if isinstance(node, (ast.AugAssign, ast.AnnAssign)):
        return list(flattened([node.target]))
    return []


def item_labels(node, kinds):
    return [
        f"{root_key(target)}[...]"
        for target in targets_of(node)
        if isinstance(target, ast.Subscript) and root_key(target) in kinds
    ]


def augmented_labels(node, kinds):
    if isinstance(node, ast.AugAssign):
        key = key_of(node.target)
        kind = kinds.get(key)
        if kind and isinstance(node.op, IN_PLACE_OPERATORS[kind]):
            return [f"{key} {OPERATOR_SYMBOLS[type(node.op)]}"]
    return []


def call_labels(node, kinds, context):
    if not isinstance(node, ast.Call):
        return []
    func = node.func
    if isinstance(func, ast.Attribute):
        key = key_of(func.value)
        if key in kinds and func.attr in CONTAINERS[kinds[key]]:
            return [f"{key}.{func.attr}"]
        if (
            isinstance(func.value, ast.Subscript)
            and root_key(func.value) in kinds
            and func.attr in ANY_MUTATORS
        ):
            return [f"{root_key(func.value)}[...].{func.attr}"]
    first = node.args[0] if node.args else None
    name = dotted_name(func, context.aliases)
    if name in MODULE_MUTATORS and key_of(first) in kinds:
        return [f"{name}({key_of(first)})"]
    return []


def mutation_labels(node, kinds, context):
    return [
        *item_labels(node, kinds),
        *augmented_labels(node, kinds),
        *call_labels(node, kinds, context),
    ]


def alias_keys(nodes, name):
    keys = set()
    for node in nodes:
        if isinstance(node, ast.Assign) and key_of(node.value) == name:
            keys.update(
                key
                for key in map(key_of, node.targets)
                if key is not None and key != name
            )
    return keys


def parameter_findings(function, name, kind, context):
    nodes = visible_nodes(function, name)
    kinds = dict.fromkeys({name, *alias_keys(nodes, name)}, kind)
    events = [
        (position(node), label, node)
        for node in nodes
        if hasattr(node, "lineno")
        for label in mutation_labels(node, kinds, context)
    ]
    first = min((event[0] for event in events), default=None)
    if first is None or any(
        copied < first for copied in copy_positions(nodes, name, context)
    ):
        return []
    reported, found = set(), []
    for _, label, node in events:
        if label not in reported:
            reported.add(label)
            subject = f"{label} ({qualified_name(function, context)})"
            found.append(finding(context.path, RULE, subject, node))
    return found


def enclosing_function(node, context):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, FUNCTION_TYPES):
        parent = context.parents.get(id(parent))
    return parent


def is_private_helper(function, context):
    private = function.name.startswith("_") and not function.name.startswith("__")
    return private or enclosing_function(function, context) is not None


def function_findings(function, context):
    if (
        is_hook(function)
        or is_private_helper(function, context)
        or decorator_names(function) & FIXED_SIGNATURE_DECORATORS
    ):
        return []
    return [
        item
        for name, kind in container_parameters(function).items()
        for item in parameter_findings(function, name, kind, context)
    ]


def check(context):
    if context.tests:
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
