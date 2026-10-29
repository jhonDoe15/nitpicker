import ast

from checks.common import dotted_name, own_nodes, type_text

DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
SCOPES = DEFINITIONS + (ast.ClassDef, ast.Lambda)
MAX_STEPS = 3


def single_values(scope):
    counts, values = {}, {}
    for node in own_nodes(scope):
        targets = node.targets if isinstance(node, ast.Assign) else []
        if len(targets) == 1 and isinstance(targets[0], ast.Name):
            name = targets[0].id
            counts[name] = counts.get(name, 0) + 1
            values[name] = node.value
    return {name: value for name, value in values.items() if counts[name] == 1}


def canonical(node, aliases):
    if isinstance(node, ast.Call):
        return f"{canonical(node.func, aliases)}()"
    if isinstance(node, ast.Tuple):
        return "(" + ", ".join(canonical(part, aliases) for part in node.elts) + ")"
    return dotted_name(node, aliases) or type_text(node)


class Bindings:
    def __init__(self, context):
        self.context = context
        self.memo = {}

    def function_of(self, node):
        current = self.context.parents.get(id(node))
        while current is not None and not isinstance(current, DEFINITIONS):
            current = self.context.parents.get(id(current))
        return current

    def values_of(self, scope):
        if id(scope) not in self.memo:
            self.memo[id(scope)] = single_values(scope)
        return self.memo[id(scope)]

    def resolve(self, node, at):
        function = self.function_of(at)
        for _ in range(MAX_STEPS):
            if not isinstance(node, ast.Name):
                break
            local = self.values_of(function) if function else {}
            value = local.get(node.id) or self.values_of(self.context.tree).get(node.id)
            if value is None:
                break
            node = value
        return node

    def function_name(self, node):
        function = self.function_of(node)
        return function.name if function else None
