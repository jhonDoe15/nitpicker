import ast

from checks.common import dotted_name, finding

MUTABLE_CONSTRUCTORS = {
    "dict",
    "list",
    "set",
    "bytearray",
    "collections.defaultdict",
    "collections.OrderedDict",
    "collections.Counter",
    "collections.deque",
    "collections.ChainMap",
    "defaultdict",
    "OrderedDict",
    "Counter",
    "deque",
}
MUTATING_METHODS = {
    "append",
    "appendleft",
    "extend",
    "extendleft",
    "insert",
    "pop",
    "popitem",
    "popleft",
    "remove",
    "clear",
    "update",
    "setdefault",
    "add",
    "discard",
    "sort",
    "reverse",
    "difference_update",
    "intersection_update",
    "symmetric_difference_update",
}


def is_mutable_value(node, aliases):
    if isinstance(
        node, (ast.Dict, ast.List, ast.Set, ast.DictComp, ast.ListComp, ast.SetComp)
    ):
        return True
    if isinstance(node, ast.Call):
        return dotted_name(node.func, aliases) in MUTABLE_CONSTRUCTORS
    return False


def module_collections(tree, aliases):
    found = {}
    for statement in tree.body:
        if isinstance(statement, ast.Assign) and is_mutable_value(
            statement.value, aliases
        ):
            for target in statement.targets:
                if isinstance(target, ast.Name):
                    found.setdefault(target.id, statement)
        elif (
            isinstance(statement, ast.AnnAssign)
            and statement.value is not None
            and isinstance(statement.target, ast.Name)
            and is_mutable_value(statement.value, aliases)
        ):
            found.setdefault(statement.target.id, statement)
    return {name: node for name, node in found.items() if name != "__all__"}


def local_names(function):
    names = {argument.arg for argument in function.args.args + function.args.kwonlyargs}
    names.update(
        argument.arg
        for argument in function.args.posonlyargs
        + [function.args.vararg, function.args.kwarg]
        if argument
    )
    declared = set()
    for node in ast.walk(function):
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            declared.update(node.names)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
    return names - declared


def root_name(node):
    while isinstance(node, ast.Subscript):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def mutated_name(node):
    if isinstance(node, (ast.Assign, ast.AugAssign, ast.Delete)):
        targets = node.targets if not isinstance(node, ast.AugAssign) else [node.target]
        for target in targets:
            if isinstance(target, ast.Subscript):
                return root_name(target)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        if node.func.attr in MUTATING_METHODS:
            return root_name(node.func.value)
    return None


def mutated_in(function, collections):
    shadowed = local_names(function)
    return {
        name
        for node in ast.walk(function)
        for name in [mutated_name(node)]
        if name in collections and name not in shadowed
    }


def check(context):
    if context.tests:
        return []
    collections = module_collections(context.tree, context.aliases)
    if not collections:
        return []
    mutated = set()
    for function in ast.walk(context.tree):
        if isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
            mutated |= mutated_in(function, collections)
    return [
        finding(context.path, "module-level-mutable-state", name, collections[name])
        for name in sorted(mutated)
    ]
