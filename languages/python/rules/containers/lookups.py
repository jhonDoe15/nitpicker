import ast

from checks.common import finding
from checks.loop_scope import ancestors
from containers.scope import (
    changes_in_place,
    contains,
    enclosing_function,
    is_name,
    is_self_field,
    name_stores,
    repeating_scopes,
    store_targets,
)

RULE = "linear-lookup-in-loop"
LOOKUPS = {"next", "any"}


def key_path(node, target):
    if isinstance(node, ast.Attribute):
        inner = key_path(node.value, target)
        return None if inner is None else f"{inner}.{node.attr}"
    if isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Constant):
        inner = key_path(node.value, target)
        return None if inner is None else f"{inner}[{node.slice.value!r}]"
    if isinstance(node, ast.Name) and node.id == target:
        return node.id
    return None


def mentions(node, name):
    return any(isinstance(n, ast.Name) and n.id == name for n in ast.walk(node))


def compared_key(test, target):
    if not (
        isinstance(test, ast.Compare)
        and len(test.ops) == 1
        and isinstance(test.ops[0], ast.Eq)
    ):
        return None
    sides = [test.left, test.comparators[0]]
    for key, other in (sides, sides[::-1]):
        path = key_path(key, target)
        if (
            path is not None
            and path != target
            and not mentions(other, target)
            and not isinstance(other, ast.Constant)
        ):
            return path[len(target) :]
    return None


def lookup_of(call):
    if not (
        isinstance(call.func, ast.Name)
        and call.func.id in LOOKUPS
        and call.args
        and isinstance(call.args[0], ast.GeneratorExp)
    ):
        return None
    generator = call.args[0]
    [loop, *rest] = generator.generators
    if rest or not isinstance(loop.target, ast.Name):
        return None
    target = loop.target.id
    if call.func.id == "next" and len(loop.ifs) == 1:
        test = loop.ifs[0]
    elif call.func.id == "any" and not loop.ifs:
        test = generator.elt
    else:
        return None
    key = compared_key(test, target)
    return None if key is None else (loop.iter, key)


def self_field_is_fixed(receiver, parents):
    owner = next(
        (n for n in ancestors(receiver, parents) if isinstance(n, ast.ClassDef)), None
    )
    if owner is None:
        return False
    field = is_self_field(receiver.attr)
    for method in owner.body:
        if not isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        assigned = any(
            isinstance(node, (ast.Assign, ast.AnnAssign))
            and any(field(target) for target in store_targets(node))
            for node in ast.walk(method)
        )
        if (assigned and method.name != "__init__") or changes_in_place(method, field):
            return False
    return True


def fixed_binding(receiver, call, parents):
    function = enclosing_function(call, parents)
    if function is None:
        return None
    if isinstance(receiver, ast.Attribute) and is_self_field(receiver.attr)(receiver):
        return function if self_field_is_fixed(receiver, parents) else None
    if not isinstance(receiver, ast.Name):
        return None
    stores = name_stores(function, receiver.id)
    if len(stores) > 1 or changes_in_place(function, is_name(receiver.id)):
        return None
    return stores[0] if stores else function.args


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        lookup = isinstance(node, ast.Call) and lookup_of(node)
        if not lookup:
            continue
        receiver, key = lookup
        binding = fixed_binding(receiver, node, context.parents)
        if binding is None:
            continue
        if any(
            not contains(scope, binding)
            for scope in repeating_scopes(node, context.parents)
        ):
            subject = f"{ast.unparse(receiver)}:{key}"
            found.append(finding(context.path, RULE, subject, node))
    return found
