import ast

from checks.common import dotted_name
from waits.sinks.files import (
    acquire_label,
    getter_label,
    path_label,
    tls_label,
    with_label,
)
from waits.sinks.orm import iteration_label, terminal_label

LOOP_GETTER = "asyncio.get_event_loop"
CALL_LABELS = (terminal_label, tls_label, path_label, acquire_label, getter_label)


def call_label(call, context):
    if isinstance(context.parents.get(id(call)), ast.Await):
        return None
    for label in CALL_LABELS:
        found = label(call, context)
        if found is not None:
            return found
    return None


def reached_label(node, context):
    if isinstance(node, ast.Call):
        return call_label(node, context)
    return with_label(node, context) or iteration_label(node, context)


def direct_label(node, context):
    if isinstance(node, ast.Call):
        if dotted_name(node.func, context.aliases) == LOOP_GETTER:
            return LOOP_GETTER
        return call_label(node, context) or iteration_label(node, context)
    return with_label(node, context) or iteration_label(node, context)
