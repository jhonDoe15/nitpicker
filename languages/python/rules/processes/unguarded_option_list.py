import ast
import re

from checks.common import dotted_name, finding
from processes.subprocess_calls import (
    PASS_WRAPPERS,
    command_elements,
    is_listing,
    joined_list,
    resolve_expr,
    scope_reads,
    single_local_binding,
    subprocess_calls,
)
from security.support import exempt

RULE = "unguarded-option-list"
GUARDED = True
FLAG = re.compile(r"^-{1,2}[A-Za-z][\w-]*$")
FILTER_CALLS = {"filter", "builtins.filter"}


def is_flag(node):
    return (
        isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and FLAG.match(node.value) is not None
    )


def filters_or_lists(node, where):
    pending = [(node, 0)]
    while pending:
        current, depth = pending.pop()
        if current is None or depth > 6:
            continue
        if is_listing(current, where):
            return True
        if isinstance(current, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
            if any(gen.ifs for gen in current.generators):
                return True
            pending.extend((gen.iter, depth + 1) for gen in current.generators)
        elif isinstance(current, ast.Call):
            dotted = dotted_name(current.func, where.context.aliases) or ""
            if dotted in FILTER_CALLS:
                return True
            if dotted in PASS_WRAPPERS and current.args:
                pending.append((current.args[0], depth + 1))
            elif dotted in {"map", "builtins.map"} and len(current.args) >= 2:
                pending.append((current.args[1], depth + 1))
    return False


def possibly_empty(node, where):
    if not isinstance(node, ast.Name):
        return filters_or_lists(node, where)
    scope = where.scope if where.scope is not None else where.context.tree
    init = single_local_binding(node.id, scope)
    if init is None or not filters_or_lists(init, where):
        return False
    return len(scope_reads(node.id, scope)) == 1


def call_findings(call, name, where, context):
    found = []
    elements, _ = command_elements(call, name, where)
    for index, (element, _) in enumerate(elements):
        if not is_flag(element) or index + 1 >= len(elements):
            continue
        value, place = elements[index + 1]
        if isinstance(value, ast.Starred):
            continue
        resolved, rplace = resolve_expr(value, place)
        joined = joined_list(resolved)
        if joined is None:
            continue
        items, _ = joined
        if possibly_empty(items, rplace):
            subject = f"{element.value} {ast.unparse(value)}"
            found.append(finding(context.path, RULE, subject, value))
    return found


def check(context):
    if exempt(context):
        return []
    found = []
    for _, call, where, name in subprocess_calls(context):
        found.extend(call_findings(call, name, where, context))
    return found
