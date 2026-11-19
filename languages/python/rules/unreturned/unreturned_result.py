import ast

from checks.common import finding, functions_of, own_nodes, shown
from unreturned.annotations import result_names
from unreturned.callees import call_type, unwrapped
from unreturned.endings import argument_returned, ends_branch, ends_function

RULE = "unreturned-result"
GUARDED = True


def is_generator(function):
    return any(
        isinstance(node, (ast.Yield, ast.YieldFrom)) for node in own_nodes(function)
    )


def returned_calls(function):
    return [
        unwrapped(node.value)
        for node in own_nodes(function)
        if isinstance(node, ast.Return) and node.value is not None
    ]


def inferred_type(function, context):
    kinds = set()
    for value in returned_calls(function):
        found = call_type(value, context) if isinstance(value, ast.Call) else None
        if found is not None:
            kinds.add(found)
    return next(iter(kinds)) if len(kinds) == 1 else None


def function_type(function, context):
    if function.returns is not None:
        return result_names(function.returns, context.aliases)
    return inferred_type(function, context)


def dropped_calls(function):
    for node in own_nodes(function):
        if isinstance(node, ast.Expr):
            call = unwrapped(node.value)
            if isinstance(call, ast.Call):
                yield node, call


def function_findings(function, context):
    wanted = function_type(function, context)
    if not wanted or is_generator(function):
        return []
    found = []
    for statement, call in dropped_calls(function):
        kind = call_type(call, context)
        final = ends_function(statement, function, context) or ends_branch(
            statement, context
        )
        if (
            kind is not None
            and kind <= wanted
            and final
            and not argument_returned(call, function)
        ):
            name = ast.unparse(call.func)
            label = sorted(kind)[0].rsplit(".", 1)[-1]
            found.append(
                finding(context.path, RULE, f"{shown(name)}()|{label}", statement)
            )
    return found


def check(context):
    if context.tests:
        return []
    found = []
    for function in functions_of(context.tree):
        found.extend(function_findings(function, context))
    return found
