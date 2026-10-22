import ast

from checks.common import dotted_name, own_nodes
from concurrency.remote import LIMITER_FACTORIES, is_self, remote_of, text_of

DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
MAX_DEPTH = 3


def label_of(call):
    text = text_of(call.func)
    return f"{text}()" if len(text) <= 60 else "a call"


def definitions_in(scope_node, name):
    return [
        node
        for node in own_nodes(scope_node)
        if isinstance(node, DEFINITIONS) and node.name == name
    ]


def enclosing(node, parents, kinds):
    while id(node) in parents:
        node = parents[id(node)]
        if isinstance(node, kinds):
            return node
    return None


def local_function(name, anchor, context):
    scope_node = anchor
    while id(scope_node) in context.parents:
        scope_node = context.parents[id(scope_node)]
        if isinstance(scope_node, DEFINITIONS + (ast.Module,)):
            found = definitions_in(scope_node, name)
            if len(found) == 1:
                return context, found[0]
    return None


def method_function(name, anchor, context):
    owner = enclosing(anchor, context.parents, (ast.ClassDef,))
    found = (
        [n for n in owner.body if isinstance(n, DEFINITIONS) and n.name == name]
        if owner
        else []
    )
    return (context, found[0]) if len(found) == 1 else None


def imported_function(func, context):
    name = dotted_name(func, context.aliases) or ""
    located = context.project.locate(name) if "." in name else None
    target = context.project.contexts.get(located[0]) if located else None
    if target is None or target.tests:
        return None
    found = definitions_in(target.tree, located[1])
    return (target, found[0]) if len(found) == 1 else None


def resolve_callee(call, anchor, context):
    func = call.func
    if isinstance(func, ast.Name):
        return local_function(func.id, anchor, context) or imported_function(
            func, context
        )
    if isinstance(func, ast.Attribute) and is_self(func.value):
        return method_function(func.attr, anchor, context)
    if isinstance(func, ast.Attribute):
        return imported_function(func, context)
    return None


def parameters_of(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    return {a.arg for a in every}


def assigned_inside(name, function):
    return any(
        isinstance(n, ast.Name) and n.id == name and isinstance(n.ctx, ast.Store)
        for n in own_nodes(function)
    )


def is_limiter(expr, function, context):
    scope = remote_of(context)
    if isinstance(expr, ast.Name):
        if expr.id in parameters_of(function):
            return True
        unknown = expr.id in context.aliases[0] and expr.id not in scope.names
        if unknown:
            return True
        if assigned_inside(expr.id, function):
            return False
    if not isinstance(expr, (ast.Name, ast.Attribute)):
        return False
    found = scope.origin(expr)
    return found is not None and found.factory in LIMITER_FACTORIES


def acquires(function, context):
    return any(
        isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == "acquire"
        and is_limiter(n.func.value, function, context)
        for n in own_nodes(function)
    )


def under_limiter(node, function, context):
    current = node
    while id(current) in context.parents and current is not function:
        current = context.parents[id(current)]
        if isinstance(current, (ast.With, ast.AsyncWith)) and any(
            is_limiter(item.context_expr, function, context) for item in current.items
        ):
            return True
    return False


def reach(function, context, seen=None, depth=0):
    seen = set() if seen is None else seen
    if id(function) in seen or acquires(function, context):
        return None
    seen.add(id(function))
    scope = remote_of(context)
    for node in own_nodes(function):
        if not isinstance(node, ast.Call) or under_limiter(node, function, context):
            continue
        kind = scope.kind(node)
        if kind:
            return kind, label_of(node)
        target = resolve_callee(node, node, context) if depth < MAX_DEPTH else None
        found = reach(target[1], target[0], seen, depth + 1) if target else None
        if found:
            return found
    return None
