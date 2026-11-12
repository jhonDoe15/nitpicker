import ast

from checks.common import dotted_name, own_nodes
from environment.purity_names import (
    PATH_DERIVERS,
    PATH_FACTORIES,
    PATH_METHODS,
    PATH_PARTS,
)

SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
NAME_PASSES = 3


class PathNames:
    def __init__(self, aliases, names=frozenset()):
        self.aliases = aliases
        self.names = set(names)

    def builds(self, node):
        if isinstance(node, ast.Name):
            return node.id in self.names
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in PATH_DERIVERS and self.builds(node.func.value):
                return True
        if isinstance(node, ast.Call):
            return dotted_name(node.func, self.aliases) in PATH_FACTORIES
        if isinstance(node, ast.Attribute) and node.attr in PATH_PARTS:
            return self.builds(node.value)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            return self.builds(node.left)
        return False

    def collect(self, scope):
        assignments = [
            node
            for node in own_nodes(scope)
            if isinstance(node, (ast.Assign, ast.AnnAssign)) and node.value is not None
        ]
        for _ in range(NAME_PASSES):
            self.names.update(
                name
                for node in assignments
                if self.builds(node.value)
                for name in assigned_names(node)
            )
        self.names.update(annotated_parameters(scope))
        return self


def assigned_names(node):
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    return [target.id for target in targets if isinstance(target, ast.Name)]


def parameters(scope):
    arguments = getattr(scope, "args", None)
    if arguments is None:
        return []
    return arguments.posonlyargs + arguments.args + arguments.kwonlyargs


def annotated_parameters(scope):
    return [
        argument.arg
        for argument in parameters(scope)
        if argument.annotation and "Path" in ast.dump(argument.annotation)
    ]


def scope_path_calls(scope, names):
    for node in own_nodes(scope):
        is_method = isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
        if (
            is_method
            and node.func.attr in PATH_METHODS
            and names.builds(node.func.value)
        ):
            yield node, f"Path.{node.func.attr}"


def path_method_calls(context):
    module = PathNames(context.aliases).collect(context.tree)
    yield from scope_path_calls(context.tree, module)
    for scope in ast.walk(context.tree):
        if isinstance(scope, SCOPES):
            inherited = module.names - {argument.arg for argument in parameters(scope)}
            names = PathNames(context.aliases, inherited).collect(scope)
            yield from scope_path_calls(scope, names)
