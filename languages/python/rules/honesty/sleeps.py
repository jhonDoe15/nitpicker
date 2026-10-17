import ast

FIXED_SLEEPS = {
    "time.sleep",
    "asyncio.sleep",
    "trio.sleep",
    "anyio.sleep",
    "gevent.sleep",
}
DELAY_KEYWORDS = {"seconds", "secs", "delay"}
BROWSER_WAIT = "wait_for_timeout"
LOOPS = (ast.For, ast.AsyncFor, ast.While)
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
CONDITIONS = (ast.If, ast.Try) + tuple(
    getattr(ast, name) for name in ("TryStar", "Match") if hasattr(ast, name)
)


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


def starred_name(name, node, stars):
    if not isinstance(node.func, ast.Name) or name != node.func.id:
        return name
    starred = (f"{module}.{name}" for module in stars)
    return next((full for full in starred if full in FIXED_SLEEPS), name)


def is_browser_wait(node):
    return isinstance(node.func, ast.Attribute) and node.func.attr == BROWSER_WAIT


def is_fixed_sleep(name, node):
    if name not in FIXED_SLEEPS:
        return False
    delay = delay_of(node)
    return delay is not None and not is_zero(delay)


def exits_when_ready(loop):
    pending = [(statement, False, False) for statement in loop.body]
    while pending:
        node, inner, guarded = pending.pop()
        if isinstance(node, SCOPES):
            continue
        leaves = isinstance(node, ast.Return) or (
            isinstance(node, ast.Break) and not inner
        )
        if guarded and leaves:
            return True
        inner = inner or isinstance(node, LOOPS)
        guarded = guarded or isinstance(node, CONDITIONS)
        pending.extend((child, inner, guarded) for child in ast.iter_child_nodes(node))
    return False


def is_polling(loop, child):
    in_body = any(child is statement for statement in loop.body)
    return in_body and (isinstance(loop, ast.While) or exits_when_ready(loop))


def in_polling_loop(node, parents):
    child, parent = node, parents.get(id(node))
    while parent is not None and not isinstance(parent, SCOPES):
        if isinstance(parent, LOOPS) and is_polling(parent, child):
            return True
        child, parent = parent, parents.get(id(parent))
    return False


def is_wall_clock_wait(name, node, parents):
    if is_browser_wait(node):
        return True
    return is_fixed_sleep(name, node) and not in_polling_loop(node, parents)
