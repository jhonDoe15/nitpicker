import ast
import operator

from checks.common import finding, overlap_sites

TAUTOLOGY_OVERLAPS = {"tautological-assert": ("PLW0129",)}
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


def is_literal(node):
    return isinstance(node, ast.Constant)


def same_reference(left, right):
    pure = not any(
        isinstance(n, (ast.Call, ast.Await, ast.NamedExpr)) for n in ast.walk(left)
    )
    return pure and ast.dump(left) == ast.dump(right)


def is_len(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "len"
        and len(node.args) == 1
    )


def is_number(node, value):
    return (
        isinstance(node, ast.Constant)
        and isinstance(node.value, int)
        and node.value == value
    )


def is_object_check(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "isinstance"
        and len(node.args) == 2
        and isinstance(node.args[1], ast.Name)
        and node.args[1].id == "object"
    )


def is_tautology(test):
    if isinstance(test, ast.Constant):
        return bool(test.value)
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return isinstance(test.operand, ast.Constant) and not test.operand.value
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.Or):
        return any(is_tautology(value) for value in test.values)
    if is_object_check(test):
        return True
    if isinstance(test, ast.Compare) and len(test.ops) == 1:
        return compare_tautology(test)
    return False


def holds_itself(item, container):
    return isinstance(container, (ast.List, ast.Tuple, ast.Set)) and any(
        same_reference(item, element) for element in container.elts
    )


def length_bound(left, op, right):
    at_least_zero = isinstance(op, ast.GtE) and is_number(right, 0)
    above_negative = isinstance(op, ast.Gt) and (
        isinstance(right, ast.UnaryOp) and is_number(right.operand, 1)
    )
    return is_len(left) and (at_least_zero or above_negative)


def compare_tautology(test):
    left, right, op = test.left, test.comparators[0], test.ops[0]
    if is_literal(left) and is_literal(right) and type(op) in COMPARISONS:
        return bool(COMPARISONS[type(op)](left.value, right.value))
    if length_bound(left, op, right):
        return True
    if isinstance(op, ast.LtE) and is_number(left, 0) and is_len(right):
        return True
    if isinstance(op, ast.In) and holds_itself(left, right):
        return True
    return isinstance(op, SELF_TRUE) and same_reference(left, right)


def is_unittest_tautology(call):
    if not isinstance(call.func, ast.Attribute):
        return False
    method, args = call.func.attr, call.args
    if method == "assertTrue" and len(args) >= 1:
        return is_tautology(args[0])
    if method in {"assertEqual", "assertIs"} and len(args) >= 2:
        return same_reference(args[0], args[1])
    if method == "assertIn" and len(args) >= 2:
        return holds_itself(args[0], args[1])
    if method == "assertIsInstance" and len(args) >= 2:
        return isinstance(args[1], ast.Name) and args[1].id == "object"
    if method == "assertGreaterEqual" and len(args) >= 2:
        return is_len(args[0]) and is_number(args[1], 0)
    if method == "assertLessEqual" and len(args) >= 2:
        return is_number(args[0], 0) and is_len(args[1])
    return False


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
    return tautology_findings(context)


def allowances(context):
    return overlap_sites(check(context), TAUTOLOGY_OVERLAPS)
