import ast

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


def is_number(node, scope, depth=0):
    if depth > MAX_DEPTH:
        return False
    if isinstance(node, ast.Constant):
        return isinstance(node.value, (int, float)) and not isinstance(node.value, bool)
    if isinstance(node, ast.UnaryOp):
        return is_number(node.operand, scope, depth + 1)
    if isinstance(node, ast.BinOp):
        return is_number(node.left, scope, depth + 1) and is_number(
            node.right, scope, depth + 1
        )
    if isinstance(node, ast.Name):
        values = bound_values(node.id, scope)
        return len(values) == 1 and is_number(values[0], scope, depth + 1)
    return False


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


def fixed_size(node, scope, parents, depth=0):
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
            and all(fixed_size(v, scope, parents, depth + 1) for v in values)
        )
        return known or is_chunk_variable(node, scope, parents)
    if isinstance(node, ast.Subscript):
        return constant_window(node.slice, scope)
    if isinstance(node, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
        return fixed_size(node.generators[0].iter, scope, parents, depth + 1)
    if isinstance(node, ast.Call):
        return fixed_call(node, scope, parents, depth)
    return False


def fixed_call(node, scope, parents, depth):
    name = callee_name(node)
    if name == "range" and node.args:
        stop = node.args[0] if len(node.args) == 1 else node.args[1]
        return is_number(stop, scope)
    if name == "islice" and len(node.args) >= 2:
        return explicit_size(node.args[-1])
    if name == "zip":
        return any(fixed_size(a, scope, parents, depth + 1) for a in node.args)
    if name in WRAPPERS and node.args:
        return fixed_size(node.args[0], scope, parents, depth + 1)
    if name in VIEWS and isinstance(node.func, ast.Attribute):
        return fixed_size(node.func.value, scope, parents, depth + 1)
    return False
