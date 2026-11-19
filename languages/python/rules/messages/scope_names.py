import ast

from checks.common import own_nodes, parameter_names
from security.resolve.scopes import FUNCTIONS, scope_of


def defined_in(nodes):
    names = set()
    for node in nodes:
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names.update(
                (item.asname or item.name).split(".")[0] for item in node.names
            )
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
    return names


def module_names(context):
    key = ("message-module-names", context.path)
    return context.project.memo(key, lambda _: defined_in(own_nodes(context.tree)))


def function_names(scope, context):
    key = ("message-function-names", context.path, id(scope))
    build = lambda _: parameter_names(scope) | defined_in(ast.walk(scope))
    return context.project.memo(key, build)


def bound_names(node, context):
    names = set(module_names(context))
    scope = scope_of(node, context)
    while scope is not None:
        if isinstance(scope, FUNCTIONS):
            names |= function_names(scope, context)
        scope = scope_of(scope, context)
    return names
