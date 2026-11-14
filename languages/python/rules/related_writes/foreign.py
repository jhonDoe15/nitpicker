import ast

from checks.common import finding
from kinds.names import call_text
from related_writes.units import direct_writes, session_base, spans

RULE = "write-outside-transaction"
DEFAULT_ALIAS = "default"


def bound_names(function):
    names = set()
    for node in ast.walk(function):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)):
            targets = [node.target]
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            targets = [node.target]
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            targets = [i.optional_vars for i in node.items if i.optional_vars]
        for target in targets:
            names.update(n.id for n in ast.walk(target) if isinstance(n, ast.Name))
    return names


def literal(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def block_alias(expression):
    if not isinstance(expression, ast.Call):
        return DEFAULT_ALIAS
    for keyword in expression.keywords:
        if keyword.arg == "using" and literal(keyword.value):
            return literal(keyword.value)
    if expression.args and literal(expression.args[0]):
        return literal(expression.args[0])
    return DEFAULT_ALIAS


def requested_alias(call):
    node = call
    while isinstance(node, (ast.Call, ast.Attribute)):
        if isinstance(node, ast.Call):
            for keyword in node.keywords:
                if keyword.arg == "using" and literal(keyword.value):
                    return literal(keyword.value)
            if (
                isinstance(node.func, ast.Attribute)
                and node.func.attr == "using"
                and node.args
            ):
                return literal(node.args[0])
            node = node.func
        else:
            node = node.value
    return None


def is_other_session(call, block, bound):
    base = session_base(call)
    if base is None or base in block.owners or not block.owners:
        return False
    return base.split(".")[0] == "self" or base.split(".")[0] not in bound


def foreign_findings(function, qualified, scope, blocks, context):
    writes = direct_writes(function, scope)
    bound = bound_names(function)
    found, seen = [], set()
    for block in blocks:
        for call in writes:
            if id(call) in seen or not spans(block.node, call):
                continue
            if block.django:
                alias = requested_alias(call)
                mismatch = alias is not None and alias != block_alias(block.expression)
            else:
                mismatch = is_other_session(call, block, bound)
            if mismatch:
                seen.add(id(call))
                subject = f"{qualified}|{call_text(call)}|{block.label}"
                found.append(finding(context.path, RULE, subject, call))
    return found
