import ast
from collections import namedtuple

from checks.common import dotted_name
from index.clients import (
    ANY_METHOD,
    BOTO_FACTORIES,
    BOTO_SERVICES,
    CLIENTS,
    DATABASE,
    DIRECT_CALLS,
    LIMITER_FACTORIES,
    REMOTE,
)

Origin = namedtuple("Origin", "factory call")
NON_OPERATIONS = ("get_paginator", "get_waiter", "can_paginate", "close", "generate_")
ANNOTATED = "annotation"
MAX_DEPTH = 6


TASK_CALLS = {"asyncio.create_task", "asyncio.ensure_future"}


def is_task_call(node, aliases):
    return isinstance(node, ast.Call) and (
        dotted_name(node.func, aliases) in TASK_CALLS
        or (isinstance(node.func, ast.Attribute) and node.func.attr == "create_task")
    )


def is_self(node):
    return isinstance(node, ast.Name) and node.id in {"self", "cls"}


def text_of(node):
    return ast.unparse(node)


def bound_values(tree):
    names, attributes = {}, {}
    for node in ast.walk(tree):
        pairs = []
        if isinstance(node, ast.Assign):
            pairs = [(t, node.value) for t in node.targets]
        elif isinstance(node, ast.AnnAssign):
            pairs = [(node.target, node.value or (ANNOTATED, node.annotation))]
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            pairs = [(i.optional_vars, i.context_expr) for i in node.items]
        elif isinstance(node, ast.NamedExpr):
            pairs = [(node.target, node.value)]
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            pairs = [
                (ast.Name(id=a.arg), (ANNOTATED, a.annotation))
                for a in node.args.posonlyargs + node.args.args + node.args.kwonlyargs
                if a.annotation is not None
            ]
        for target, value in pairs:
            if isinstance(target, ast.Name):
                names.setdefault(target.id, []).append(value)
            elif isinstance(target, ast.Attribute) and is_self(target.value):
                attributes.setdefault(target.attr, []).append(value)
    return names, attributes


GROWING_METHODS = {"append", "extend", "add", "insert", "update", "setdefault"}


def grown_names(tree):
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
            found.add(node.target.id)
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in GROWING_METHODS
            and isinstance(node.func.value, ast.Name)
        ):
            found.add(node.func.value.id)
    return found


class Remote:
    def __init__(self, context):
        self.context = context
        self.aliases = context.aliases
        self.names, self.attributes = bound_values(context.tree)
        self.grown = grown_names(context.tree)

    def factory_of(self, call):
        name = dotted_name(call.func, self.aliases)
        return name if name in CLIENTS or name in LIMITER_FACTORIES else None

    def origin(self, node, depth=0, deep=False):
        if depth > MAX_DEPTH:
            return None
        if isinstance(node, ast.Await):
            return self.origin(node.value, depth + 1, deep)
        if isinstance(node, tuple):
            name = dotted_name(node[1], self.aliases)
            known = name in CLIENTS or name in LIMITER_FACTORIES
            return Origin(name, None) if known else None
        if isinstance(node, ast.Call):
            factory = self.factory_of(node)
            if factory:
                return Origin(factory, node)
            if isinstance(node.func, ast.Attribute):
                return self.origin(node.func.value, depth + 1, deep)
            return None
        if isinstance(node, ast.Name):
            return self.single(self.names.get(node.id, []), depth)
        if isinstance(node, ast.Attribute):
            if is_self(node.value):
                return self.single(self.attributes.get(node.attr, []), depth)
            return self.origin(node.value, depth + 1, deep) if deep else None
        return None

    def single(self, values, depth):
        found = [self.origin(value, depth + 1) for value in values]
        factories = {o.factory if o else None for o in found}
        return found[0] if len(factories) == 1 and None not in factories else None

    def client_call(self, call):
        func = call.func
        if not isinstance(func, ast.Attribute):
            return None
        receiver = func.value
        found = self.origin(receiver, deep=True)
        if found is None or found.factory not in CLIENTS:
            return None
        kind, methods, deep = CLIENTS[found.factory]
        if receiver_depth(receiver) and not deep:
            return None
        if found.factory in BOTO_FACTORIES:
            return boto_kind(found.call, func.attr)
        if methods is ANY_METHOD:
            allowed = not func.attr.startswith(NON_OPERATIONS) and func.attr[0] != "_"
        else:
            allowed = func.attr in methods
        return kind if allowed else None

    def kind(self, call):
        direct = DIRECT_CALLS.get(dotted_name(call.func, self.aliases))
        return direct or self.client_call(call)


def receiver_depth(receiver):
    return isinstance(receiver, ast.Attribute) and not is_self(receiver.value)


def boto_kind(call, method):
    service = call.args[0] if call is not None and call.args else None
    name = service.value if isinstance(service, ast.Constant) else None
    default, methods = BOTO_SERVICES.get(name, (REMOTE, {}))
    if default == DATABASE or method.startswith(NON_OPERATIONS) or method[0] == "_":
        return None
    return methods.get(method, default)




def remote_of(context):
    return context.project.memo((REMOTE, context.path), lambda _: Remote(context))
