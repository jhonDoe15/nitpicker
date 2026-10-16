import ast
import operator
import re

from checks.common import dotted_name, finding

COMPARISONS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
}
SELF_TRUE = (ast.Eq, ast.LtE, ast.GtE, ast.Is)
SLEEPS = {"time.sleep"}
FAKED_SLEEP = re.compile(
    r"freezegun|freeze_time|time_machine|(?:setattr|patch)\([^)]*sleep"
)


def is_literal(node):
    return isinstance(node, ast.Constant)


def same_reference(left, right):
    pure = not any(
        isinstance(n, (ast.Call, ast.Await, ast.NamedExpr)) for n in ast.walk(left)
    )
    return pure and ast.dump(left) == ast.dump(right)


def is_tautology(test):
    if isinstance(test, ast.Constant):
        return bool(test.value)
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return isinstance(test.operand, ast.Constant) and not test.operand.value
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.Or):
        return any(is_tautology(value) for value in test.values)
    if isinstance(test, ast.Compare) and len(test.ops) == 1:
        return compare_tautology(test)
    return False


def compare_tautology(test):
    left, right, op = test.left, test.comparators[0], test.ops[0]
    if is_literal(left) and is_literal(right) and type(op) in COMPARISONS:
        return bool(COMPARISONS[type(op)](left.value, right.value))
    return isinstance(op, SELF_TRUE) and same_reference(left, right)


def is_unittest_tautology(call):
    if not isinstance(call.func, ast.Attribute):
        return False
    method = call.func.attr
    if method == "assertTrue" and len(call.args) >= 1:
        return is_tautology(call.args[0])
    if method in {"assertEqual", "assertIs"} and len(call.args) >= 2:
        return same_reference(call.args[0], call.args[1])
    return False


def is_async_zero(call):
    return (
        bool(call.args)
        and isinstance(call.args[0], ast.Constant)
        and call.args[0].value == 0
    )


def sleep_findings(context):
    if FAKED_SLEEP.search(context.text):
        return []
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        name = dotted_name(node.func, context.aliases)
        if name in SLEEPS or (name == "asyncio.sleep" and not is_async_zero(node)):
            found.append(finding(context.path, "sleep-in-test", name, node))
    return found


def tautology_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Assert) and is_tautology(node.test):
            found.append(finding(context.path, "tautological-assert", "assert", node))
        elif isinstance(node, ast.Call) and is_unittest_tautology(node):
            found.append(
                finding(context.path, "tautological-assert", node.func.attr, node)
            )
    return found


def check(context):
    if not context.tests:
        return []
    return sleep_findings(context) + tautology_findings(context)
