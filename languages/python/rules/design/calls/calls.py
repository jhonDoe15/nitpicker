import ast

from design.resolve.evaluate import evaluate, name_value
from design.resolve.lookup import find_member
from design.resolve.symbols import Klass
from design.support.astutil import (
    STORE_CONTEXTS,
    all_nodes,
    chain,
    chain_text,
)

MAX_ALIAS_DEPTH = 4


class Resolution:
    def __init__(self, target, receiver=None, shift=0):
        self.target = target
        self.receiver = receiver
        self.shift = shift


def is_super_call(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "super"
    )


def resolve_call(scope, call):
    key = ("call", id(call))
    if key not in scope.values:
        scope.values[key] = compute_resolution(scope, call)
    return scope.values[key]


def compute_resolution(scope, call):
    func = call.func
    value = evaluate(scope, func)
    if value is None:
        return None
    if value[0] == "cls":
        found = find_member(scope.index, value[1], "__init__")
        return Resolution(found[0]) if found and found[0] else None
    if value[0] == "inst" and isinstance(value[1], Klass):
        found = find_member(scope.index, value[1], "__call__")
        return Resolution(found[0], func) if found and found[0] else None
    if value[0] != "func":
        return None
    function, receiver_type = value[1], value[2]
    if receiver_type is not None and not function.static and not function.classmethod:
        return Resolution(
            function, func.value if isinstance(func, ast.Attribute) else None
        )
    return Resolution(function, None, unbound_shift(scope, func, function))


def unbound_shift(scope, func, function):
    if not isinstance(func, ast.Attribute) or function.owner is None:
        return 0
    if function.static or function.classmethod:
        return 0
    base = evaluate(scope, func.value)
    return 1 if base is not None and base[0] == "cls" else 0


def stores_of(scope):
    if not hasattr(scope, "stores"):
        stores = set()
        for node in all_nodes(scope.function.node):
            if isinstance(node, ast.Attribute) and isinstance(node.ctx, STORE_CONTEXTS):
                text = chain_text(node)
                if text:
                    stores.add(text)
        scope.stores = stores
    return scope.stores


def stable_root(scope, root):
    sites = scope.sites.get(root, [])
    return len(sites) == 1 and (root == scope.self_name or sites[0].kind == "param")


def alias_source(scope, name):
    sites = scope.sites.get(name, [])
    if len(sites) != 1 or sites[0].kind != "assign" or name in scope.imports:
        return None
    found = chain(sites[0].value)
    if found is None or not stable_root(scope, found[0]):
        return None
    text = chain_text(sites[0].value)
    clash = any(t.startswith(text) or text.startswith(t) for t in stores_of(scope))
    return None if clash else found


def canonical_root(scope, root, attributes):
    for _ in range(MAX_ALIAS_DEPTH):
        source = alias_source(scope, root)
        if source is None:
            break
        root, attributes = source[0], [*source[1], *attributes]
    return root, attributes


def receiver_key(scope, node):
    if is_super_call(node):
        return "self" if scope.self_name else None
    found = chain(node)
    if found is None:
        return None
    root, attributes = canonical_root(scope, *found)
    if root in scope.sites:
        root = "self" if root == scope.self_name and scope.is_single(root) else root
    else:
        value = name_value(scope, root)
        if value is None or value[0] != "inst":
            return None
    return ".".join([root, *attributes])


def access_resolution(scope, node):
    key = ("access", id(node))
    if key not in scope.values:
        scope.values[key] = compute_access(scope, node)
    return scope.values[key]


def compute_access(scope, node):
    base = evaluate(scope, node.value)
    if base is None or base[0] != "inst" or not isinstance(base[1], Klass):
        return None
    found = find_member(scope.index, base[1], node.attr)
    if found is None or found[0] is None or not found[0].is_property:
        return None
    return Resolution(found[0], node.value)
