import ast
import re
from collections import namedtuple

from checks.common import dotted_name, own_nodes
from concurrency.remote import is_self, remote_of, text_of
from index.clients import LIMITER_FACTORIES

DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
MAX_DEPTH = 3
LIMITER_NAME = re.compile(
    r"(?:sem|semaphore|limit|limiter|throttle|throttler|capacity|gate)$", re.IGNORECASE
)


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
    return {a.arg: a for a in every}


def assigned_inside(name, function):
    return any(
        isinstance(n, ast.Name) and n.id == name and isinstance(n.ctx, ast.Store)
        for n in own_nodes(function)
    )


Caller = namedtuple("Caller", "argument context function bindings")


def bindings_of(call, function, caller):
    if function is None:
        return {}
    arguments = function.args
    positional = [a.arg for a in arguments.posonlyargs + arguments.args]
    if isinstance(call.func, ast.Attribute) and positional[:1] in (["self"], ["cls"]):
        positional = positional[1:]
    bound = {}
    for name, value in zip(positional, call.args):
        if not isinstance(value, ast.Starred):
            bound[name] = caller._replace(argument=value)
    for keyword in call.keywords:
        if keyword.arg is not None:
            bound[keyword.arg] = caller._replace(argument=keyword.value)
    return bound


def limiter_name(name):
    return LIMITER_NAME.search(name) is not None


def parameter_limiter(name, function, context, bindings):
    annotation = parameters_of(function)[name].annotation
    if annotation is not None:
        return dotted_name(annotation, context.aliases) in LIMITER_FACTORIES
    caller = bindings.get(name)
    if caller is None:
        return limiter_name(name)
    return is_limiter(
        caller.argument,
        caller.function,
        caller.context,
        caller.bindings,
        worker=False,
    )


def imported_limiter(expr, context):
    located = context.project.locate(dotted_name(expr, context.aliases) or "")
    target = context.project.contexts.get(located[0]) if located else None
    if target is None:
        return limiter_name(expr.id)
    found = remote_of(target).origin(ast.Name(id=located[1]))
    return found is not None and found.factory in LIMITER_FACTORIES


def local_limiter(name, function, scope):
    values = [
        node.value
        for node in own_nodes(function)
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == name for t in node.targets)
    ]
    found = [scope.origin(value) for value in values]
    return bool(found) and all(
        o is not None and o.factory in LIMITER_FACTORIES for o in found
    )


def is_limiter(expr, function, context, bindings, worker=True):
    scope = remote_of(context)
    if isinstance(expr, ast.Name):
        if function is not None and expr.id in parameters_of(function):
            return parameter_limiter(expr.id, function, context, bindings)
        if expr.id in context.aliases[0] and expr.id not in scope.names:
            return imported_limiter(expr, context)
        if function is not None and assigned_inside(expr.id, function):
            return not worker and local_limiter(expr.id, function, scope)
    if not isinstance(expr, (ast.Name, ast.Attribute)):
        return False
    found = scope.origin(expr)
    return found is not None and found.factory in LIMITER_FACTORIES


def acquires(function, context, bindings):
    return any(
        isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == "acquire"
        and is_limiter(n.func.value, function, context, bindings)
        for n in own_nodes(function)
    )


def under_limiter(node, function, context, bindings):
    current = node
    while id(current) in context.parents and current is not function:
        current = context.parents[id(current)]
        if isinstance(current, (ast.With, ast.AsyncWith)) and any(
            is_limiter(item.context_expr, function, context, bindings)
            for item in current.items
        ):
            return True
    return False


def reach(function, context, bindings, seen=None, depth=0):
    seen = set() if seen is None else seen
    if id(function) in seen or acquires(function, context, bindings):
        return None
    seen.add(id(function))
    scope = remote_of(context)
    for node in own_nodes(function):
        if not isinstance(node, ast.Call) or under_limiter(
            node, function, context, bindings
        ):
            continue
        kind = scope.kind(node)
        if kind:
            return kind, label_of(node)
        target = resolve_callee(node, node, context) if depth < MAX_DEPTH else None
        if target is None:
            continue
        caller = Caller(None, context, function, bindings)
        inner = bindings_of(node, target[1], caller)
        found = reach(target[1], target[0], inner, seen, depth + 1)
        if found:
            return found
    return None
