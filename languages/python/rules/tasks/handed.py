import ast

from checks.common import dotted_name

PARTIAL = "functools.partial"


def loaded_names(node, skip=()):
    return {
        part.id
        for part in ast.walk(node)
        if isinstance(part, ast.Name)
        and isinstance(part.ctx, ast.Load)
        and part.id not in skip
    }


def lambda_names(node):
    arguments = node.args
    own = {
        argument.arg
        for argument in arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    }
    own.update(a.arg for a in (arguments.vararg, arguments.kwarg) if a)
    return loaded_names(node.body, own)


def callable_names(node, closures, aliases):
    if isinstance(node, ast.Name):
        return closures.get(node.id, set())
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        return {node.value.id}
    if isinstance(node, ast.Lambda):
        return lambda_names(node)
    if isinstance(node, ast.Call) and dotted_name(node.func, aliases) == PARTIAL:
        values = node.args[1:] + [keyword.value for keyword in node.keywords]
        return {value.id for value in values if isinstance(value, ast.Name)}
    return set()


def direct_names(values):
    return {value.id for value in values if isinstance(value, ast.Name)}


def spawn_handed(call, closures, aliases):
    method = call.func.attr
    if not call.args:
        return set()
    first = call.args[0]
    if method == "create_task":
        return coroutine_handed(first)
    return callable_names(first, closures, aliases) | direct_names(call.args[1:])


def coroutine_handed(node):
    if not isinstance(node, ast.Call):
        return set()
    names = direct_names(node.args) | direct_names(
        keyword.value for keyword in node.keywords
    )
    if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
        names.add(node.func.value.id)
    return names
