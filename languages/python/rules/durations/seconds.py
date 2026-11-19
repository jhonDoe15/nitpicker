import ast

from datetime import timedelta

from checks.common import finding, last_name, shown
from durations.kinds import DELTA, delta_fields, environment, kind_of
from signatures.annotations import FUNCTION_TYPES
from truthiness.numbers import scope_nodes

RULE = "timedelta-seconds-as-total"
GUARDED = True
COMPONENTS = {"seconds", "microseconds"}


def is_short_literal(node):
    if not (isinstance(node, ast.Call) and last_name(node.func) == "timedelta"):
        return False
    values = [*node.args, *(item.value for item in node.keywords)]
    plain = all(
        isinstance(item, ast.Constant) and isinstance(item.value, (int, float))
        for item in values
    ) and all(item.arg is not None for item in node.keywords)
    if not plain:
        return False
    try:
        span = timedelta(
            *(item.value for item in node.args),
            **{item.arg: item.value.value for item in node.keywords},
        )
    except (TypeError, ValueError, OverflowError):
        return False
    return abs(span) < timedelta(days=1)


def day_readers(nodes):
    return {
        ast.unparse(node.value)
        for node in nodes
        if isinstance(node, ast.Attribute) and node.attr == "days"
    }


def function_findings(function, context):
    nodes = list(scope_nodes(function))
    fields = delta_fields(function, context)
    env = environment(function, nodes, context, fields)
    days = day_readers(nodes)
    return [
        finding(context.path, RULE, shown(ast.unparse(node), 60), node)
        for node in nodes
        if isinstance(node, ast.Attribute)
        and isinstance(node.ctx, ast.Load)
        and node.attr in COMPONENTS
        and kind_of(node.value, env, context, fields) == DELTA
        and ast.unparse(node.value) not in days
        and not is_short_literal(node.value)
    ]


def check(context):
    if context.tests:
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
