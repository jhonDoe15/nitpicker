import ast

from nitpicker_checks.common import dotted_name, finding

FIXED_SLEEPS = {"time.sleep", "asyncio.sleep", "trio.sleep", "anyio.sleep", "gevent.sleep"}
DELAY_KEYWORDS = {"seconds", "secs", "delay"}
PLAYWRIGHT_TIMEOUT = "wait_for_timeout"
LOOPS = (ast.For, ast.AsyncFor, ast.While)
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
CONDITIONS = (ast.If, ast.Try) + tuple(
    getattr(ast, name) for name in ("TryStar", "Match") if hasattr(ast, name)
)
PATCHERS = {"unittest.mock.patch", "mock.patch"}
OBJECT_PATCHERS = {f"{name}.object" for name in PATCHERS}
WITH_TYPES = (ast.With, ast.AsyncWith)


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


def star_modules(tree):
    return [
        node.module
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
        and node.module
        and any(alias.name == "*" for alias in node.names)
    ]


def called_name(call, aliases, stars):
    name = dotted_name(call.func, aliases)
    if isinstance(call.func, ast.Name) and name == call.func.id:
        starred = (f"{module}.{name}" for module in stars)
        return next((full for full in starred if full in FIXED_SLEEPS), name)
    return name


def sleep_name(call, aliases, stars):
    if isinstance(call.func, ast.Attribute) and call.func.attr == PLAYWRIGHT_TIMEOUT:
        return PLAYWRIGHT_TIMEOUT
    name = called_name(call, aliases, stars)
    if name not in FIXED_SLEEPS:
        return None
    delay = delay_of(call)
    return None if delay is None or is_zero(delay) else name


def is_text(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def patched_target(node, aliases):
    if not isinstance(node, ast.Call) or not node.args:
        return None
    patcher = dotted_name(node.func, aliases)
    first = node.args[0]
    if patcher in PATCHERS and is_text(first):
        return first.value
    if patcher in OBJECT_PATCHERS and len(node.args) > 1 and is_text(node.args[1]):
        owner = dotted_name(first, aliases)
        return f"{owner}.{node.args[1].value}" if owner else None
    return None


def patched_by(nodes, aliases):
    return frozenset(
        target for target in (patched_target(node, aliases) for node in nodes) if target
    )


def exits_when_ready(loop):
    pending = [(statement, False, False) for statement in loop.body]
    while pending:
        node, inner, guarded = pending.pop()
        if isinstance(node, SCOPES):
            continue
        leaves = isinstance(node, ast.Return) or (isinstance(node, ast.Break) and not inner)
        if guarded and leaves:
            return True
        inner = inner or isinstance(node, LOOPS)
        guarded = guarded or isinstance(node, CONDITIONS)
        pending.extend((child, inner, guarded) for child in ast.iter_child_nodes(node))
    return False


def child_states(node, polling, patched, aliases):
    if isinstance(node, LOOPS):
        inside = polling or isinstance(node, ast.While) or exits_when_ready(node)
        looped = [(child, inside, patched) for child in node.body]
        return looped + [(child, polling, patched) for child in node.orelse]
    if isinstance(node, WITH_TYPES):
        inside = patched | patched_by((item.context_expr for item in node.items), aliases)
        headers = [(item, polling, patched) for item in node.items]
        return headers + [(child, polling, inside) for child in node.body]
    return [(child, polling, patched) for child in ast.iter_child_nodes(node)]


def sleep_calls(tree, aliases):
    pending = [(tree, False, frozenset())]
    while pending:
        node, polling, patched = pending.pop()
        if isinstance(node, SCOPES):
            polling = False
            patched = patched_by(getattr(node, "decorator_list", []), aliases)
        if isinstance(node, ast.Call):
            yield node, polling, patched
        pending.extend(child_states(node, polling, patched, aliases))


def fixed_sleep_findings(path, tree, aliases):
    found = []
    stars = star_modules(tree)
    for call, polling, patched in sleep_calls(tree, aliases):
        name = sleep_name(call, aliases, stars)
        looked_up = isinstance(call.func, ast.Attribute) and name in patched
        allowed = name != PLAYWRIGHT_TIMEOUT and (polling or looked_up)
        if name is not None and not allowed:
            found.append(finding("fixed-sleep", path, name, call.lineno))
    return found
