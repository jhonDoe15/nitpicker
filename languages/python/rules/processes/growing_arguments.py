import ast

from checks.common import finding
from processes.subprocess_calls import (
    command_elements,
    is_listing,
    is_pathsep,
    joined_list,
    resolve_expr,
    shell_expressions,
    subprocess_calls,
)
from security.support import exempt

RULE = "growing-process-arguments"
GUARDED = True


def is_fixed_literal_list(node, where):
    resolved, place = resolve_expr(node, where)
    if not isinstance(resolved, (ast.List, ast.Tuple)):
        return False
    return not any(
        isinstance(element, ast.Starred) and is_listing(element.value, place)
        for element in resolved.elts
    )


def joined_problem(node, where):
    resolved, place = resolve_expr(node, where)
    joined = joined_list(resolved)
    if joined is None:
        return False
    items, separator = joined
    if is_pathsep(separator, place) and not is_fixed_literal_list(items, place):
        return True
    return is_listing(items, place)


def argument_problem(node, where):
    if isinstance(node, ast.Starred):
        return is_listing(node.value, where)
    return joined_problem(node, where)


def call_findings(call, name, where, context):
    found = []
    elements, added = command_elements(call, name, where)
    for element, place in elements:
        if argument_problem(element, place):
            found.append(finding(context.path, RULE, ast.unparse(element), element))
    for extra, place in added:
        if is_listing(extra, place):
            found.append(finding(context.path, RULE, ast.unparse(extra), extra))
    for expr, place in shell_expressions(call, name, where):
        if joined_problem(expr, place) or is_listing(expr, place):
            found.append(finding(context.path, RULE, ast.unparse(expr), expr))
    return found


def check(context):
    if exempt(context):
        return []
    found = []
    for _, call, where, name in subprocess_calls(context):
        found.extend(call_findings(call, name, where, context))
    return found
