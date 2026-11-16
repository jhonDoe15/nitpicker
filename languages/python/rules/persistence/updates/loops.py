import ast

from checks.common import last_name

LOADS = ast.Load
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def attribute_target(statement, element):
    if not isinstance(statement, ast.Assign) or len(statement.targets) != 1:
        return None
    target = statement.targets[0]
    owner = isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name)
    return target.attr if owner and target.value.id == element else None


def mentions(node, name):
    return any(
        isinstance(item, ast.Name) and item.id == name for item in ast.walk(node)
    )


def is_fixed(value, element):
    allowed = (ast.Constant, ast.Name, ast.Attribute, ast.expr_context)
    return all(isinstance(node, allowed) for node in ast.walk(value)) and not mentions(
        value, element
    )


def fixed_assignments(loop):
    if (
        not isinstance(loop, ast.For)
        or not isinstance(loop.target, ast.Name)
        or loop.orelse
    ):
        return None
    element, fields = loop.target.id, []
    for statement in loop.body:
        field = attribute_target(statement, element)
        if field is None or not is_fixed(statement.value, element):
            return None
        fields.append(field)
    return fields or None


def stores(function, name):
    return [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Name)
        and node.id == name
        and not isinstance(node.ctx, LOADS)
    ]


def reads(function, name):
    return [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, LOADS)
    ]


def assignment_of(function, name):
    found = [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id == name
    ]
    return (
        found[0].value if len(found) == 1 and len(stores(function, name)) == 1 else None
    )


def calls_after(statements):
    return [
        node
        for statement in statements
        for node in ast.walk(statement)
        if isinstance(node, ast.Call)
    ]


def saves_back(calls, name):
    for call in calls:
        method = last_name(call.func)
        first = call.args[0] if call.args else None
        if (
            method in {"bulk_update", "bulk_save_objects"}
            and isinstance(first, ast.Name)
            and first.id == name
        ):
            return call
    return None


def commits(calls):
    return next(
        (
            call
            for call in calls
            if last_name(call.func) in {"commit", "flush"}
            and isinstance(call.func, ast.Attribute)
            and not call.args
        ),
        None,
    )
