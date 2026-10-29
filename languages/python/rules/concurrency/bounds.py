import ast

from checks.common import dotted_name

ENUM_BASES = {"Enum", "IntEnum", "StrEnum", "Flag", "IntFlag"}
CHUNKERS = {
    "chunk",
    "chunked",
    "chunks",
    "batched",
    "batch",
    "batches",
    "partition_all",
    "grouper",
    "split_every",
    "cluster",
}
WRAPPERS = {
    "list",
    "tuple",
    "set",
    "frozenset",
    "sorted",
    "reversed",
    "enumerate",
    "iter",
}
VIEWS = {"items", "keys", "values"}
MAX_DEPTH = 6


def callee_name(call):
    if isinstance(call.func, ast.Name):
        return call.func.id
    return call.func.attr if isinstance(call.func, ast.Attribute) else None


def bound_values(name, scope):
    return [v for v in scope.names.get(name, []) if not isinstance(v, tuple)]


def explicit_size(node):
    return not any(
        isinstance(n, ast.Call) and callee_name(n) == "len" for n in ast.walk(node)
    )


def constant_window(slice_node, scope):
    if not isinstance(slice_node, ast.Slice) or slice_node.upper is None:
        return False
    return explicit_size(slice_node.upper)


def is_chunk_call(node, scope):
    return (
        isinstance(node, ast.Call)
        and callee_name(node) in CHUNKERS
        and len(node.args) >= 2
        and explicit_size(node.args[1])
    )


def is_chunk_value(node, scope):
    if isinstance(node, ast.Subscript):
        return constant_window(node.slice, scope)
    return is_chunk_call(node, scope)


def yields_chunks(node, scope, depth=0):
    if depth > MAX_DEPTH:
        return False
    if is_chunk_call(node, scope):
        return True
    if isinstance(node, (ast.ListComp, ast.GeneratorExp)):
        return is_chunk_value(node.elt, scope)
    if isinstance(node, ast.Name):
        values = bound_values(node.id, scope)
        return len(values) == 1 and yields_chunks(values[0], scope, depth + 1)
    if isinstance(node, ast.Call) and callee_name(node) in WRAPPERS and node.args:
        return yields_chunks(node.args[0], scope, depth + 1)
    return False


def is_chunk_variable(name, scope, parents):
    node = name
    while id(node) in parents:
        node = parents[id(node)]
        if isinstance(node, (ast.For, ast.AsyncFor)):
            targets = {n.id for n in ast.walk(node.target) if isinstance(n, ast.Name)}
            if name.id in targets:
                return yields_chunks(node.iter, scope)
    return False


def stop_value(stop, scope):
    if scope is not None and isinstance(stop, ast.Name):
        values = bound_values(stop.id, scope)
        return values[0] if len(values) == 1 else stop
    return stop


def sized_collection(node, scope=None):
    if not (isinstance(node, ast.Call) and callee_name(node) == "range" and node.args):
        return None
    stop = stop_value(node.args[0] if len(node.args) == 1 else node.args[1], scope)
    sizes = [
        n
        for n in ast.walk(stop)
        if isinstance(n, ast.Call) and callee_name(n) == "len" and n.args
    ]
    return sizes[0].args[0] if sizes else None


def enum_bases(definition, context):
    return any(
        (dotted_name(base, context.aliases) or "").split(".")[-1] in ENUM_BASES
        for base in definition.bases
    )


def is_enum_class(name, context):
    classes = [
        n
        for n in context.tree.body
        if isinstance(n, ast.ClassDef) and n.name == name.id
    ]
    if classes:
        return all(enum_bases(c, context) for c in classes)
    located = context.project.locate(dotted_name(name, context.aliases) or "")
    target = context.project.contexts.get(located[0]) if located else None
    found = [
        n
        for n in (target.tree.body if target else [])
        if isinstance(n, ast.ClassDef) and n.name == located[1]
    ]
    return bool(found) and all(enum_bases(c, target) for c in found)


def fixed_size(node, scope, context, depth=0):
    parents = context.parents
    if depth > MAX_DEPTH:
        return False
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return not any(isinstance(e, ast.Starred) for e in node.elts)
    if isinstance(node, ast.Dict):
        return None not in node.keys
    if isinstance(node, ast.Name):
        values = bound_values(node.id, scope)
        known = (
            node.id not in scope.grown
            and bool(values)
            and all(fixed_size(v, scope, context, depth + 1) for v in values)
        )
        return (
            known
            or is_chunk_variable(node, scope, parents)
            or is_enum_class(node, context)
        )
    if isinstance(node, ast.Subscript):
        return constant_window(node.slice, scope)
    if isinstance(node, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
        return fixed_size(node.generators[0].iter, scope, context, depth + 1)
    if isinstance(node, ast.Call):
        return fixed_call(node, scope, context, depth)
    return False


def fixed_call(node, scope, context, depth):
    name = callee_name(node)
    if name == "range" and node.args:
        return sized_collection(node, scope) is None
    if name == "islice" and len(node.args) >= 2:
        return explicit_size(node.args[-1])
    if name == "zip":
        return any(fixed_size(a, scope, context, depth + 1) for a in node.args)
    if name in WRAPPERS and node.args:
        return fixed_size(node.args[0], scope, context, depth + 1)
    if name in VIEWS and isinstance(node.func, ast.Attribute):
        return fixed_size(node.func.value, scope, context, depth + 1)
    return False
