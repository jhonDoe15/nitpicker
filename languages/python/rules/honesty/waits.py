import ast
import re

from checks.common import call_name, finding, last_name
from honesty.sleeps import SCOPES, is_zero

RULE = "negative-wait-in-test"
TIMEOUT_ERRORS = {"TimeoutError", "Empty", "TimeoutExpired"}
RAISES = {"raises", "assertRaises"}
DELAY_FIRST = {"wait", "timeout", "fail_after"}
FALSE_RESULTS = {"wait", "acquire"}
WAIT_CALLS = {"wait", "wait_for", "get", "join", "acquire", "result", "communicate", *DELAY_FIRST}
PROCESS_RUNS = {"subprocess.run", "subprocess.call", "subprocess.check_call", "subprocess.check_output"}
MOCKS = {"Mock", "MagicMock", "AsyncMock", "NonCallableMock", "create_autospec", "patch", "object"}
PROCESSES = {"Popen", "create_subprocess_exec", "create_subprocess_shell"}
MOCK_ATTRIBUTES = {"side_effect", "return_value"}
MOCKED = "Mock"
HELPER_WAIT = re.compile(r"wait_\w+|\w+_until|poll\w*")


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


def dotted_path(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    return ".".join([node.id, *reversed(parts)]) if isinstance(node, ast.Name) else None


def bound_kind(target, value):
    if isinstance(target, (ast.Name, ast.Attribute)) and isinstance(value, ast.Call):
        return dotted_path(target), last_name(value.func)
    if isinstance(target, ast.Attribute) and target.attr in MOCK_ATTRIBUTES:
        return dotted_path(target.value), MOCKED
    return None, None


def scope_bindings(function):
    bindings = []
    for node in ast.walk(function):
        pairs = []
        if isinstance(node, ast.Assign):
            pairs = [(target, node.value) for target in node.targets]
        elif isinstance(node, ast.withitem) and node.optional_vars is not None:
            pairs = [(node.optional_vars, node.context_expr)]
        for target, value in pairs:
            path, kind = bound_kind(target, value)
            if path is not None:
                bindings.append(((target.lineno, target.col_offset), path, kind))
    return bindings


def kind_of(callee, scope):
    path = dotted_path(callee)
    if path is None:
        return None
    position = (callee.lineno, callee.col_offset)
    reaching = [
        (where, kind)
        for where, bound, kind in scope["kinds"]
        if where < position and (path == bound or path.startswith(f"{bound}."))
    ]
    return max(reaching, default=(None, None))[1]


def is_wait(node, scope):
    if not isinstance(node, ast.Call):
        return False
    delay = delay_of(node)
    unbounded = isinstance(delay, ast.Constant) and delay.value is None
    if delay is None or unbounded or is_zero(delay):
        return False
    if kind_of(node.func, scope) in MOCKS:
        return False
    name = last_name(node.func)
    return (
        call_name(node, scope["aliases"]) in PROCESS_RUNS
        or name in WAIT_CALLS
        or (name is not None and HELPER_WAIT.fullmatch(name) is not None)
    )


def expects_timeout(item):
    call = item.context_expr
    if not (
        isinstance(call, ast.Call) and last_name(call.func) in RAISES and call.args
    ):
        return False
    expected = call.args[0]
    names = expected.elts if isinstance(expected, ast.Tuple) else [expected]
    return any(last_name(name) in TIMEOUT_ERRORS for name in names)


def first_wait(statements, scope):
    pending = list(reversed(statements))
    while pending:
        node = pending.pop()
        if isinstance(node, SCOPES):
            continue
        if is_wait(node, scope):
            return node
        pending.extend(reversed(list(ast.iter_child_nodes(node))))
    return None


def waits_out(node, scope):
    if not is_wait(node, scope) or last_name(node.func) not in FALSE_RESULTS:
        return None
    return None if kind_of(node.func, scope) in PROCESSES else node


def is_false(node):
    return isinstance(node, ast.Constant) and node.value is False


def false_wait(test, scope):
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return waits_out(test.operand, scope)
    if (
        isinstance(test, ast.Compare)
        and len(test.ops) == 1
        and is_false(test.comparators[0])
    ):
        return (
            waits_out(test.left, scope) if isinstance(test.ops[0], (ast.Is, ast.Eq)) else None
        )
    return None


def negative_wait(node, scope):
    if isinstance(node, (ast.With, ast.AsyncWith)) and any(
        map(expects_timeout, node.items)
    ):
        return first_wait(node.body, scope)
    if isinstance(node, ast.Assert):
        return false_wait(node.test, scope)
    if (
        isinstance(node, ast.Call)
        and last_name(node.func) == "assertFalse"
        and node.args
    ):
        return waits_out(node.args[0], scope)
    return None


def scoped_nodes(tree):
    pending = [(tree, [])]
    while pending:
        node, kinds = pending.pop()
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            kinds = [*kinds, *scope_bindings(node)]
        yield node, kinds
        pending.extend((child, kinds) for child in ast.iter_child_nodes(node))


def check(context):
    if not context.tests:
        return []
    found = []
    for node, kinds in scoped_nodes(context.tree):
        wait = negative_wait(node, {"kinds": kinds, "aliases": context.aliases})
        if wait is not None:
            subject = call_name(wait, context.aliases) or last_name(wait.func)
            found.append(finding(context.path, RULE, subject, wait))
    return sorted(found, key=lambda item: item["line"])
