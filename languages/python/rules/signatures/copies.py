import ast

from checks.common import dotted_name
from signatures.annotations import FUNCTION_TYPES
from signatures.scopes import key_of, position

COPY_CONSTRUCTORS = {
    "list",
    "dict",
    "set",
    "frozenset",
    "tuple",
    "sorted",
    "deque",
    "bytearray",
    "Counter",
    "OrderedDict",
    "defaultdict",
    "reversed",
}
COPY_CALLS = {"copy.copy", "copy.deepcopy"}


def is_copy(node, context):
    if isinstance(node, ast.Call):
        func = node.func
        if isinstance(func, ast.Name) and func.id in COPY_CONSTRUCTORS:
            return True
        if isinstance(func, ast.Attribute) and func.attr in {"copy", "__copy__"}:
            return True
        return dotted_name(func, context.aliases) in COPY_CALLS
    if isinstance(node, ast.Subscript):
        return isinstance(node.slice, ast.Slice)
    if isinstance(node, ast.BinOp):
        return isinstance(node.op, (ast.Add, ast.BitOr))
    return isinstance(
        node,
        (ast.ListComp, ast.SetComp, ast.DictComp, ast.List, ast.Set, ast.Dict),
    ) and not is_empty_display(node)


def is_empty_display(node):
    if isinstance(node, (ast.List, ast.Set)):
        return not node.elts
    return isinstance(node, ast.Dict) and not node.keys


def mentions(node, name):
    return any(
        isinstance(item, ast.Name) and item.id == name for item in ast.walk(node)
    )


def under_test_of(node, name, context):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, FUNCTION_TYPES):
        if isinstance(parent, ast.If) and mentions(parent.test, name):
            return True
        parent = context.parents.get(id(parent))
    return False


def copy_positions(nodes, name, context):
    return [
        position(node)
        for node in nodes
        if isinstance(node, ast.Assign)
        and any(
            isinstance(target, ast.Name) and target.id == name
            for target in node.targets
        )
        and is_copy(node.value, context)
        and not under_test_of(node, name, context)
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
