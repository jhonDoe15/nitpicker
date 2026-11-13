import ast

from checks.common import dotted_name, finding, functions_of, own_nodes
from security.support import exempt

RULE = "future-without-exception"
FACTORIES = {"asyncio.Future", "concurrent.futures.Future"}
FAILING = {"set_exception", "cancel"}
WAITERS = {
    "asyncio.wait_for",
    "asyncio.shield",
    "asyncio.wait",
    "asyncio.gather",
    "asyncio.wrap_future",
    "asyncio.as_completed",
}
STORING = (ast.Tuple, ast.List, ast.Set, ast.Dict, ast.Starred, ast.keyword)


def is_factory(node, context):
    if not isinstance(node, ast.Call):
        return False
    if isinstance(node.func, ast.Attribute) and node.func.attr == "create_future":
        return True
    return dotted_name(node.func, context.aliases) in FACTORIES


def created_futures(function, context):
    for node in own_nodes(function):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target, value = node.targets[0], node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            target, value = node.target, node.value
        else:
            continue
        if isinstance(target, ast.Name) and is_factory(value, context):
            yield target.id, node


def loads(function, name):
    return [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Load)
    ]


def method_use(attribute, nested, context):
    if attribute.attr in FAILING:
        return "fails"
    if attribute.attr != "set_result":
        return "neutral"
    parent = context.parents.get(id(attribute))
    called = isinstance(parent, ast.Call) and parent.func is attribute
    return "callback" if nested or not called else "neutral"


def argument_use(call, context):
    if dotted_name(call.func, context.aliases) in WAITERS:
        return "neutral"
    return "handed"


def use_of(ref, own, context):
    parent = context.parents.get(id(ref))
    if isinstance(parent, ast.Attribute):
        return method_use(parent, id(ref) not in own, context)
    if isinstance(parent, ast.Call) and parent.func is not ref:
        return argument_use(parent, context)
    if isinstance(parent, (ast.Assign, ast.AnnAssign, ast.NamedExpr) + STORING):
        return "handed"
    return "neutral"


def never_fails(name, function, context):
    own = {id(node) for node in own_nodes(function)}
    uses = {use_of(ref, own, context) for ref in loads(function, name)}
    return "callback" in uses and not uses & {"fails", "handed"}


def check(context):
    if exempt(context):
        return []
    found = []
    for function in functions_of(context.tree):
        for name, node in created_futures(function, context):
            if never_fails(name, function, context):
                found.append(finding(context.path, RULE, name, node))
    return found
