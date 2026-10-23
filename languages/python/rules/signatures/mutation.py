import ast

from checks.common import dotted_name, finding
from signatures.annotations import (
    FUNCTION_TYPES,
    is_hook,
    members_of,
    parameters_of,
    qualified_name,
)

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


def base_name(node):
    while isinstance(node, ast.Subscript):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def rebound_names(function):
    augmented = {
        id(node.target)
        for node in ast.walk(function)
        if isinstance(node, ast.AugAssign)
    }
    return {
        node.id
        for node in ast.walk(function)
        if isinstance(node, ast.Name)
        and isinstance(node.ctx, ast.Store)
        and id(node) not in augmented
    }


def targets_of(node):
    if isinstance(node, ast.Assign):
        return node.targets
    if isinstance(node, (ast.AugAssign, ast.AnnAssign)):
        return [node.target]
    if isinstance(node, ast.Delete):
        return node.targets
    return []


def item_label(node, names):
    for target in targets_of(node):
        if isinstance(target, ast.Subscript) and base_name(target) in names:
            return f"{base_name(target)}[...]"
    return None


def augmented_label(node, kinds):
    if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
        kind = kinds.get(node.target.id)
        if kind and isinstance(node.op, IN_PLACE_OPERATORS[kind]):
            return f"{node.target.id} {OPERATOR_SYMBOLS[type(node.op)]}"
    return None


def call_label(node, kinds, context):
    if not isinstance(node, ast.Call):
        return None
    func = node.func
    if (
        isinstance(func, ast.Attribute)
        and isinstance(func.value, ast.Name)
        and func.value.id in kinds
        and func.attr in CONTAINERS[kinds[func.value.id]]
    ):
        return f"{func.value.id}.{func.attr}"
    first = node.args[0] if node.args else None
    if (
        dotted_name(func, context.aliases) in MODULE_MUTATORS
        and isinstance(first, ast.Name)
        and first.id in kinds
    ):
        return f"{dotted_name(func, context.aliases)}({first.id})"
    return None


def mutation_label(node, kinds, context):
    return (
        item_label(node, kinds)
        or augmented_label(node, kinds)
        or call_label(node, kinds, context)
    )


def function_findings(function, context):
    rebound = rebound_names(function)
    kinds = {
        name: kind
        for name, kind in container_parameters(function).items()
        if name not in rebound and not is_hook(function)
    }
    reported = set()
    found = []
    for node in ast.walk(function) if kinds else []:
        label = mutation_label(node, kinds, context)
        if label is None or label in reported:
            continue
        reported.add(label)
        subject = f"{label} ({qualified_name(function, context)})"
        found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    if context.tests:
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
