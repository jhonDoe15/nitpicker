import ast
import re

from checks.common import is_log_call, last_name

PLACEHOLDER = re.compile(
    r"%[-#0 +]*[0-9.*]*[sdrifxXeEgGc]|\{[\w.]*(?:![rsa])?(?::[^{}]*)?\}"
)
EXCEPTION_NAME = re.compile(r"(?:Error|Exception|Warning)$")


def is_text(node):
    return isinstance(node, ast.JoinedStr) or (
        isinstance(node, ast.Constant) and isinstance(node.value, str)
    )


def is_message_tuple(node):
    if not (isinstance(node, ast.Tuple) and node.elts):
        return False
    first = node.elts[0]
    has_placeholder = (
        isinstance(first, ast.Constant)
        and isinstance(first.value, str)
        and PLACEHOLDER.search(first.value) is not None
    )
    return has_placeholder or (len(node.elts) == 1 and is_text(first))


def message_arguments(call, context):
    if is_log_call(call, context.aliases):
        is_level_call = call.func.attr == "log"
        return call.args[1:2] if is_level_call else call.args[:1]
    name = last_name(call.func)
    if name is not None and EXCEPTION_NAME.search(name):
        return call.args[:1]
    return []


def tuple_assignments(nodes):
    counts = {}
    for node in nodes:
        for item in ast.walk(node) if isinstance(node, ast.Assign) else []:
            if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Store):
                counts[item.id] = counts.get(item.id, 0) + 1
    return {
        node.targets[0].id
        for node in nodes
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and counts[node.targets[0].id] == 1
        and is_message_tuple(node.value)
    }


def message_tuples(nodes, context):
    names = tuple_assignments(nodes)
    for node in nodes:
        if not isinstance(node, ast.Call):
            continue
        for argument in message_arguments(node, context):
            is_name = isinstance(argument, ast.Name) and argument.id in names
            if is_message_tuple(argument) or is_name:
                yield argument
