import ast

from checks.common import dotted_name, finding, functions_of, own_nodes
from waits.pending import is_owned

RULE = "timeout-abandons-operation"
WAIT = "asyncio.wait"
WAIT_FOR = "asyncio.wait_for"
SHIELD = "asyncio.shield"
DROPPED = "dropped"
HANDED_OFF = "handed-off"
KEEPS_RUNNING = "ALL_COMPLETED"


def imported_name(node, context):
    root = node
    while isinstance(root, ast.Attribute):
        root = root.value
    names, modules = context.aliases[:2]
    if not isinstance(root, ast.Name) or root.id not in {**names, **modules}:
        return None
    return dotted_name(node, context.aliases)


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def ends_with_all_completed(node):
    name = node.attr if isinstance(node, ast.Attribute) else getattr(node, "id", "")
    return name == KEEPS_RUNNING


def returns_early(call):
    if any(item.arg is None for item in call.keywords):
        return False
    for item in call.keywords:
        if item.arg == "timeout" and not is_none(item.value):
            return True
        if item.arg == "return_when" and not ends_with_all_completed(item.value):
            return True
    return False


def pending_of(call, context):
    awaited = context.parents.get(id(call))
    holder = (
        context.parents.get(id(awaited)) if isinstance(awaited, ast.Await) else None
    )
    if isinstance(holder, ast.Expr):
        return DROPPED
    if not (isinstance(holder, ast.Assign) and len(holder.targets) == 1):
        return HANDED_OFF
    target = holder.targets[0]
    if not isinstance(target, (ast.Tuple, ast.List)) or len(target.elts) != 2:
        return HANDED_OFF
    second = target.elts[1]
    if isinstance(second, ast.Name):
        return DROPPED if second.id == "_" else second.id
    return DROPPED if isinstance(second, ast.Starred) else HANDED_OFF


def abandoned_wait(call, function, context):
    if imported_name(call.func, context) != WAIT or not returns_early(call):
        return None
    pending = pending_of(call, context)
    if pending == HANDED_OFF:
        return None
    if pending != DROPPED and is_owned(pending, function, context):
        return None
    return WAIT


def shielded_name(call, context):
    if imported_name(call.func, context) != WAIT_FOR or not call.args:
        return None
    shield = call.args[0]
    if not isinstance(shield, ast.Call) or not shield.args:
        return None
    if imported_name(shield.func, context) != SHIELD:
        return None
    return shield


def created_in(name, function):
    return any(
        isinstance(node, ast.Assign)
        and isinstance(node.value, ast.Call)
        and any(
            isinstance(target, ast.Name) and target.id == name
            for target in node.targets
        )
        for node in own_nodes(function)
    )


def abandoned_shield(call, function, context):
    shield = shielded_name(call, context)
    if shield is None:
        return None
    inner = shield.args[0]
    if isinstance(inner, ast.Name):
        if not created_in(inner.id, function):
            return None
        if is_owned(inner.id, function, context, ignore=(inner,)):
            return None
        return f"{WAIT_FOR}({SHIELD}({inner.id}))"
    if isinstance(inner, ast.Call):
        return f"{WAIT_FOR}({SHIELD}(...))"
    return None


def check(context):
    found = []
    for function in functions_of(context.tree):
        for node in own_nodes(function):
            if not isinstance(node, ast.Call):
                continue
            subject = abandoned_wait(node, function, context) or abandoned_shield(
                node, function, context
            )
            if subject is not None:
                found.append(finding(context.path, RULE, subject, node))
    return found
