import ast

from checks.common import finding, own_nodes, type_text
from errors.cancellation.names import (
    caught_cancellations,
    caught_types,
    cancellation_type,
    resolved_name,
)
from errors.cancellation.paths import (
    BREAK,
    CONTINUE,
    LOST,
    NEXT,
    binds_error,
    block_outcomes,
)
from errors.cancellation.tasks import awaits_cancelled, is_async, quiet

RULE = "cancellation-not-propagated"
CONSUMING = {NEXT, LOST, BREAK, CONTINUE}


def comprehension_targets(handler):
    return {
        id(part)
        for node in ast.walk(handler)
        if isinstance(node, ast.comprehension)
        for part in ast.walk(node.target)
    }


def unchanged_error(handler):
    name = handler.name
    if not name:
        return None
    skipped = comprehension_targets(handler)
    rebound = any(
        binds_error(node, name)
        for node in own_nodes(handler)
        if id(node) not in skipped
    )
    return None if rebound else name


def subject_text(node):
    if isinstance(node, ast.Call):
        return f"{type_text(node.func)}()"
    if isinstance(node, ast.Tuple):
        return "(" + ", ".join(subject_text(part) for part in node.elts) + ")"
    return type_text(node)


def only_cancellations(types, context):
    kinds = [cancellation_type(node, context) for node in types]
    return bool(kinds) and all(kind and kind.startswith("asyncio.") for kind in kinds)


def awaits_cancelled_task(handler, context):
    block = context.parents.get(id(handler))
    return (
        isinstance(block, ast.Try)
        and is_async(handler, context)
        and only_cancellations(caught_types(handler), context)
        and quiet(handler.body, context)
        and awaits_cancelled(block, block.body, context)
    )


def cancellation_finding(handler, context):
    if type(context.parents.get(id(handler))).__name__ == "TryStar":
        return None
    if handler.type is None or not is_async(handler, context):
        return None
    caught = caught_cancellations(handler, context)
    if not caught:
        return None
    outcomes = block_outcomes(handler.body, unchanged_error(handler), context, caught)
    if not outcomes & CONSUMING:
        return None
    return finding(context.path, RULE, f"except {subject_text(handler.type)}", handler)


def suppress_finding(call, context):
    if resolved_name(call.func, context) != "contextlib.suppress":
        return None
    item = context.parents.get(id(call))
    block = context.parents.get(id(item))
    if not isinstance(block, (ast.With, ast.AsyncWith)) or not is_async(call, context):
        return None
    if not any(cancellation_type(node, context) for node in call.args):
        return None
    if only_cancellations(call.args, context) and awaits_cancelled(
        block, block.body, context
    ):
        return None
    subject = f"suppress({', '.join(subject_text(node) for node in call.args)})"
    return finding(context.path, RULE, subject, call)
