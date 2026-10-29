import ast

from checks.common import dotted_name

NESTED_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)
CHECKPOINTS = (ast.Await, ast.Yield, ast.YieldFrom)
PURE_BUILTINS = {
    "abs",
    "all",
    "any",
    "bool",
    "bytes",
    "callable",
    "dict",
    "enumerate",
    "float",
    "format",
    "frozenset",
    "getattr",
    "hasattr",
    "hash",
    "id",
    "int",
    "isinstance",
    "issubclass",
    "iter",
    "len",
    "list",
    "max",
    "min",
    "next",
    "print",
    "range",
    "repr",
    "reversed",
    "round",
    "set",
    "sorted",
    "str",
    "sum",
    "tuple",
    "type",
    "zip",
}
CHEAP_METHODS = {
    "add",
    "append",
    "cancel",
    "clear",
    "copy",
    "create_task",
    "critical",
    "debug",
    "decode",
    "discard",
    "done",
    "encode",
    "endswith",
    "ensure_future",
    "error",
    "exception",
    "extend",
    "format",
    "get",
    "get_nowait",
    "info",
    "is_set",
    "items",
    "join",
    "keys",
    "log",
    "lower",
    "pop",
    "put_nowait",
    "remove",
    "result",
    "set",
    "setdefault",
    "split",
    "start_soon",
    "startswith",
    "strip",
    "update",
    "upper",
    "values",
    "warning",
}


def is_async_comprehension(node):
    return isinstance(
        node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
    ) and any(generator.is_async for generator in node.generators)


def is_checkpoint(node):
    return (
        isinstance(node, (ast.AsyncFor, ast.AsyncWith))
        or isinstance(node, CHECKPOINTS)
        or is_async_comprehension(node)
    )


def walk_executed(node):
    pending = [] if isinstance(node, NESTED_SCOPES) else [node]
    while pending:
        current = pending.pop()
        yield current
        for child in ast.iter_child_nodes(current):
            if not isinstance(child, NESTED_SCOPES):
                pending.append(child)


def walk_visible(node):
    pending = [node]
    while pending:
        current = pending.pop()
        yield current
        for child in ast.iter_child_nodes(current):
            if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                pending.append(child)


def sees_checkpoint(statements):
    return any(
        is_checkpoint(node) for statement in statements for node in walk_visible(statement)
    )


def is_cheap(call):
    function = call.func
    if isinstance(function, ast.Name):
        return function.id in PURE_BUILTINS
    return isinstance(function, ast.Attribute) and function.attr in CHEAP_METHODS


def awaited_name(node):
    call = node.value if isinstance(node, ast.Await) else None
    if isinstance(call, ast.Call) and isinstance(call.func, ast.Name):
        return call.func.id
    return None


def module_coroutines(tree):
    definitions = {}
    for statement in tree.body:
        for name in defined_names(statement):
            definitions.setdefault(name, []).append(statement)
    candidates = {
        name: statements[0]
        for name, statements in definitions.items()
        if len(statements) == 1
        and isinstance(statements[0], ast.AsyncFunctionDef)
        and not statements[0].decorator_list
    }
    return candidates


def defined_names(statement):
    if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return [statement.name]
    if isinstance(statement, ast.Assign):
        return [t.id for t in statement.targets if isinstance(t, ast.Name)]
    if isinstance(statement, (ast.AnnAssign, ast.AugAssign)):
        target = statement.target
        return [target.id] if isinstance(target, ast.Name) else []
    return []


def quiet_coroutines(tree):
    quiet = dict(module_coroutines(tree))
    changed = True
    while changed:
        changed = False
        for name, function in list(quiet.items()):
            if suspends(function, quiet):
                del quiet[name]
                changed = True
    return set(quiet)


def suspends(function, quiet):
    for statement in function.body:
        for node in walk_executed(statement):
            if not is_checkpoint(node):
                continue
            if isinstance(node, ast.Await) and awaited_name(node) in quiet:
                continue
            return True
    return False


def call_label(call, aliases):
    return dotted_name(call.func, aliases) or ast.unparse(call.func)
