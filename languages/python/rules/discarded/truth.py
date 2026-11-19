import ast

from checks.common import finding
from discarded.kinds import kind_of

TUPLE_RESULTS = {
    "delete": {"queryset"},
    "get_or_create": {"queryset", "manager"},
    "update_or_create": {"queryset", "manager"},
}
TEST_FIELDS = (ast.If, ast.While, ast.IfExp, ast.Assert)


def tested_calls(node):
    if isinstance(node, ast.Call):
        return [node]
    if isinstance(node, ast.BoolOp):
        return [call for value in node.values for call in tested_calls(value)]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return tested_calls(node.operand)
    return []


def truth_positions(node):
    if isinstance(node, TEST_FIELDS):
        return [node.test]
    if isinstance(node, ast.comprehension):
        return node.ifs
    if isinstance(node, ast.BoolOp):
        return node.values[:-1]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return [node.operand]
    named = isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    if named and node.func.id == "bool" and len(node.args) == 1:
        return node.args
    return []


def tuple_call(call, context):
    if not isinstance(call.func, ast.Attribute) or call.func.attr not in TUPLE_RESULTS:
        return None
    kind = kind_of(call.func.value, context)
    return call.func.attr if kind in TUPLE_RESULTS[call.func.attr] else None


def truth_findings(context, rule):
    found, seen = [], set()
    for node in ast.walk(context.tree):
        for position in truth_positions(node):
            for call in tested_calls(position):
                method = tuple_call(call, context)
                if method is not None and id(call) not in seen:
                    seen.add(id(call))
                    subject = f"QuerySet.{method}()|truth"
                    found.append(finding(context.path, rule, subject, call))
    return found
