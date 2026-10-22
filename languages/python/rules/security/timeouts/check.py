import ast

from checks.common import dotted_name, finding
from security.resolve.booleans import is_none
from security.resolve.calls import argument, effective_calls, keyword_entries, text_of
from security.resolve.scopes import where_of
from security.support import exempt
from security.timeouts.factories import (
    CLIENT_FACTORIES,
    OPENER_FACTORIES,
    POOL_FACTORIES,
    SESSION_FACTORIES,
    made_of,
)

RULE = "http-without-timeout"
URL_OPENERS = {"urllib.request.urlopen": 2, "six.moves.urllib.request.urlopen": 2}
CONNECTIONS = {"http.client.HTTPConnection": 2, "http.client.HTTPSConnection": 2}
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
POOL_METHODS = {"request", "urlopen", "request_encode_url", "request_encode_body"}
WATCHED = CLIENT_METHODS | POOL_METHODS | {"open"}
REQUESTS_CALLS = {f"requests.{m}" for m in SESSION_METHODS}
HTTPX_CALLS = {f"httpx.{m}" for m in CLIENT_METHODS} | CLIENT_FACTORIES
CLIENT_TIMEOUTS = {"aiohttp.ClientTimeout", "aiohttp.client.ClientTimeout"}
TIMEOUT_BOUNDS = {"total", "connect", "sock_read", "sock_connect"}
URLLIB3_CALLS = {"urllib3.request"}
DEFAULT_TIMEOUT = "socket.setdefaulttimeout"
SET, MISSING, NONE, UNKNOWN = "set", "missing", "none", "unknown"


def timeout_state(call, where):
    entries = keyword_entries(call.keywords, where)
    for key, value, place in entries.items:
        if key == "timeout":
            return NONE if is_none(value, place) else SET
    return MISSING if entries.complete else UNKNOWN


def project_sets_default(project):
    for context in project.contexts.values():
        if context.tests:
            continue
        for node in ast.walk(context.tree):
            if isinstance(node, ast.Call) and node.args:
                first = node.args[0]
                if not (isinstance(first, ast.Constant) and first.value is None):
                    if dotted_name(node.func, context.aliases) == DEFAULT_TIMEOUT:
                        return True
    return False


def positional_missing(call, position, where):
    timeout = argument(call, position, "timeout")
    default = where.context.project.memo("socket-default-timeout", project_sets_default)
    return (timeout is None and not default) or is_none(timeout, where)


def client_timeout_missing(call, where):
    if call.args:
        return (
            len(call.args) == 1 and is_none(call.args[0], where) and not call.keywords
        )
    bounds = [item for item in call.keywords if item.arg in TIMEOUT_BOUNDS]
    others = [item for item in call.keywords if item.arg not in TIMEOUT_BOUNDS]
    return not any(item.arg is None for item in others) and all(
        is_none(item.value, where) for item in bounds
    )


def module_call_problem(call, name, where, through):
    position = URL_OPENERS.get(name) or CONNECTIONS.get(name)
    if position is not None:
        return name if positional_missing(call, position, where) else None
    if name == "httpx.Timeout" and len(call.args) == 1 and is_none(call.args[0], where):
        return name if not call.keywords else None
    if name in CLIENT_TIMEOUTS:
        return name if client_timeout_missing(call, where) else None
    state = timeout_state(call, where) if through or name in URLLIB3_CALLS else None
    if name in URLLIB3_CALLS or (through and name in REQUESTS_CALLS):
        return name if state in {MISSING, NONE} else None
    if through and name in HTTPX_CALLS:
        return name if state == NONE else None
    return None


def method_parts(call):
    function = call.func
    if isinstance(function, ast.Attribute):
        return function.value, function.attr
    if isinstance(function, ast.Call) and isinstance(function.func, ast.Name):
        if function.func.id == "getattr" and len(function.args) >= 2:
            return function.args[0], text_of(function.args[1]) or "request"
    return None, None


def pool_problem(made, call, attr, where):
    state = timeout_state(call, where)
    factory = timeout_state(made.call, where) if made.call is not None else MISSING
    if state == NONE or (state == MISSING and factory in {MISSING, NONE}):
        return f"pool.{attr}"
    return None


def method_problem(call, where):
    receiver, attr = method_parts(call)
    if receiver is None or attr not in WATCHED:
        return None
    made = made_of(receiver, where)
    if made is None:
        return None
    if made.name in OPENER_FACTORIES and attr == "open":
        return "opener.open" if positional_missing(call, 2, where) else None
    if made.name in SESSION_FACTORIES and attr in SESSION_METHODS:
        if made.configured or timeout_state(call, where) in {SET, UNKNOWN}:
            return None
        return f"session.{attr}"
    if made.name in CLIENT_FACTORIES and attr in CLIENT_METHODS:
        return f"client.{attr}" if timeout_state(call, where) == NONE else None
    if made.name in POOL_FACTORIES and attr in POOL_METHODS:
        return pool_problem(made, call, attr, where)
    return None


def call_problem(call, where, through):
    name = dotted_name(call.func, where.context.aliases) or ""
    if not through and (name in REQUESTS_CALLS or name in HTTPX_CALLS):
        return None
    return module_call_problem(call, name, where, through) or method_problem(
        call, where
    )


def check(context):
    if exempt(context):
        return []
    found = []
    for node, call, where, through in effective_calls(context, where_of):
        problem = call_problem(call, where, through)
        if problem is not None:
            found.append(finding(context.path, RULE, problem, node))
    return found
