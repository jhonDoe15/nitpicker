import ast

from checks.common import own_nodes

STATIC = "staticmethod"
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def root_name(node):
    while isinstance(node, (ast.Attribute, ast.Subscript)):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def parameter_names(function):
    arguments = function.args
    names = {
        argument.arg
        for argument in arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    }
    names.update(a.arg for a in (arguments.vararg, arguments.kwarg) if a)
    return names


def stored_names(function):
    names = set()
    for node in own_nodes(function):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, DEFINITIONS):
            names.add(node.name)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names.update((a.asname or a.name).split(".")[0] for a in node.names)
    return names


def declared_names(function, kind):
    return {
        name
        for node in own_nodes(function)
        if isinstance(node, kind)
        for name in node.names
    }


def is_static(function):
    return any(
        isinstance(decorator, ast.Name) and decorator.id == STATIC
        for decorator in function.decorator_list
    )


def receiver_names(function, parents):
    names = set()
    node = function
    while node is not None:
        owner = parents.get(id(node))
        if (
            isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and isinstance(owner, ast.ClassDef)
            and not is_static(node)
            and node.args.posonlyargs + node.args.args
        ):
            names.add((node.args.posonlyargs + node.args.args)[0].arg)
        node = owner
    return names


class Scope:
    def __init__(self, context, function, module):
        self.receivers = receiver_names(function, context.parents)
        self.global_names = declared_names(function, ast.Global)
        self.closure_names = declared_names(function, ast.Nonlocal)
        declared = self.global_names | self.closure_names
        self.locals = (parameter_names(function) | stored_names(function)) - declared
        self.module = module

    def is_shared_name(self, name):
        if name in self.global_names or name in self.closure_names:
            return True
        if name in self.receivers:
            return True
        return name not in self.locals and name in self.module

    def is_shared_location(self, node):
        root = root_name(node)
        if root is None:
            return False
        if isinstance(node, ast.Name):
            return node.id in self.global_names or node.id in self.closure_names
        return self.is_shared_name(root)
