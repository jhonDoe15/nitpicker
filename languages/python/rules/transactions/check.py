import ast

from checks.common import finding, walk_statements
from effects.tables import DATABASE, REMOTE, WRITE
from kinds.index import io_scope
from kinds.sites import outer_calls
from transactions.scopes import held_scopes

TRANSACTION_RULE = "remote-call-in-transaction"
LOCK_RULE = "remote-call-under-lock"
RULES = {"transaction": TRANSACTION_RULE, "lock": LOCK_RULE}
RULE = f"{TRANSACTION_RULE} and {LOCK_RULE}"
WRITE_MODES = ("w", "a", "x")
PATH_WRITES = {"write_text", "write_bytes", "touch", "mkdir"}


def calls_in(body):
    return outer_calls(walk_statements(body))


def state_text(node):
    if isinstance(node, ast.Subscript):
        return state_text(node.value)
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = state_text(node.value)
        return f"{base}.{node.attr}" if base else None
    return None


def read_state(test):
    return {state_text(n) for n in ast.walk(test) if isinstance(n, ast.Name)} | {
        state_text(n) for n in ast.walk(test) if isinstance(n, ast.Attribute)
    }


def opened_for_writing(call):
    if not (isinstance(call.func, ast.Name) and call.func.id == "open" and call.args):
        return False
    modes = call.args[1:2] + [k.value for k in call.keywords if k.arg == "mode"]
    return any(
        isinstance(mode, ast.Constant) and str(mode.value).startswith(WRITE_MODES)
        for mode in modes
    )


def written_targets(node):
    if isinstance(node, ast.Assign):
        return node.targets
    if isinstance(node, (ast.AugAssign, ast.AnnAssign)):
        return [node.target]
    if isinstance(node, ast.Call) and opened_for_writing(node):
        return [node.args[0]]
    function = node.func if isinstance(node, ast.Call) else None
    if isinstance(function, ast.Attribute) and function.attr in PATH_WRITES:
        return [function.value]
    return []


def written_state(body):
    return {
        state_text(target)
        for node in walk_statements(body)
        for target in written_targets(node)
    }


def single_flight(call, held, parents):
    node = call
    while not any(node is statement for statement in held.body):
        parent = parents.get(id(node))
        if parent is None:
            return False
        if isinstance(parent, ast.If) and any(node is s for s in parent.body):
            if (read_state(parent.test) & written_state(parent.body)) - {None}:
                return True
        node = parent
    return False


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
        if held.kind == "lock" and single_flight(call, held, context.parents):
            continue
        seen.add(key)
        subject = f"{' > '.join(call_effects[REMOTE])}|{held.label}"
        found.append(finding(context.path, RULES[held.kind], subject, call))
    return found


def check(context):
    if context.tests:
        return []
    scope = io_scope(context)
    found, seen = [], set()
    for held in held_scopes(context, scope):
        found.extend(scope_findings(held, scope, context, seen))
    return found
