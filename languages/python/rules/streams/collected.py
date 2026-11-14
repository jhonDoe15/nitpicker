import ast

from checks.common import finding, functions_of, own_nodes
from streams.sources import stream_names, is_stream_source

RULE = "streamed-rows-collected"
LOOPS = (ast.For, ast.AsyncFor)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp)
COLLECTORS = {"list", "tuple", "set", "sorted", "dict"}
APPENDS = {"append", "extend", "insert", "appendleft"}
DRAINS = {"clear", "pop", "popleft"}


def own_loop_nodes(loop):
    for statement in loop.body:
        yield statement
        yield from own_nodes(statement)


def receiver_name(call):
    func = call.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        return func.attr, func.value.id
    return None, None


def appended_names(loop):
    names = {}
    for node in own_loop_nodes(loop):
        if isinstance(node, ast.Call):
            method, name = receiver_name(node)
            if method in APPENDS:
                names.setdefault(name, node)
        if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
            names.setdefault(node.target.id, node)
    return names


def is_drained(loop, name):
    for node in own_loop_nodes(loop):
        if isinstance(node, ast.Call) and receiver_name(node) in {
            (method, name) for method in DRAINS
        }:
            return True
        if isinstance(node, ast.Delete) and any(
            isinstance(t, ast.Subscript)
            and isinstance(t.value, ast.Name)
            and t.value.id == name
            for t in node.targets
        ):
            return True
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == name for t in node.targets
        ):
            return True
    return False


def is_new_list(value):
    if isinstance(value, (ast.List, ast.ListComp)):
        return True
    return (
        isinstance(value, ast.Call)
        and isinstance(value.func, ast.Name)
        and value.func.id == "list"
        and not value.args
    )


def bound_targets(node):
    if isinstance(node, ast.Assign):
        return node.targets
    if isinstance(node, ast.AnnAssign) and node.value is not None:
        return [node.target]
    return []


def is_bound_before(function, name, loop):
    return any(
        any(isinstance(t, ast.Name) and t.id == name for t in bound_targets(node))
        and node.lineno < loop.lineno
        and is_new_list(node.value)
        for node in own_nodes(function)
    )


def exits_early(loop):
    pending = list(loop.body)
    while pending:
        node = pending.pop()
        if isinstance(node, (ast.Break, ast.Return)):
            return True
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            continue
        if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
            pending.extend(n for n in ast.walk(node) if isinstance(n, ast.Return))
            continue
        pending.extend(ast.iter_child_nodes(node))
    return False


def joined(node, parents):
    call = parents.get(id(node))
    return (
        isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute)
        and call.func.attr == "join"
        and node in call.args
    )


def read_after(function, name, loop, parents):
    reads = [
        node
        for node in own_nodes(function)
        if isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Load)
        and node.lineno > loop.end_lineno
    ]
    return bool(reads) and not any(joined(node, parents) for node in reads)


def loop_findings(context, function, cursors):
    for loop in own_nodes(function):
        if not (isinstance(loop, LOOPS) and is_stream_source(loop.iter, cursors)):
            continue
        if exits_early(loop):
            continue
        for name, node in appended_names(loop).items():
            if (
                is_bound_before(function, name, loop)
                and not is_drained(loop, name)
                and read_after(function, name, loop, context.parents)
            ):
                yield finding(context.path, RULE, name, node)


def whole_findings(context, function, cursors):
    for node in own_nodes(function):
        if isinstance(node, COMPREHENSIONS) and is_stream_source(
            node.generators[0].iter, cursors
        ):
            yield finding(
                context.path, RULE, ast.unparse(node.generators[0].iter), node
            )
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in COLLECTORS
            and len(node.args) == 1
            and is_stream_source(node.args[0], cursors)
        ):
            yield finding(context.path, RULE, ast.unparse(node.args[0]), node)


def check(context):
    if context.tests:
        return []
    found = []
    for function in functions_of(context.tree):
        cursors = stream_names(function)
        found.extend(loop_findings(context, function, cursors))
        found.extend(whole_findings(context, function, cursors))
    return found
