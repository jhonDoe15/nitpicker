import ast

from checks.common import own_nodes

SCOPES = (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
CANCELLATIONS = {
    "asyncio.CancelledError",
    "asyncio.exceptions.CancelledError",
    "trio.Cancelled",
}


def import_binding(node, name):
    if isinstance(node, ast.Import):
        for alias in node.names:
            if (alias.asname or alias.name.split(".")[0]) == name:
                return alias.name if alias.asname else name
    if isinstance(node, ast.ImportFrom) and node.level == 0:
        for alias in node.names:
            if (alias.asname or alias.name) == name:
                return f"{node.module}.{alias.name}"
    return None


def binds(node, name):
    return (
        isinstance(node, ast.Name)
        and isinstance(node.ctx, (ast.Store, ast.Del))
        and node.id == name
        or isinstance(node, ast.arg)
        and node.arg == name
        or isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        and node.name == name
        or isinstance(node, ast.ExceptHandler)
        and node.name == name
        or isinstance(node, (ast.Global, ast.Nonlocal))
        and name in node.names
    )


def binding_in(scope, name):
    imports = set()
    for node in own_nodes(scope):
        if binds(node, name):
            return True, None
        imported = import_binding(node, name)
        if imported:
            imports.add(imported)
        elif isinstance(node, ast.ImportFrom) and any(
            alias.name == "*" or (alias.asname or alias.name) == name
            for alias in node.names
        ):
            return True, None
    return bool(imports), next(iter(imports)) if len(imports) == 1 else None


def imported_name(name, node, context):
    current = node
    in_function = False
    while current is not None:
        if isinstance(current, SCOPES):
            if not (in_function and isinstance(current, ast.ClassDef)):
                key = ("cancellation-binding", id(current), name)
                found, value = context.project.memo(
                    key, lambda _: binding_in(current, name)
                )
                if found:
                    return value
            in_function |= isinstance(
                current, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
            )
        current = context.parents.get(id(current))
    return None


def resolved_name(node, context):
    if isinstance(node, ast.Attribute):
        base = resolved_name(node.value, context)
        return f"{base}.{node.attr}" if base else None
    if isinstance(node, ast.Name):
        name = imported_name(node.id, node, context)
        if name and context.project.module_path(name.split(".")[0]) is None:
            return name
    return None


def cancellation_type(node, context):
    if isinstance(node, ast.Call) and not node.args and not node.keywords:
        if resolved_name(node.func, context) == "anyio.get_cancelled_exc_class":
            return "anyio cancellation"
    name = resolved_name(node, context)
    return name if name in CANCELLATIONS else None


def caught_cancellations(handler, context):
    caught = (
        handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    )
    return sorted(filter(None, (cancellation_type(node, context) for node in caught)))
