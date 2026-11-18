import ast
import re

from checks.common import finding, shown, string_value

RULE = "pair-split-drops-rest"
SEPARATORS = {":", "="}
CLOCK_NAME = re.compile(r"time|clock|duration|hhmm|ratio|aspect", re.I)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def last_name(node):
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Call):
        return last_name(node.func)
    if isinstance(node, ast.Subscript):
        return last_name(node.value)
    return ""


def pair_split(node):
    if not (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "split"
        and len(node.args) == 1
        and not node.keywords
    ):
        return None
    receiver = node.func.value
    if (
        string_value(node.args[0]) not in SEPARATORS
        or isinstance(receiver, ast.Constant)
        or CLOCK_NAME.search(last_name(receiver))
    ):
        return None
    return node


def index_of(node):
    if isinstance(node, ast.Constant) and node.value == 1:
        return "one"
    if isinstance(node, ast.Slice) and node.lower is None and node.step is None:
        if isinstance(node.upper, ast.Constant) and node.upper.value == 2:
            return "two"
    return None


def scope_of(node, parents):
    while id(node) in parents:
        node = parents[id(node)]
        if isinstance(node, FUNCTIONS):
            return node
    return node


def length_checked(scope, name):
    for node in ast.walk(scope):
        if isinstance(node, ast.Compare):
            sides = [node.left, *node.comparators]
            sized = any(
                isinstance(side, ast.Call)
                and isinstance(side.func, ast.Name)
                and side.func.id == "len"
                and side.args
                and ast.unparse(side.args[0]) == name
                for side in sides
            )
            numbers = [side.value for side in sides if isinstance(side, ast.Constant)]
            ordered = all(isinstance(each, (ast.Lt, ast.LtE)) for each in node.ops)
            if sized and 2 in numbers and not ordered:
                return True
        if (
            isinstance(node, ast.Subscript)
            and isinstance(node.slice, ast.Slice)
            and ast.unparse(node.value) == name
            and node.slice.lower is not None
        ):
            return True
    return False


def named_splits(context):
    for node in ast.walk(context.tree):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and pair_split(node.value)
        ):
            yield node.targets[0].id, node


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Subscript) and pair_split(node.value):
            if index_of(node.slice) is not None:
                subject = shown(ast.unparse(node.value))
                found.append(finding(context.path, RULE, subject, node))
    for name, assign in named_splits(context):
        scope = scope_of(assign, context.parents)
        reads = any(
            isinstance(node, ast.Subscript)
            and isinstance(node.value, ast.Name)
            and node.value.id == name
            and index_of(node.slice) == "one"
            for node in ast.walk(scope)
        )
        if reads and not length_checked(scope, name):
            subject = shown(ast.unparse(assign.value))
            found.append(finding(context.path, RULE, subject, assign.value))
    return found
