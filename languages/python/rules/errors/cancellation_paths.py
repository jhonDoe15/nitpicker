import ast

from errors.cancellation_names import binds, resolved_name

NEXT = "next"
PROPAGATED = "propagated"
LOST = "lost"
UNKNOWN = "unknown"
BREAK = "break"
CONTINUE = "continue"
ASYNCIO_CANCELLED = {"asyncio.CancelledError", "asyncio.exceptions.CancelledError"}


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
        if resolved_name(target, context) in ASYNCIO_CANCELLED:
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


def try_outcomes(node, error, context, caught):
    pending = {UNKNOWN} if node.handlers else block_outcomes(node.body, error, context, caught)
    if not node.finalbody:
        return pending
    final = block_outcomes(node.finalbody, error, context, caught)
    return (pending if NEXT in final else set()) | (final - {NEXT})


def loop_outcomes(node, error, context, caught):
    body = block_outcomes(node.body, error, context, caught)
    forever = (
        isinstance(node, ast.While)
        and isinstance(node.test, ast.Constant)
        and bool(node.test.value)
    )
    result = body - {NEXT, BREAK, CONTINUE}
    if BREAK in body:
        result.add(NEXT)
    if not forever:
        result |= block_outcomes(node.orelse, error, context, caught)
    return result


def irrefutable(case):
    return (
        case.guard is None
        and isinstance(case.pattern, ast.MatchAs)
        and case.pattern.pattern is None
    )


def match_outcomes(node, error, context, caught):
    result = set()
    for case in node.cases:
        result |= block_outcomes(case.body, error, context, caught)
    if not any(irrefutable(case) for case in node.cases):
        result.add(UNKNOWN)
    return result


def branch_outcomes(node, error, context, caught):
    if isinstance(node.test, ast.Constant):
        branch = node.body if node.test.value else node.orelse
        return block_outcomes(branch, error, context, caught)
    return block_outcomes(node.body, error, context, caught) | block_outcomes(
        node.orelse, error, context, caught
    )


def statement_outcomes(node, error, context, caught):
    if isinstance(node, ast.Raise):
        return {raise_outcome(node, error, context, caught)}
    if isinstance(node, ast.Return):
        return {LOST}
    if isinstance(node, ast.Break):
        return {BREAK}
    if isinstance(node, ast.Continue):
        return {CONTINUE}
    if isinstance(node, ast.If):
        return branch_outcomes(node, error, context, caught)
    if isinstance(node, ast.Try):
        return try_outcomes(node, error, context, caught)
    if isinstance(node, (ast.With, ast.AsyncWith)):
        body = block_outcomes(node.body, error, context, caught)
        return (body - {PROPAGATED}) | ({UNKNOWN} if PROPAGATED in body else set())
    if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
        return loop_outcomes(node, error, context, caught)
    if isinstance(node, ast.Match):
        return match_outcomes(node, error, context, caught)
    if type(node).__name__ == "TryStar":
        return {UNKNOWN}
    return {NEXT}


def binds_error(node, name):
    return binds(node, name) or (
        isinstance(node, (ast.Import, ast.ImportFrom))
        and any(
            (alias.asname or alias.name.split(".")[0]) == name for alias in node.names
        )
    )
