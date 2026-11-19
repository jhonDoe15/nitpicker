import ast

from containers.scope import store_targets
from leaks.shared_state import flat_targets
from reach.kinds import CONTAINERS, IN_PLACE_OPERATORS
from signatures.mutation import root_key
from signatures.scopes import key_of

ITEM = "[]"


def operations(node):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        key = root_key(node.func.value)
        return [(key, node.func.attr)] if key else []
    found = [
        (root_key(target), ITEM)
        for target in flat_targets(store_targets(node))
        if isinstance(target, ast.Subscript) and root_key(target)
    ]
    if isinstance(node, ast.AugAssign) and key_of(node.target):
        found.append((key_of(node.target), type(node.op)))
    return found


def function_operations(function):
    return [
        (key, operation, node) for node in ast.walk(function) for key, operation in operations(node)
    ]


def changes(kind, operation):
    if operation == ITEM:
        return kind != "set"
    if isinstance(operation, str):
        return operation in CONTAINERS[kind]
    return operation in IN_PLACE_OPERATORS[kind]


def changed_keys(function, kinds):
    return {
        key
        for key, operation, _ in function_operations(function)
        if key in kinds and changes(kinds[key], operation)
    }
