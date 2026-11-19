import ast

from checks.common import walk_statements
from dataloader_batches.lookups import (
    first_lookup,
    has_membership_test,
    is_keys,
    names_in,
    safe_names,
    targets_of,
)
from kinds.names import chain_names

COMPREHENSIONS = (ast.ListComp, ast.GeneratorExp)
MAX_SOURCE_DEPTH = 3
QUERY_METHODS = {
    "filter",
    "all",
    "exclude",
    "values",
    "values_list",
    "scalars",
    "execute",
    "fetchall",
    "query",
    "select",
}
EMPTY = "empty"
UNMAPPED = "unmapped"
LOOKUP = "lookup"


def assigned_value(function, name):
    values = [
        node.value
        for node in walk_statements(function.body)
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == name for t in node.targets)
    ]
    return values[0] if len(values) == 1 else None


def is_empty(value):
    if isinstance(value, (ast.List, ast.Tuple)):
        return not value.elts
    is_constructor = isinstance(value, ast.Call) and isinstance(value.func, ast.Name)
    return is_constructor and value.func.id in {"list", "tuple"} and not value.args


def is_row_element(element, loop_names):
    while isinstance(element, ast.Attribute):
        element = element.value
    return isinstance(element, ast.Name) and element.id in loop_names


def is_query_source(node, function, depth=0):
    if isinstance(node, ast.Await):
        node = node.value
    if isinstance(node, ast.Name) and depth < MAX_SOURCE_DEPTH:
        origin = assigned_value(function, node.id)
        return origin is not None and is_query_source(origin, function, depth + 1)
    if not isinstance(node, ast.Call):
        return False
    names = chain_names(node.func)
    return "objects" in names or bool(set(names) & QUERY_METHODS)


def comprehension_problem(value, batch, safe, function):
    keys = batch.keys
    if any(is_keys(g.iter, keys) for g in value.generators):
        loop = targets_of(value.generators)
        lookup = first_lookup(value.elt, loop, safe)
        return (LOOKUP, ast.unparse(lookup), lookup) if lookup else None
    rows = is_row_element(value.elt, targets_of(value.generators))
    if rows and is_query_source(value.generators[0].iter, function):
        return (UNMAPPED, "rows", value)
    return None


def map_problem(value, batch, safe):
    if not (isinstance(value.func, ast.Name) and value.func.id == "map"):
        return None
    if len(value.args) != 2 or not is_keys(value.args[1], batch.keys):
        return None
    function = value.args[0]
    if not isinstance(function, ast.Lambda) or has_membership_test(function.body):
        return None
    loop = {argument.arg for argument in function.args.args}
    lookup = first_lookup(function.body, loop, safe)
    return (LOOKUP, ast.unparse(lookup), lookup) if lookup else None


def call_problem(value, batch, safe):
    is_list = isinstance(value.func, ast.Name) and value.func.id == "list"
    if is_list and len(value.args) == 1:
        inner = value.args[0]
        if isinstance(inner, ast.Call):
            return map_problem(inner, batch, safe)
        return None
    if "objects" in chain_names(value):
        return (UNMAPPED, "rows", value)
    return map_problem(value, batch, safe)


def value_problem(value, batch, safe, function, depth=0):
    if is_empty(value):
        return (EMPTY, "[]", value)
    if isinstance(value, (ast.Dict, ast.DictComp)):
        return (UNMAPPED, "dict", value)
    if isinstance(value, COMPREHENSIONS):
        return comprehension_problem(value, batch, safe, function)
    if isinstance(value, ast.Call):
        return call_problem(value, batch, safe)
    if isinstance(value, ast.Name) and depth == 0:
        origin = assigned_value(function, value.id)
        if origin is not None and not is_empty(origin):
            return value_problem(origin, batch, safe, function, depth + 1)
    return None


def is_append_call(call):
    return chain_names(call.func)[-1:] == ["append"]


def has_try(node):
    return any(isinstance(item, ast.Try) for item in ast.walk(node))


def guard_returns(function, keys):
    guarded = set()
    for node in walk_statements(function.body):
        if isinstance(node, ast.If) and keys in names_in(node.test):
            guarded |= {id(item) for item in node.body if isinstance(item, ast.Return)}
    return guarded


def loop_problems(batch, safe):
    for node in walk_statements(batch.function.body):
        is_loop = isinstance(node, ast.For) and is_keys(node.iter, batch.keys)
        if is_loop and not has_membership_test(node) and not has_try(node):
            loop = targets_of([ast.comprehension(node.target, node.iter, [], 0)])
            for call in ast.walk(node):
                is_append = isinstance(call, ast.Call) and is_append_call(call)
                lookup = first_lookup(call, loop, safe) if is_append else None
                if lookup:
                    yield LOOKUP, ast.unparse(lookup), lookup


def handled_nodes(function):
    handled = set()
    for node in walk_statements(function.body):
        if isinstance(node, ast.Try) and node.handlers:
            for statement in node.body:
                handled |= {id(item) for item in ast.walk(statement)}
    return handled


def problems_in(batch):
    safe = safe_names(batch.function, batch.keys)
    guarded = guard_returns(batch.function, batch.keys)
    guarded |= handled_nodes(batch.function)
    for node in walk_statements(batch.function.body):
        is_return = isinstance(node, ast.Return) and node.value is not None
        if is_return and id(node) not in guarded:
            problem = value_problem(node.value, batch, safe, batch.function)
            if problem is not None:
                yield problem
    yield from loop_problems(batch, safe)
