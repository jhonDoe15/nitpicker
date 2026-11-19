import ast

from checks.common import finding, functions_of, own_nodes, shown
from null_keys.guards import assigned_name, is_number, membership_reads, name_handled
from null_keys.inputs import input_names, is_source
from review.common import is_none

RULE = "null-valued-input-key"
GUARDED = True
NUMBER = "number"


def default_is_replaced(call, context):
    name = assigned_name(call, context)
    if name is not None and name_handled(name, call, context):
        return True
    parent = context.parents.get(id(call))
    if isinstance(parent, ast.BoolOp) and isinstance(parent.op, ast.Or):
        return parent.values[0] is call
    return isinstance(parent, ast.Compare) and not any(
        isinstance(op, (ast.Lt, ast.LtE, ast.Gt, ast.GtE)) for op in parent.ops
    )


def default_call(node, names, context):
    func = node.func
    if not (
        isinstance(func, ast.Attribute)
        and func.attr in {"get", "setdefault"}
        and len(node.args) == 2
        and not node.keywords
        and not is_none(node.args[1])
        and is_source(func.value, names, context)
    ):
        return None
    if func.attr == "get" and default_is_replaced(node, context):
        return None
    return func.attr


def call_subject(node, form):
    receiver = shown(ast.unparse(node.func.value))
    key = shown(ast.unparse(node.args[0]))
    kind = f"|{NUMBER}" if is_number(node.args[1]) else ""
    return f"{form}|{receiver}.{form}({key}){kind}"


def membership_subject(guard):
    return f"in|{shown(ast.unparse(guard.left))} in {shown(ast.unparse(guard.comparators[0]))}"


def function_findings(function, context):
    names = input_names(function, context)
    found = []
    for node in own_nodes(function):
        if isinstance(node, ast.Call):
            form = default_call(node, names, context)
            if form is not None:
                found.append(finding(context.path, RULE, call_subject(node, form), node))
        for guard in membership_reads(node, names, context):
            found.append(finding(context.path, RULE, membership_subject(guard), guard))
    return found


def check(context):
    if context.tests:
        return []
    found, seen = [], set()
    for function in functions_of(context.tree):
        for item in function_findings(function, context):
            key = (item["line"], item["subject"])
            if key not in seen:
                seen.add(key)
                found.append(item)
    return found
