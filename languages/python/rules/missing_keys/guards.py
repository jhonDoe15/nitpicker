import ast

from checks.common import last_name, own_nodes

UPDATED = "*"
CATCHES = {
    "KeyError",
    "LookupError",
    "Exception",
    "BaseException",
    "MultiValueDictKeyError",
    "BadRequestKeyError",
}


def pair(mapping, key):
    return ast.unparse(mapping), ast.unparse(key)


def tested_pairs(function):
    tested = set()
    for node in own_nodes(function):
        if isinstance(node, ast.Compare) and isinstance(node.ops[0], (ast.In, ast.NotIn)):
            tested.add(pair(node.comparators[0], node.left))
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in {"get", "pop", "setdefault"} and node.args:
                tested.add(pair(node.func.value, node.args[0]))
    return tested


def stored_pairs(function):
    stored = set()
    for node in own_nodes(function):
        if isinstance(node, ast.Subscript) and not isinstance(node.ctx, ast.Load):
            stored.add(pair(node.value, node.slice))
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr == "update":
                stored.add((ast.unparse(node.func.value), UPDATED))
    return stored


def catches_key_error(handler):
    if handler.type is None:
        return True
    types = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return bool(exception_names(types) & CATCHES)


def exception_names(types):
    return {last_name(item) for item in types if last_name(item) is not None}


def suppresses_key_error(node):
    for item in node.items:
        call = item.context_expr
        if isinstance(call, ast.Call) and last_name(call.func) == "suppress":
            if exception_names(call.args) & CATCHES:
                return True
    return False


def inside_guarded_try(node, context):
    child, parent = node, context.parents.get(id(node))
    while parent is not None and not isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if isinstance(parent, ast.Try) and child in parent.body:
            if any(catches_key_error(handler) for handler in parent.handlers):
                return True
        if isinstance(parent, ast.With) and child in parent.body and suppresses_key_error(parent):
            return True
        child, parent = parent, context.parents.get(id(parent))
    return False
