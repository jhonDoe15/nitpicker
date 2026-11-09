import ast

from checks.common import own_nodes
from checks.loop_scope import COMPREHENSIONS, FUNCTIONS, ancestors

LOOPS = (ast.For, ast.AsyncFor, ast.While)
ITERATING_CALLS = {"map", "filter", "sorted", "min", "max", "any", "all", "sum"}
CHANGING_METHODS = {
    "append",
    "extend",
    "insert",
    "pop",
    "remove",
    "clear",
    "sort",
    "reverse",
}


def is_iterating_lambda(function, parents):
    call = parents.get(id(function))
    if isinstance(call, ast.keyword):
        call = parents.get(id(call))
    return (
        isinstance(function, ast.Lambda)
        and isinstance(call, ast.Call)
        and isinstance(call.func, ast.Name)
        and call.func.id in ITERATING_CALLS
    )


def repeating_scopes(node, parents):
    chain = ancestors(node, parents)
    for child, parent in zip(chain, chain[1:]):
        if is_iterating_lambda(parent, parents):
            yield parent
            continue
        if isinstance(parent, FUNCTIONS):
            return
        if isinstance(parent, LOOPS) and child in parent.body:
            yield parent
        if isinstance(parent, ast.While) and child is parent.test:
            yield parent
        if (
            isinstance(parent, COMPREHENSIONS)
            and child is not parent.generators[0].iter
        ):
            yield parent


def contains(outer, inner):
    return any(node is inner for node in ast.walk(outer))


def name_stores(function, name):
    return [
        node
        for node in own_nodes(function)
        if isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, (ast.Store, ast.Del))
    ]


def method_calls(root, is_receiver):
    for node in ast.walk(root):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and is_receiver(node.func.value)
        ):
            yield node.func.attr, node


def is_name(name):
    return lambda node: isinstance(node, ast.Name) and node.id == name


def is_self_field(field):
    return lambda node: (
        isinstance(node, ast.Attribute)
        and node.attr == field
        and isinstance(node.value, ast.Name)
        and node.value.id == "self"
    )


def enclosing_function(node, parents):
    for parent in ancestors(node, parents)[1:]:
        if isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return parent
    return None


def parameter_names(function):
    arguments = function.args
    every = [
        *arguments.posonlyargs,
        *arguments.args,
        *arguments.kwonlyargs,
        arguments.vararg,
        arguments.kwarg,
    ]
    return {argument.arg for argument in every if argument is not None}


def binds_locally(function, name):
    return name in parameter_names(function) or bool(name_stores(function, name))


def store_targets(node):
    if isinstance(node, (ast.Assign, ast.Delete)):
        return node.targets
    if isinstance(node, (ast.AugAssign, ast.AnnAssign)):
        return [node.target]
    return []


def changes_in_place(root, is_receiver):
    for node in ast.walk(root):
        for target in store_targets(node):
            if isinstance(target, ast.Subscript) and is_receiver(target.value):
                return True
            if isinstance(node, ast.AugAssign) and is_receiver(target):
                return True
    return any(name in CHANGING_METHODS for name, _ in method_calls(root, is_receiver))
