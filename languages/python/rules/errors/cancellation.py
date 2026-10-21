import ast

from checks.common import finding, own_nodes, type_text
from errors.cancellation_names import binds, caught_cancellations, resolved_name

RULE = "cancellation-not-propagated"
NEXT = "next"
PROPAGATED = "propagated"
LOST = "lost"
UNKNOWN = "unknown"


def unchanged_error(handler):
    name = handler.name
    return (
        name
        if name and not any(binds_error(node, name) for node in own_nodes(handler))
        else None
    )


def binds_error(node, name):
    return binds(node, name) or (
        isinstance(node, (ast.Import, ast.ImportFrom))
        and any(
            (alias.asname or alias.name.split(".")[0]) == name for alias in node.names
        )
    )


def same_error(node, error):
    if isinstance(node, ast.Name):
        return node.id == error
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "with_traceback"
        and same_error(node.func.value, error)
    )


def raise_outcome(node, error, context, caught):
    if node.exc is None or same_error(node.exc, error):
        return PROPAGATED
    target = node.exc.func if isinstance(node.exc, ast.Call) else node.exc
    if all(name.startswith("asyncio.") for name in caught):
        if resolved_name(target, context) in {
            "asyncio.CancelledError",
            "asyncio.exceptions.CancelledError",
        }:
            return PROPAGATED
    return LOST


def block_outcomes(statements, error, context, caught):
    outcomes = {NEXT}
    for statement in statements:
        if NEXT not in outcomes:
            break
        outcomes.remove(NEXT)
        outcomes.update(statement_outcomes(statement, error, context, caught))
    return outcomes


def final_outcomes(node, error, context, caught):
    pending = block_outcomes(node.body, error, context, caught)
    if node.handlers:
        pending = {UNKNOWN}
    elif node.orelse and NEXT in pending:
        pending.remove(NEXT)
        pending.update(block_outcomes(node.orelse, error, context, caught))
    if not node.finalbody:
        return pending
    final = block_outcomes(node.finalbody, error, context, caught)
    return (pending if NEXT in final else set()) | (final - {NEXT})


def statement_outcomes(node, error, context, caught):
    if isinstance(node, ast.Raise):
        return {raise_outcome(node, error, context, caught)}
    if isinstance(node, (ast.Return, ast.Break, ast.Continue)):
        return {LOST}
    if isinstance(node, ast.If):
        if isinstance(node.test, ast.Constant):
            branch = node.body if node.test.value else node.orelse
            return block_outcomes(branch, error, context, caught)
        return block_outcomes(node.body, error, context, caught) | block_outcomes(
            node.orelse, error, context, caught
        )
    if isinstance(node, ast.Try):
        return final_outcomes(node, error, context, caught)
    if isinstance(node, (ast.With, ast.AsyncWith)):
        body = block_outcomes(node.body, error, context, caught)
        return (body - {PROPAGATED}) | ({UNKNOWN} if PROPAGATED in body else set())
    if type(node).__name__ == "TryStar":
        return {UNKNOWN}
    if isinstance(node, (ast.For, ast.AsyncFor, ast.While, ast.Match)):
        return {UNKNOWN}
    return {NEXT}


def cancellation_finding(handler, context):
    if type(context.parents.get(id(handler))).__name__ == "TryStar":
        return None
    caught = caught_cancellations(handler, context)
    if not caught:
        return None
    outcomes = block_outcomes(handler.body, unchanged_error(handler), context, caught)
    if not outcomes & {NEXT, LOST}:
        return None
    subject = f"except {type_text(handler.type)}"
    return finding(context.path, RULE, subject, handler)
