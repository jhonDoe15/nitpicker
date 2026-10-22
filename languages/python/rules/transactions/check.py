import ast

from checks.common import finding, walk_statements
from effects.tables import DATABASE, REMOTE, WRITE
from smells.io_index import IoScope, io_index
from transactions.scopes import held_scopes

TRANSACTION_RULE = "remote-call-in-transaction"
LOCK_RULE = "remote-call-under-lock"
RULES = {"transaction": TRANSACTION_RULE, "lock": LOCK_RULE}


def calls_in(body):
    nodes = [node for node in walk_statements(body) if isinstance(node, ast.Call)]
    receivers = {
        id(node.func.value) for node in nodes if isinstance(node.func, ast.Attribute)
    }
    return sorted(
        (node for node in nodes if id(node) not in receivers),
        key=lambda node: (node.lineno, node.col_offset),
    )


def holds_connection(effects_by_call):
    return any(DATABASE in effects or WRITE in effects for effects in effects_by_call)


def scope_findings(held, scope, context, seen):
    calls = calls_in(held.body)
    effects = [scope.effects(call) for call in calls]
    if held.kind == "transaction" and not holds_connection(effects):
        return []
    found = []
    for call, call_effects in zip(calls, effects):
        key = (held.kind, id(call))
        if REMOTE not in call_effects or key in seen:
            continue
        seen.add(key)
        subject = f"{' > '.join(call_effects[REMOTE])}|{held.label}"
        found.append(finding(context.path, RULES[held.kind], subject, call))
    return found


def check(context):
    if context.tests:
        return []
    scope = IoScope(context, io_index(context.project))
    found, seen = [], set()
    for held in held_scopes(context, scope):
        found.extend(scope_findings(held, scope, context, seen))
    return found
