import ast

from checks.common import dotted_name, last_name

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
DEADLINE_CLOCKS = {
    "time.monotonic",
    "time.monotonic_ns",
    "time.perf_counter",
    "time.perf_counter_ns",
    "time.time",
    "time.time_ns",
    "datetime.datetime.now",
    "datetime.datetime.utcnow",
    "trio.current_time",
    "anyio.current_time",
}
BACKGROUND_KEYWORDS = {"target", "side_effect"}
BACKGROUND_CALLS = {
    "Thread",
    "Timer",
    "submit",
    "run_in_executor",
    "to_thread",
    "start_new_thread",
}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
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


def is_forever(test):
    return isinstance(test, ast.Constant) and bool(test.value)


def is_clock_read(node, aliases):
    if not isinstance(node, ast.Call):
        return False
    if dotted_name(node.func, aliases) in DEADLINE_CLOCKS:
        return True
    func = node.func
    if not (isinstance(func, ast.Attribute) and func.attr == "time"):
        return False
    owner = func.value.func if isinstance(func.value, ast.Call) else func.value
    return (last_name(owner) or "").lower().endswith("loop")


def reads_clock(loop, aliases):
    pending = [loop.test] + list(loop.body)
    while pending:
        node = pending.pop()
        if isinstance(node, SCOPES):
            continue
        if is_clock_read(node, aliases):
            return True
        pending.extend(ast.iter_child_nodes(node))
    return False


def is_polling(loop, child, aliases):
    if not any(child is statement for statement in loop.body):
        return False
    if isinstance(loop, ast.While):
        return not is_forever(loop.test) or reads_clock(loop, aliases)
    return exits_when_ready(loop)


def in_polling_loop(node, context):
    parents = context.parents
    child, parent = node, parents.get(id(node))
    while parent is not None and not isinstance(parent, SCOPES):
        if isinstance(parent, LOOPS) and is_polling(parent, child, context.aliases):
            return True
        child, parent = parent, parents.get(id(parent))
    return False


def functions_named(tree):
    named = {}
    for node in ast.walk(tree):
        if isinstance(node, FUNCTIONS):
            named.setdefault(node.name, []).append(node)
    return named


def handed_off(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            yield from (k.value for k in node.keywords if k.arg in BACKGROUND_KEYWORDS)
            if last_name(node.func) in BACKGROUND_CALLS:
                yield from node.args
        elif isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Attribute) and target.attr == "side_effect"
            for target in node.targets
        ):
            yield node.value


def background_scopes(tree):
    named = functions_named(tree)
    scopes = set()
    for value in handed_off(tree):
        if isinstance(value, ast.Lambda):
            scopes.add(id(value))
        else:
            scopes.update(id(function) for function in named.get(last_name(value), []))
    return scopes


def in_background(node, parents, scopes):
    current = parents.get(id(node))
    while current is not None:
        if id(current) in scopes:
            return True
        current = parents.get(id(current))
    return False


def wall_clock_waits(context, sleeps_inside=lambda _name: False):
    scopes = background_scopes(context.tree)

    def waits(name, node):
        if in_background(node, context.parents, scopes):
            return False
        if is_browser_wait(node) or sleeps_inside(name):
            return True
        return is_fixed_sleep(name, node) and not in_polling_loop(node, context)

    return waits
