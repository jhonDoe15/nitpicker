import ast

from checks.common import walk_statements
from kinds.receivers import located_callee
from orm.origins import EVERYTHING, FORWARD

MAX_DEPTH = 3
BOUND = {"self", "cls"}
MANAGER_QUERIES = {
    "all",
    "filter",
    "exclude",
    "count",
    "exists",
    "first",
    "last",
    "get",
    "order_by",
    "values",
    "values_list",
    "aggregate",
    "annotate",
    "iterator",
    "distinct",
    "earliest",
    "latest",
    "in_bulk",
}


def is_covered(relation, plan):
    if relation.name in plan or EVERYTHING in plan:
        return True
    return FORWARD in plan and not relation.reverse and not relation.manager


def loads_relation(node, relation, parents):
    if relation.manager:
        parent = parents.get(id(node))
        call = parents.get(id(parent))
        return (
            isinstance(parent, ast.Attribute)
            and parent.attr in MANAGER_QUERIES
            and isinstance(call, ast.Call)
            and call.func is parent
        )
    return isinstance(node.ctx, ast.Load)


def lazy_accesses(variable, body, origin, parents):
    found = {}
    attributes = [n for n in walk_statements(body) if isinstance(n, ast.Attribute)]
    for node in sorted(attributes, key=lambda n: (n.lineno, n.col_offset)):
        if not (isinstance(node.value, ast.Name) and node.value.id == variable):
            continue
        relation = origin.relations.get(node.attr)
        if relation is None or not relation.lazy or is_covered(relation, origin.plan):
            continue
        if loads_relation(node, relation, parents):
            found.setdefault(relation.name, node)
    return found


def is_variable(node, variable):
    return isinstance(node, ast.Name) and node.id == variable


def is_static(function):
    return any(
        isinstance(d, ast.Name) and d.id == "staticmethod"
        for d in function.decorator_list
    )


def positional_of(reference, function):
    positional = [a.arg for a in function.args.posonlyargs + function.args.args]
    bound = isinstance(reference, ast.Attribute) and not is_static(function)
    return (
        positional[1:]
        if bound and positional[:1] and positional[0] in BOUND
        else positional
    )


def bound_parameter(call, function, variable):
    positional = positional_of(call.func, function)
    for index, argument in enumerate(call.args):
        if isinstance(argument, ast.Starred):
            return None
        if is_variable(argument, variable):
            return positional[index] if index < len(positional) else None
    names = set(positional) | {a.arg for a in function.args.kwonlyargs}
    for keyword in call.keywords:
        if keyword.arg in names and is_variable(keyword.value, variable):
            return keyword.arg
    return None


def reached(function, context, parameter, origin, depth, seen):
    if id(function) in seen:
        return {}
    seen = seen | {id(function)}
    found = dict(lazy_accesses(parameter, function.body, origin, context.parents))
    if depth >= MAX_DEPTH:
        return found
    for name, node in passed_calls(
        parameter, function.body, origin, context, depth + 1, seen
    ):
        found.setdefault(name, node)
    return found


def passed_calls(variable, body, origin, context, depth, seen):
    calls = [n for n in walk_statements(body) if isinstance(n, ast.Call)]
    for call in sorted(calls, key=lambda n: (n.lineno, n.col_offset)):
        if not any(
            is_variable(a, variable)
            for a in [*call.args, *(k.value for k in call.keywords)]
        ):
            continue
        callee = located_callee(call.func, context)
        if callee is None or not isinstance(
            callee[0], (ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            continue
        parameter = bound_parameter(call, callee[0], variable)
        if parameter is not None:
            for name in reached(callee[0], callee[1], parameter, origin, depth, seen):
                yield name, call


def helper_accesses(variable, body, origin, context):
    found = {}
    for name, call in passed_calls(variable, body, origin, context, 1, frozenset()):
        found.setdefault(name, call)
    return found


def mapped_accesses(reference, origin, context):
    callee = located_callee(reference, context)
    if callee is None or not isinstance(
        callee[0], (ast.FunctionDef, ast.AsyncFunctionDef)
    ):
        return {}
    positional = positional_of(reference, callee[0])
    if not positional:
        return {}
    return reached(callee[0], callee[1], positional[0], origin, 1, frozenset())
