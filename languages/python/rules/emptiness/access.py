import ast

from checks.common import finding, shown
from emptiness.guards import is_caught, is_guarded
from emptiness.origins import is_emptiable, source_names
from signatures.annotations import FUNCTION_TYPES
from truthiness.numbers import scope_nodes

RULE = "empty-sequence-access"
GUARDED = True
EXTREMES = {"min", "max"}
ENDS = {0, -1}


def is_extreme_call(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in EXTREMES
        and len(node.args) == 1
        and not isinstance(node.args[0], ast.Starred)
        and all(keyword.arg not in {"default", None} for keyword in node.keywords)
    )


def end_index(node):
    index = node.slice
    if isinstance(index, ast.UnaryOp) and isinstance(index.op, ast.USub):
        index, sign = index.operand, -1
    else:
        sign = 1
    is_int = isinstance(index, ast.Constant) and type(index.value) is int
    return sign * index.value in ENDS if is_int else False


def accessed_value(node):
    if is_extreme_call(node):
        return node.args[0]
    is_end = (
        isinstance(node, ast.Subscript)
        and isinstance(node.ctx, ast.Load)
        and end_index(node)
    )
    return node.value if is_end else None


def subject_text(node):
    text = ast.unparse(node).replace("\n", " ")
    if (
        is_extreme_call(node)
        and not node.keywords
        and isinstance(node.args[0], ast.GeneratorExp)
    ):
        return text.replace("((", "(", 1).replace("))", ")", 1)
    return text


def function_findings(function, context):
    nodes = list(scope_nodes(function))
    names = source_names(function, nodes, context)
    found = []
    for node in nodes:
        value = accessed_value(node)
        if value is None:
            continue
        if isinstance(value, ast.Name):
            risky = value.id in names and not is_guarded(node, value.id, context)
        else:
            risky = is_emptiable(value, context) and not is_caught(node, context, value)
        if risky:
            subject = shown(subject_text(node), 60)
            found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    if context.tests:
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
