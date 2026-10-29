import ast
import math

from checks.common import finding, last_name

RULE = "float-equality-in-test"
EQUALITY = (ast.Eq, ast.NotEq)
EQUALITY_METHODS = {
    "assertEqual",
    "assertEquals",
    "assertNotEqual",
    "assertNotEquals",
    "assertListEqual",
    "assertTupleEqual",
    "assertDictEqual",
    "assertSequenceEqual",
}
TRUTH_METHODS = {"assertTrue", "assertFalse"}
SIGNS = (ast.USub, ast.UAdd)


def is_fraction(node):
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, SIGNS):
        node = node.operand
    if not isinstance(node, ast.Constant) or type(node.value) is not float:
        return False
    return math.isfinite(node.value) and not node.value.is_integer()


def fractions_in(node):
    found = []
    pending = [node]
    while pending:
        item = pending.pop()
        if is_fraction(item):
            found.append(item)
        elif isinstance(item, (ast.List, ast.Tuple, ast.Set)):
            pending.extend(item.elts)
        elif isinstance(item, ast.Dict):
            pending.extend(item.values)
    return found


def is_tolerant(node):
    return isinstance(node, ast.Call) and last_name(node.func) == "approx"


def compared_pairs(compare):
    operands = [compare.left, *compare.comparators]
    return [
        (operands[index], operands[index + 1])
        for index, op in enumerate(compare.ops)
        if isinstance(op, EQUALITY)
    ]


def pairs_within(expression):
    return [
        pair
        for compare in ast.walk(expression)
        if isinstance(compare, ast.Compare)
        for pair in compared_pairs(compare)
    ]


def method_pairs(call):
    if not isinstance(call.func, ast.Attribute) or not call.args:
        return []
    method = call.func.attr
    if method in EQUALITY_METHODS and len(call.args) >= 2:
        return [(call.args[0], call.args[1])]
    if method in TRUTH_METHODS:
        return pairs_within(call.args[0])
    return []


def equality_pairs(node):
    if isinstance(node, ast.Assert):
        return pairs_within(node.test)
    if isinstance(node, ast.Call):
        return method_pairs(node)
    return []


def exact_fractions(pair):
    if any(is_tolerant(side) for side in pair):
        return []
    return [literal for side in pair for literal in fractions_in(side)]


def subject(context, literal):
    return ast.get_source_segment(context.text, literal) or repr(literal.value)


def check(context):
    if not context.tests:
        return []
    return [
        finding(context.path, RULE, subject(context, literal), literal)
        for node in ast.walk(context.tree)
        for pair in equality_pairs(node)
        for literal in exact_fractions(pair)
    ]
