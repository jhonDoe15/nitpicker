import ast

from checks.common import call_name, finding, last_name
from honesty.sleeps import SCOPES, is_zero

RULE = "negative-wait-in-test"
TIMEOUT_ERRORS = {"TimeoutError", "Empty", "TimeoutExpired"}
RAISES = {"raises", "assertRaises"}
DELAY_FIRST = {"wait", "timeout", "fail_after"}
FALSE_RESULTS = {"wait", "acquire"}


def delay_of(call):
    timeout = next((k.value for k in call.keywords if k.arg == "timeout"), None)
    if timeout is not None:
        return timeout
    name = last_name(call.func)
    if name == "wait_for" and len(call.args) > 1:
        return call.args[1]
    if name in DELAY_FIRST and call.args:
        return call.args[0]
    return None


def is_wait(node):
    if not isinstance(node, ast.Call):
        return False
    delay = delay_of(node)
    unbounded = isinstance(delay, ast.Constant) and delay.value is None
    return delay is not None and not unbounded and not is_zero(delay)


def expects_timeout(item):
    call = item.context_expr
    if not (
        isinstance(call, ast.Call) and last_name(call.func) in RAISES and call.args
    ):
        return False
    expected = call.args[0]
    names = expected.elts if isinstance(expected, ast.Tuple) else [expected]
    return any(last_name(name) in TIMEOUT_ERRORS for name in names)


def first_wait(statements):
    pending = list(reversed(statements))
    while pending:
        node = pending.pop()
        if isinstance(node, SCOPES):
            continue
        if is_wait(node):
            return node
        pending.extend(reversed(list(ast.iter_child_nodes(node))))
    return None


def waits_out(node):
    return node if is_wait(node) and last_name(node.func) in FALSE_RESULTS else None


def is_false(node):
    return isinstance(node, ast.Constant) and node.value is False


def false_wait(test):
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return waits_out(test.operand)
    if (
        isinstance(test, ast.Compare)
        and len(test.ops) == 1
        and is_false(test.comparators[0])
    ):
        return (
            waits_out(test.left) if isinstance(test.ops[0], (ast.Is, ast.Eq)) else None
        )
    return None


def negative_wait(node):
    if isinstance(node, (ast.With, ast.AsyncWith)) and any(
        map(expects_timeout, node.items)
    ):
        return first_wait(node.body)
    if isinstance(node, ast.Assert):
        return false_wait(node.test)
    if (
        isinstance(node, ast.Call)
        and last_name(node.func) == "assertFalse"
        and node.args
    ):
        return waits_out(node.args[0])
    return None


def check(context):
    if not context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        wait = negative_wait(node)
        if wait is not None:
            subject = call_name(wait, context.aliases) or last_name(wait.func)
            found.append(finding(context.path, RULE, subject, wait))
    return found
