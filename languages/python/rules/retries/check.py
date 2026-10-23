import ast

from checks.common import finding, walk_statements
from effects.tables import UNSAFE_KINDS
from kinds.index import io_scope
from kinds.sites import outer_calls
from retries.scopes import retry_scopes
from smells.loops import enclosing_loop, is_retry_attempt

RULE = "retry-without-idempotency"
HAND_WRITTEN = "retry loop"


def unsafe_write(effects):
    for tag, label in UNSAFE_KINDS.items():
        if tag in effects:
            return label, effects[tag]
    return None


def report(context, node, written, scope_label):
    label, path = written
    subject = f"{' > '.join(path)}|{label}|{scope_label}"
    return finding(context.path, RULE, subject, node)


def scoped_findings(context, scope, seen):
    found = []
    for retry in retry_scopes(context):
        if retry.callable is not None:
            effects = scope.reference_effects(retry.callable, retry.call)
            written = unsafe_write(effects)
            if written and id(retry.callable) not in seen:
                seen.add(id(retry.callable))
                found.append(report(context, retry.callable, written, retry.label))
        for call in outer_calls(walk_statements(retry.body)):
            written = unsafe_write(scope.effects(call))
            if written and id(call) not in seen:
                seen.add(id(call))
                found.append(report(context, call, written, retry.label))
    return found


def loop_findings(context, scope, seen):
    found = []
    for call in outer_calls(ast.walk(context.tree)):
        written = unsafe_write(scope.effects(call))
        if not written or id(call) in seen:
            continue
        loop = enclosing_loop(call, context.parents)
        if loop is not None and is_retry_attempt(call, loop, context.parents):
            found.append(report(context, call, written, HAND_WRITTEN))
    return found


def check(context):
    if context.tests:
        return []
    scope = io_scope(context)
    seen = set()
    found = scoped_findings(context, scope, seen)
    return found + loop_findings(context, scope, seen)
