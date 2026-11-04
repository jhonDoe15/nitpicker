import ast
import operator

from checks.common import dotted_name

UNKNOWN = object()
MAX_DEPTH = 40
MAX_NAME_HOPS = 8
VERSION_NAME = "sys.version_info"
BINARY = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.BitAnd: operator.and_,
    ast.BitOr: operator.or_,
    ast.BitXor: operator.xor,
}
UNARY = {
    ast.Not: operator.not_,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.Invert: operator.invert,
}
COMPARE = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
    ast.In: lambda left, right: left in right,
    ast.NotIn: lambda left, right: left not in right,
}
CALLS = {"bool": bool, "int": int, "float": float, "str": str, "len": len}
ORDER_ONLY = (ast.Lt, ast.LtE, ast.Gt, ast.GtE)
SWAPPED = {ast.Lt: ast.Gt, ast.LtE: ast.GtE, ast.Gt: ast.Lt, ast.GtE: ast.LtE}


def assignment_counts(tree):
    counts = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            counts[node.id] = counts.get(node.id, 0) + 1
    return counts


def module_constants(tree):
    counts = assignment_counts(tree)
    found = {}
    for statement in tree.body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target, value = statement.targets[0], statement.value
        elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
            target, value = statement.target, statement.value
        else:
            continue
        if isinstance(target, ast.Name) and counts.get(target.id) == 1:
            found[target.id] = value
    return found


def unknown(values):
    return any(value is UNKNOWN for value in values)


class Folder:
    def __init__(self, tree, aliases, minimum_python=None):
        self.names = module_constants(tree)
        self.aliases = aliases
        self.minimum_python = minimum_python

    def fold(self, node, depth=0, hops=0):
        if depth > MAX_DEPTH:
            return UNKNOWN
        try:
            return self.evaluate(node, depth + 1, hops)
        except (TypeError, ValueError, ArithmeticError, MemoryError, OverflowError):
            return UNKNOWN

    def evaluate(self, node, depth, hops):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            value = self.names.get(node.id)
            if value is None or hops >= MAX_NAME_HOPS:
                return UNKNOWN
            return self.fold(value, depth, hops + 1)
        if isinstance(node, (ast.Tuple, ast.List)):
            items = [self.fold(item, depth, hops) for item in node.elts]
            return UNKNOWN if unknown(items) else tuple(items)
        if isinstance(node, ast.UnaryOp):
            value = self.fold(node.operand, depth, hops)
            return UNKNOWN if value is UNKNOWN else UNARY[type(node.op)](value)
        if isinstance(node, ast.BinOp):
            return self.binary(node, depth, hops)
        if isinstance(node, ast.BoolOp):
            return self.boolean(node, depth, hops)
        if isinstance(node, ast.Compare):
            return self.compare(node, depth, hops)
        if isinstance(node, ast.IfExp):
            test = self.fold(node.test, depth, hops)
            if test is UNKNOWN:
                return UNKNOWN
            return self.fold(node.body if test else node.orelse, depth, hops)
        if isinstance(node, ast.Call):
            return self.call(node, depth, hops)
        return UNKNOWN

    def binary(self, node, depth, hops):
        operation = BINARY.get(type(node.op))
        left = self.fold(node.left, depth, hops)
        right = self.fold(node.right, depth, hops)
        if operation is None or unknown([left, right]):
            return UNKNOWN
        return operation(left, right)

    def boolean(self, node, depth, hops):
        stop_on = isinstance(node.op, ast.Or)
        value = UNKNOWN
        for operand in node.values:
            value = self.fold(operand, depth, hops)
            if value is UNKNOWN or bool(value) == stop_on:
                return value
        return value

    def call(self, node, depth, hops):
        name = node.func.id if isinstance(node.func, ast.Name) else None
        if name not in CALLS or len(node.args) != 1 or node.keywords:
            return UNKNOWN
        value = self.fold(node.args[0], depth, hops)
        return UNKNOWN if value is UNKNOWN else CALLS[name](value)

    def compare(self, node, depth, hops):
        versioned = self.version_compare(node)
        if versioned is not UNKNOWN:
            return versioned
        values = [self.fold(part, depth, hops) for part in [node.left, *node.comparators]]
        if unknown(values):
            return UNKNOWN
        for index, op in enumerate(node.ops):
            if not COMPARE[type(op)](values[index], values[index + 1]):
                return False
        return True

    def version_compare(self, node):
        if self.minimum_python is None or len(node.ops) != 1:
            return UNKNOWN
        left, right = node.left, node.comparators[0]
        op = type(node.ops[0])
        if self.is_version(right) and not self.is_version(left):
            left, right, op = right, left, SWAPPED.get(op)
        if op not in ORDER_ONLY or not self.is_version(left):
            return UNKNOWN
        bound = self.fold(right)
        if not isinstance(bound, tuple) or not all(isinstance(i, int) for i in bound):
            return UNKNOWN
        minimum = (*self.minimum_python, 0, "final", 0)
        holds = COMPARE[op](minimum, bound)
        if holds == (op in (ast.Gt, ast.GtE)):
            return holds
        return UNKNOWN

    def is_version(self, node):
        return dotted_name(node, self.aliases) == VERSION_NAME

    def condition(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            try:
                expression = ast.parse(node.value.strip(), mode="eval").body
            except (SyntaxError, ValueError, RecursionError):
                return UNKNOWN
            return self.fold(expression)
        return self.fold(node)

    def is_literal(self, node):
        return self.condition(node) is not UNKNOWN

    def truthiness(self, node):
        value = self.condition(node)
        return None if value is UNKNOWN else bool(value)
