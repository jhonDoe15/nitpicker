import ast

from nitpicker_checks.common import dotted_name, finding

FIXED_SLEEPS = {"time.sleep", "asyncio.sleep", "trio.sleep", "anyio.sleep", "gevent.sleep"}
DELAY_KEYWORDS = {"seconds", "secs", "delay"}
PLAYWRIGHT_TIMEOUT = "wait_for_timeout"
LOOPS = (ast.For, ast.AsyncFor, ast.While)
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)


def delay_of(call):
    if call.args:
        return call.args[0]
    return next((k.value for k in call.keywords if k.arg in DELAY_KEYWORDS), None)


def is_zero(node):
    return (
        isinstance(node, ast.Constant)
        and not isinstance(node.value, bool)
        and isinstance(node.value, (int, float))
        and node.value == 0
    )


def sleep_name(call, aliases):
    if isinstance(call.func, ast.Attribute) and call.func.attr == PLAYWRIGHT_TIMEOUT:
        return PLAYWRIGHT_TIMEOUT
    name = dotted_name(call.func, aliases)
    if name not in FIXED_SLEEPS:
        return None
    delay = delay_of(call)
    return None if delay is None or is_zero(delay) else name


def calls_outside_loops(tree):
    pending = [(tree, False)]
    while pending:
        node, in_loop = pending.pop()
        if isinstance(node, ast.Call):
            yield node, in_loop
        for child in ast.iter_child_nodes(node):
            if isinstance(child, SCOPES):
                pending.append((child, False))
            else:
                pending.append((child, in_loop or isinstance(node, LOOPS)))


def fixed_sleep_findings(path, tree, aliases):
    found = []
    for call, in_loop in calls_outside_loops(tree):
        name = sleep_name(call, aliases)
        polls = in_loop and name != PLAYWRIGHT_TIMEOUT
        if name is not None and not polls:
            found.append(finding("fixed-sleep", path, name, call.lineno))
    return found
