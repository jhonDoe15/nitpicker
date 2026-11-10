import ast
from collections import namedtuple

from honesty.assertions import is_len, is_number

Form = namedtuple("Form", ["narrowed"], defaults=[None])

CALL_FLAGS = {"called", "awaited"}
CALL_COUNTS = {"call_count", "await_count"}
OPERANDS = (ast.Name, ast.Attribute, ast.Subscript)
REFLECTED = {ast.Lt: ast.Gt, ast.LtE: ast.GtE, ast.NotEq: ast.NotEq}
NON_EMPTY = {(ast.Gt, 0), (ast.GtE, 1), (ast.NotEq, 0)}
COMPARING = {
    "assertGreater": ast.Gt,
    "assertGreaterEqual": ast.GtE,
    "assertLess": ast.Lt,
    "assertLessEqual": ast.LtE,
    "assertNotEqual": ast.NotEq,
}


def is_operand(node):
    return isinstance(node, OPERANDS)


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def is_call_attribute(node, names):
    return isinstance(node, ast.Attribute) and node.attr in names


def is_empty_literal(node):
    if isinstance(node, (ast.List, ast.Tuple)):
        return not node.elts
    if isinstance(node, ast.Dict):
        return not node.keys
    return (
        isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and not node.value
    )


def bounded_count(test):
    if not isinstance(test, ast.Compare) or len(test.ops) != 1:
        return None
    op, right = type(test.ops[0]), test.comparators[0]
    for measure, number, kind in (
        (test.left, right, op),
        (right, test.left, REFLECTED.get(op)),
    ):
        for wanted, value in NON_EMPTY:
            if kind is wanted and is_number(number, value):
                return measure
    return None


def count_form(test):
    measure = bounded_count(test)
    if measure is None:
        return None
    return Form() if is_len(measure) or is_call_attribute(measure, CALL_COUNTS) else None


def presence_form(test):
    left, op, right = test.left, test.ops[0], test.comparators[0]
    if not (is_operand(left) and is_none(right)):
        return None
    if isinstance(op, ast.IsNot):
        return Form(left)
    return Form(left) if isinstance(op, ast.NotEq) else None


def empty_form(test):
    left, op, right = test.left, test.ops[0], test.comparators[0]
    if not isinstance(op, ast.NotEq):
        return None
    return Form() if is_empty_literal(right) or is_empty_literal(left) else None


def compare_form(test):
    if len(test.ops) != 1:
        return None
    return count_form(test) or presence_form(test) or empty_form(test)


def negated_form(operand):
    if is_call_attribute(operand, CALL_FLAGS | CALL_COUNTS):
        return None
    return Form() if is_operand(operand) else None


def truthy_form(test):
    if is_call_attribute(test, CALL_FLAGS | CALL_COUNTS):
        return Form()
    if is_operand(test):
        return Form(test)
    if is_len(test):
        return Form()
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return negated_form(test.operand)
    return compare_form(test) if isinstance(test, ast.Compare) else None


def compared_form(method, first, second):
    test = ast.Compare(left=first, ops=[COMPARING[method]()], comparators=[second])
    return count_form(test)


def unittest_form(call):
    method, args = call.func.attr, call.args
    if method == "assertIsNotNone" and args and is_operand(args[0]):
        return Form(args[0])
    if method == "assertTrue" and args:
        return truthy_form(args[0])
    if method == "assertFalse" and args:
        return negated_form(args[0])
    if method in COMPARING and len(args) >= 2:
        return compared_form(method, args[0], args[1])
    return None
