import ast

from checks.common import has_decorator, own_nodes, parameter_names, root_name

STATIC = "staticmethod"
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


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


def receivers_of(function, parents):
    found = {}
    node = function
    while node is not None:
        owner = parents.get(id(node))
        if (
            isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and isinstance(owner, ast.ClassDef)
            and not has_decorator(node, STATIC)
            and node.args.posonlyargs + node.args.args
        ):
            found.setdefault((node.args.posonlyargs + node.args.args)[0].arg, owner)
        node = owner
    return found


class Scope:
    def __init__(self, context, function, module):
        self.receivers = set(receivers_of(function, context.parents))
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
