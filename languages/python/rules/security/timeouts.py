import ast

from checks.common import dotted_name, finding
from security.values import argument, has_double_star, keyword, lookup, where_of

RULE = "http-without-timeout"
URL_OPENERS = {"urllib.request.urlopen": 2, "six.moves.urllib.request.urlopen": 2}
CONNECTIONS = {"http.client.HTTPConnection": 2, "http.client.HTTPSConnection": 2}
OPENER_FACTORIES = {"urllib.request.build_opener"}
SESSION_FACTORIES = {
    "requests.Session",
    "requests.session",
    "requests.sessions.Session",
}
CLIENT_FACTORIES = {"httpx.Client", "httpx.AsyncClient"}
SESSION_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "request",
}
CLIENT_METHODS = SESSION_METHODS | {"stream", "send"}
RUFF_TIMEOUT = {f"requests.{m}" for m in SESSION_METHODS}
RUFF_TIMEOUT |= {f"httpx.{m}" for m in CLIENT_METHODS} | CLIENT_FACTORIES
DEFAULT_TIMEOUT = "socket.setdefaulttimeout"
MAX_DEPTH = 3


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def factory_of(node, where, depth=0):
    if depth > MAX_DEPTH or node is None:
        return None
    if isinstance(node, ast.Call):
        return dotted_name(node.func, where.context.aliases)
    if isinstance(node, ast.Name):
        for kind, value, place in lookup(node.id, where):
            found = kind == "value" and factory_of(value, place, depth + 1)
            if found:
                return found
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        if node.value.id == "self":
            return self_factory(node, where)
    return None


def self_factory(node, where):
    for statement in ast.walk(where.context.tree):
        if not isinstance(statement, ast.Assign) or len(statement.targets) != 1:
            continue
        target = statement.targets[0]
        if (
            isinstance(target, ast.Attribute)
            and isinstance(target.value, ast.Name)
            and target.value.id == "self"
            and target.attr == node.attr
            and isinstance(statement.value, ast.Call)
        ):
            return dotted_name(statement.value.func, where.context.aliases)
    return None


def mounts_adapter(owner, context):
    text = ast.dump(owner)
    return any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "mount"
        and ast.dump(node.func.value) == text
        for node in ast.walk(context.tree)
    )


def project_sets_default(project):
    for context in project.contexts.values():
        if context.tests:
            continue
        for node in ast.walk(context.tree):
            if isinstance(node, ast.Call) and node.args and not is_none(node.args[0]):
                if dotted_name(node.func, context.aliases) == DEFAULT_TIMEOUT:
                    return True
    return False


def module_call_problem(call, name, context):
    position = URL_OPENERS.get(name) or CONNECTIONS.get(name)
    if position is not None:
        timeout = argument(call, position, "timeout")
        default = context.project.memo("socket-default-timeout", project_sets_default)
        if (timeout is None and not default) or is_none(timeout):
            return name
    if name == "httpx.Timeout" and len(call.args) == 1 and is_none(call.args[0]):
        return name if not call.keywords else None
    return None


def method_problem(call, context):
    function = call.func
    if not isinstance(function, ast.Attribute):
        return None
    where = where_of(call, context)
    factory = factory_of(function.value, where)
    timeout = keyword(call, "timeout")
    if factory in OPENER_FACTORIES and function.attr == "open":
        default = context.project.memo("socket-default-timeout", project_sets_default)
        timeout = argument(call, 2, "timeout")
        return (
            "opener.open"
            if (timeout is None and not default) or is_none(timeout)
            else None
        )
    if factory in SESSION_FACTORIES and function.attr in SESSION_METHODS:
        if has_double_star(call) or mounts_adapter(function.value, context):
            return None
        return (
            f"session.{function.attr}" if timeout is None or is_none(timeout) else None
        )
    if factory in CLIENT_FACTORIES and function.attr in CLIENT_METHODS:
        return f"client.{function.attr}" if is_none(timeout) else None
    return None


def call_problem(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    if name in RUFF_TIMEOUT:
        return None
    return module_call_problem(call, name, context) or method_problem(call, context)


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call):
            problem = call_problem(node, context)
            if problem is not None:
                found.append(finding(context.path, RULE, problem, node))
    return found
