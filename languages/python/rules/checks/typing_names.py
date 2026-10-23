import ast

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
SCOPES = FUNCTIONS + (ast.ClassDef,)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)


def lexical_nodes(scope):
    pending = list(ast.iter_child_nodes(scope))
    while pending:
        node = pending.pop()
        yield node
        if not isinstance(node, SCOPES + COMPREHENSIONS):
            pending.extend(ast.iter_child_nodes(node))


def scope_names(scope):
    names = {}
    imports = {}
    if isinstance(scope, FUNCTIONS):
        arguments = scope.args
        every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
        every += [a for a in (arguments.vararg, arguments.kwarg) if a]
        names.update((argument.arg, None) for argument in every)
    for node in lexical_nodes(scope):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            names[node.id] = None
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names[node.name] = None
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names[node.name] = None
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            names.update((name, None) for name in node.names)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname or alias.name.split(".")[0]
                imports.setdefault(name, []).append(
                    alias.name if alias.asname else name
                )
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            for alias in node.names:
                imports.setdefault(alias.asname or alias.name, []).append(
                    f"{node.module}.{alias.name}"
                )
    for name, targets in imports.items():
        if name not in names:
            names[name] = targets[0] if len(set(targets)) == 1 else None
    return names


class TypingNames:
    def __init__(self, scope, parent=None):
        self.names = scope_names(scope)
        self.parent = parent
        self.scope = scope

    def resolve(self, node):
        if isinstance(node, ast.Attribute):
            owner = self.resolve(node.value)
            return f"{owner}.{node.attr}" if owner else None
        if not isinstance(node, ast.Name):
            return None
        if node.id in self.names:
            return self.names[node.id]
        return self.parent.resolve(node) if self.parent else None

    def child(self, scope):
        parent = self
        if isinstance(scope, FUNCTIONS):
            while isinstance(parent.scope, ast.ClassDef) and parent.parent:
                parent = parent.parent
        return TypingNames(scope, parent)
