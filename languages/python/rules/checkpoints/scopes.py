import ast

from checkpoints.effects import module_coroutines, quiet_coroutines, sees_checkpoint
from checkpoints.paths import CLEAN, Analysis, is_dirty
from checks.common import dotted_name, finding

RULE = "timeout-scope-path-without-checkpoint"
DEADLINE_SCOPES = {
    "asyncio.timeout",
    "asyncio.timeout_at",
    "trio.fail_after",
    "trio.fail_at",
    "trio.move_on_after",
    "trio.move_on_at",
    "anyio.fail_after",
    "anyio.move_on_after",
}
CANCEL_SCOPES = {"trio.CancelScope", "anyio.CancelScope"}
WAIT_FOR = "asyncio.wait_for"
LEAVING = ("normal", "return", "break", "continue")


def keyword(call, name):
    return next((item.value for item in call.keywords if item.arg == name), None)


def is_shield_only(call):
    shield = keyword(call, "shield")
    shielded = isinstance(shield, ast.Constant) and shield.value is True
    return shielded and keyword(call, "deadline") is None


def scope_name(item, aliases):
    call = item.context_expr
    if not isinstance(call, ast.Call):
        return None
    name = dotted_name(call.func, aliases)
    if name in DEADLINE_SCOPES:
        return name
    return name if name in CANCEL_SCOPES and not is_shield_only(call) else None


def offending_work(analysis, statements):
    exits = analysis.block(statements, {CLEAN})
    states = {state for kind in LEAVING for state in exits[kind]}
    work = sorted(state for state in states if is_dirty(state))
    return work[0].split(":", 1)[1] if work else None


def with_scopes(context, analysis):
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, (ast.With, ast.AsyncWith)):
            continue
        names = [scope_name(item, context.aliases) for item in node.items]
        scope = next((name for name in names if name), None)
        if scope is None or not sees_checkpoint(node.body):
            continue
        work = offending_work(analysis, node.body)
        if work is not None:
            found.append(finding(context.path, RULE, f"{scope}: {work}()", node))
    return found


def wait_for_target(call, aliases, coroutines):
    if dotted_name(call.func, aliases) != WAIT_FOR or not call.args:
        return None
    awaited = call.args[0]
    if isinstance(awaited, ast.Call) and isinstance(awaited.func, ast.Name):
        return coroutines.get(awaited.func.id)
    return None


def wait_for_scopes(context, analysis, coroutines):
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        target = wait_for_target(node, context.aliases, coroutines)
        work = offending_work(analysis, target.body) if target else None
        if work is not None:
            subject = f"{WAIT_FOR}({target.name}): {work}()"
            found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    if context.tests:
        return []
    analysis = Analysis(context.aliases, quiet_coroutines(context.tree))
    coroutines = module_coroutines(context.tree)
    return with_scopes(context, analysis) + wait_for_scopes(context, analysis, coroutines)
