import ast

from checks.common import dotted_name
from contracts.infrastructure import PERSISTENCE, TRANSPORT, kind_of

ROUTE_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "route",
    "api_route",
    "websocket",
    "websocket_route",
}
FRAMEWORK_ROOTS = set(PERSISTENCE) | set(TRANSPORT) | {"ninja"}
REPOSITORY_SUFFIXES = ("Repository", "Repo")
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def is_public(name):
    return not name.startswith("_")


def root_of(node, context):
    return (dotted_name(node, context.aliases) or "").split(".")[0]


def is_route_decorator(decorator, context):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    if isinstance(target, ast.Attribute) and target.attr in ROUTE_METHODS:
        return True
    return root_of(target, context) in FRAMEWORK_ROOTS


def is_route_handler(function, context):
    return any(is_route_decorator(d, context) for d in function.decorator_list)


def first_parameter(function, method):
    arguments = function.args.posonlyargs + function.args.args
    return arguments[1 if method else 0] if len(arguments) > int(method) else None


def takes_request_first(function, context, method):
    first = first_parameter(function, method)
    if first is None or first.annotation is None:
        return False
    return kind_of(dotted_name(first.annotation, context.aliases)) == "transport"


def is_framework_class(node, context):
    return any(root_of(base, context) in FRAMEWORK_ROOTS for base in node.bases)


def is_contract_class(node, context):
    return (
        is_public(node.name)
        and not node.name.endswith(REPOSITORY_SUFFIXES)
        and not is_framework_class(node, context)
    )


def class_members(node, context, label):
    for statement in node.body:
        if isinstance(statement, FUNCTIONS) and is_public(statement.name):
            yield f"{label}.{statement.name}", statement, True
        elif isinstance(statement, ast.ClassDef) and is_contract_class(
            statement, context
        ):
            yield from class_members(statement, context, f"{label}.{statement.name}")


def definition_members(node, context, label):
    if isinstance(node, FUNCTIONS):
        yield label, node, False
    elif isinstance(node, ast.ClassDef) and is_contract_class(node, context):
        yield from class_members(node, context, label)
