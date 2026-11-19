import ast

from checks.common import last_name
from review.fields import TYPED_DICT, base_class, record_kind
from signatures.annotations import (
    TRANSPARENT_WRAPPERS,
    members_of,
    parameters_of,
    subscript_arguments,
)

UNION_NAMES = {"Union", "Optional"}
MAX_UNION_MEMBERS = 24
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

ANY_MUTATORS = set().union(*CONTAINERS.values())


def parsed(node):
    if not (isinstance(node, ast.Constant) and isinstance(node.value, str)):
        return node
    try:
        return ast.parse(node.value.strip(), mode="eval").body
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return None


def annotation_parts(node):
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return [node.left, node.right], None
    if isinstance(node, ast.Subscript):
        arguments = subscript_arguments(node)
        wrapper = last_name(node.value)
        if wrapper in UNION_NAMES:
            return arguments, None
        if wrapper in TRANSPARENT_WRAPPERS:
            return arguments[:1], None
        return [], node.value
    return [], node


def annotation_classes(annotation):
    pending, found = [annotation], []
    for node in pending:
        if len(pending) > MAX_UNION_MEMBERS:
            break
        parts, named = annotation_parts(parsed(node))
        pending.extend(parts)
        if named is not None:
            found.append(named)
    return found


def is_typed_dict(annotation, context):
    if annotation is None:
        return False
    return any(
        found is not None and record_kind(found[0], found[1]) == TYPED_DICT
        for found in (
            base_class(context, node) for node in annotation_classes(annotation)
        )
    )


def container_kind(annotation, context):
    named = next(
        (KIND_BY_NAME[name] for name in members_of(annotation) if name in KIND_BY_NAME),
        None,
    )
    return "dict" if named is None and is_typed_dict(annotation, context) else named


def container_parameters(function, context):
    kinds = {
        argument.arg: container_kind(argument.annotation, context)
        for argument in parameters_of(function)
    }
    return {name: kind for name, kind in kinds.items() if kind is not None}
