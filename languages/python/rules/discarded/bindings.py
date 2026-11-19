import ast

from checks.common import own_nodes
from security.resolve.scopes import FUNCTIONS

ASSIGNMENTS = (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.NamedExpr)
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def targets_of(node):
    if isinstance(node, ast.Assign):
        return node.targets
    return [node.target] if isinstance(node, ASSIGNMENTS) else []


def other_binding(node, name):
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        return any(
            (item.asname or item.name).split(".")[0] == name for item in node.names
        )
    if isinstance(node, (ast.Global, ast.Nonlocal)):
        return name in node.names
    if isinstance(node, ast.ExceptHandler):
        return node.name == name
    return isinstance(node, DEFINITIONS) and node.name == name


def is_store(node, name):
    return (
        isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Store)
    )


def assigned_parts(name, scope, context):
    values, annotations, direct, stores = [], [], 0, 0
    for node in own_nodes(scope if scope is not None else context.tree):
        if other_binding(node, name):
            return None
        stores += is_store(node, name)
        for target in targets_of(node):
            if is_store(target, name):
                direct += 1
                values.append(getattr(node, "value", None))
                if isinstance(node, ast.AnnAssign):
                    annotations.append(node.annotation)
    return (values, annotations) if direct == stores else None


def parameter_of(name, scope):
    arguments = scope.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    every += [argument for argument in (arguments.vararg, arguments.kwarg) if argument]
    return next((argument for argument in every if argument.arg == name), None)


def evidence_in(name, scope, context):
    if isinstance(scope, ast.Lambda):
        return None
    parameter = parameter_of(name, scope) if isinstance(scope, FUNCTIONS) else None
    parts = assigned_parts(name, scope, context)
    if parts is None:
        return None
    values, annotations = parts
    if parameter is not None:
        annotations = [*annotations, parameter.annotation]
    return (values, annotations) if values or annotations else ()
