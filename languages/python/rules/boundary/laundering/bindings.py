import ast

from checks.common import own_nodes

TYPING = "typing"
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)


def typing_target(name):
    if name == "typing_extensions" or name.startswith("typing_extensions."):
        return TYPING + name[len("typing_extensions") :]
    return name


def import_target(node, alias):
    if isinstance(node, ast.Import):
        return typing_target(
            alias.name if alias.asname else alias.name.split(".")[0]
        )
    if node.level != 0 or node.module is None:
        return None
    return typing_target(f"{node.module}.{alias.name}")


def comprehension_targets(root):
    found = set()
    for node in own_nodes(root):
        if isinstance(node, COMPREHENSIONS):
            for generator in node.generators:
                found.update(
                    id(name)
                    for name in ast.walk(generator.target)
                    if isinstance(name, ast.Name)
                )
    return found


def pattern_names(node):
    if isinstance(node, (ast.MatchAs, ast.MatchStar)):
        return [node.name] if node.name else []
    if isinstance(node, ast.MatchMapping):
        return [node.rest] if node.rest else []
    return []


def parameters(function):
    args = function.args
    every = args.posonlyargs + args.args + args.kwonlyargs
    return [arg for arg in [*every, args.vararg, args.kwarg] if arg is not None]


def scope_bindings(root):
    bindings = {}
    imports = {}
    skipped = comprehension_targets(root)
    for node in own_nodes(root):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                name = alias.asname or alias.name.split(".")[0]
                imports.setdefault(name, []).append(import_target(node, alias))
        elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            if id(node) not in skipped:
                bindings[node.id] = None
        elif isinstance(node, SCOPES) and not isinstance(node, ast.Lambda):
            bindings[node.name] = None
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bindings[node.name] = None
        for name in pattern_names(node):
            bindings[name] = None
    if isinstance(root, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
        for arg in parameters(root):
            bindings[arg.arg] = None
    for name, targets in imports.items():
        if name not in bindings:
            bindings[name] = targets[0] if len(set(targets)) == 1 else None
    return bindings


def comprehension_bindings(node):
    return {
        name.id: None
        for generator in node.generators
        for name in ast.walk(generator.target)
        if isinstance(name, ast.Name)
    }
