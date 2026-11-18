import ast

from checks.common import dotted_name, walk_statements
from effect_kinds.tables import DATABASE, REMOTE
from kinds.sites import outer_calls
from transactions.scopes import TRANSACTIONS

LOOPS = (ast.For, ast.AsyncFor)
TRIES = (ast.Try, getattr(ast, "TryStar", ast.Try))
SUPPRESSORS = {"contextlib.suppress"}
LITERALS = (ast.List, ast.Tuple, ast.Set, ast.Dict)
COUNTERS = {"range", "count"}
TRANSACTION_METHODS = {"atomic", "begin", "begin_nested", "transaction"}


def ancestors(node, parents, stop):
    child = node
    parent = parents.get(id(child))
    while parent is not None and parent is not stop:
        yield child, parent
        child, parent = parent, parents.get(id(parent))


def last_name(node):
    if isinstance(node, ast.Call):
        node = node.func
    return node.id if isinstance(node, ast.Name) else getattr(node, "attr", None)


def retries_item(statement):
    exc = statement.exc
    return isinstance(exc, ast.Call) and getattr(exc.func, "attr", None) == "retry"


def recovers(handler):
    return not any(
        isinstance(statement, ast.Raise) and not retries_item(statement)
        for statement in handler.body
    )


def isolates(child, parent, aliases):
    if isinstance(parent, TRIES):
        return child in parent.body and any(recovers(h) for h in parent.handlers)
    if isinstance(parent, (ast.With, ast.AsyncWith)):
        return child in parent.body and any(
            isinstance(item.context_expr, ast.Call)
            and dotted_name(item.context_expr.func, aliases) in SUPPRESSORS
            for item in parent.items
        )
    return False


def is_isolated(call, loop, context):
    return any(
        isolates(child, parent, context.aliases)
        for child, parent in ancestors(call, context.parents, loop)
    )


def is_literal_loop(loop):
    if isinstance(loop.iter, ast.Call):
        return last_name(loop.iter.func) in COUNTERS
    return isinstance(loop.iter, LITERALS)


def in_transaction(loop, context):
    for _child, parent in ancestors(loop, context.parents, None):
        if isinstance(parent, (ast.With, ast.AsyncWith)):
            for item in parent.items:
                expression = item.context_expr
                call = (
                    expression.func if isinstance(expression, ast.Call) else expression
                )
                if dotted_name(call, context.aliases) in TRANSACTIONS:
                    return True
                if last_name(call) in TRANSACTION_METHODS:
                    return True
    return False


def per_item_calls(loop, scope):
    found = []
    for call in outer_calls(walk_statements(loop.body)):
        effects = scope.effects(call)
        if DATABASE in effects or REMOTE in effects:
            found.append(call)
    return found


def unisolated_call(loop, scope, context):
    if is_literal_loop(loop) or in_transaction(loop, context):
        return None
    return next(
        (c for c in per_item_calls(loop, scope) if not is_isolated(c, loop, context)),
        None,
    )


def outer_loops(function, parents):
    loops = [n for n in walk_statements(function.body) if isinstance(n, LOOPS)]
    return [
        loop
        for loop in loops
        if not any(
            isinstance(parent, LOOPS) and child in parent.body
            for child, parent in ancestors(loop, parents, function)
        )
    ]
