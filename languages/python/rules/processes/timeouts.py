import ast

from checks.common import dotted_name, finding
from security.resolve.booleans import is_none
from security.resolve.calls import PARTIALS, argument, effective_calls
from security.resolve.scopes import enclosing_class, values_of, where_of
from security.support import exempt
from security.timeouts.check import MISSING, NONE, timeout_state

RULE = "subprocess-without-timeout"
GUARDED = True
RUN_CALLS = {
    "subprocess.run",
    "subprocess.call",
    "subprocess.check_call",
    "subprocess.check_output",
}
POPEN = {"subprocess.Popen"}
NO_TIMEOUT_CALLS = {"subprocess.getoutput", "subprocess.getstatusoutput"}
ASYNC_FACTORIES = {
    "asyncio.create_subprocess_exec",
    "asyncio.create_subprocess_shell",
    "asyncio.subprocess.create_subprocess_exec",
    "asyncio.subprocess.create_subprocess_shell",
    "anyio.open_process",
}
ASYNC_RUNS = {"anyio.run_process", "trio.run_process"}
POPEN_WAITS = {"wait": 0, "communicate": 1}
ASYNC_WAITS = {"wait", "communicate"}
DEADLINE_SCOPES = {
    "asyncio.timeout",
    "asyncio.timeout_at",
    "async_timeout.timeout",
    "anyio.fail_after",
    "anyio.move_on_after",
    "trio.fail_after",
    "trio.move_on_after",
    "trio.fail_at",
    "trio.move_on_at",
}
WAIT_FOR = {"asyncio.wait_for": 1, "asyncio.wait": None}
DELAY_KEYWORDS = {"delay", "when", "seconds", "deadline"}


def unwrapped(node):
    return node.value if isinstance(node, ast.Await) else node


def factory_name(node, where):
    node = unwrapped(node)
    if isinstance(node, ast.Call):
        return dotted_name(node.func, where.context.aliases)
    return None


def self_attribute(node):
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        return node.attr if node.value.id == "self" else None
    return None


def attribute_values(cls, attr):
    for node in ast.walk(cls):
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [node.target]
        else:
            continue
        if any(self_attribute(target) == attr for target in targets):
            yield node.value


def receiver_values(receiver, where):
    attr = self_attribute(receiver)
    if attr is not None:
        cls = enclosing_class(receiver, where.context)
        values = attribute_values(cls, attr) if cls is not None else []
        return [(value, where_of(value, where.context)) for value in values]
    if isinstance(receiver, ast.Name):
        return values_of(receiver.id, where)
    return []


def made_by(receiver, where):
    if isinstance(receiver, (ast.Call, ast.Await)):
        return factory_name(receiver, where)
    names = {factory_name(value, place) for value, place in receiver_values(receiver, where)}
    return names.pop() if len(names) == 1 else None


def bounded_argument(value, where):
    return value is not None and not is_none(value, where)


def scope_delay(scope):
    if scope.args:
        return scope.args[0]
    return next((k.value for k in scope.keywords if k.arg in DELAY_KEYWORDS), None)


def in_deadline(call, where):
    parents = where.context.parents
    child, current = call, parents.get(id(call))
    while current is not None:
        if isinstance(current, ast.Call) and child is not current.func:
            name = dotted_name(current.func, where.context.aliases)
            if name in WAIT_FOR and bounded_argument(
                argument(current, WAIT_FOR[name], "timeout"), where
            ):
                return True
        if isinstance(current, (ast.With, ast.AsyncWith)):
            for item in current.items:
                scope = item.context_expr
                if isinstance(scope, ast.Call) and dotted_name(
                    scope.func, where.context.aliases
                ) in DEADLINE_SCOPES and bounded_argument(scope_delay(scope), where):
                    return True
        if isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            return False
        child, current = current, parents.get(id(current))
    return False


def method_problem(call, where):
    function = call.func
    if not isinstance(function, ast.Attribute):
        return None
    made = made_by(function.value, where)
    if made in POPEN and function.attr in POPEN_WAITS:
        timeout = argument(call, POPEN_WAITS[function.attr], "timeout")
        return None if bounded_argument(timeout, where) else f"Popen.{function.attr}"
    if made in ASYNC_FACTORIES and function.attr in ASYNC_WAITS:
        return None if in_deadline(call, where) else f"process.{function.attr}"
    return None


def call_problem(call, where):
    name = dotted_name(call.func, where.context.aliases) or ""
    if name in NO_TIMEOUT_CALLS:
        return name
    if name in RUN_CALLS:
        return name if timeout_state(call, where) in {MISSING, NONE} else None
    if name in ASYNC_RUNS:
        return None if in_deadline(call, where) else name
    return method_problem(call, where)


def check(context):
    if exempt(context):
        return []
    found = []
    for node, call, where, through in effective_calls(context, where_of):
        if through and dotted_name(node.func, context.aliases) in PARTIALS:
            continue
        problem = call_problem(call, where)
        if problem is not None:
            found.append(finding(context.path, RULE, problem, node))
    return found
