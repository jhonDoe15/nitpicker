import ast
import re

from checks.common import dotted_name, finding
from security.values import can_be_false, can_be_true, keyword, lookup, where_of

RULE = "tls-verification-off"
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
HTTP_METHODS |= {"request", "send", "stream", "ws_connect", "Client", "AsyncClient"}
HTTP_MODULES = ("requests.", "httpx.", "boto3.", "botocore.", "aiohttp.")
RUFF_VERIFY = {f"requests.{m}" for m in HTTP_METHODS - {"send", "stream"}}
RUFF_VERIFY |= {f"httpx.{m}" for m in HTTP_METHODS}
CERT_NONE = {"ssl.CERT_NONE", "CERT_NONE"}
CERT_NONE_TEXT = {"CERT_NONE", "NONE", "none"}
CERT_KEYS = {"cert_reqs", "ssl_cert_reqs", "verify_mode"}
TRUE_DISABLES = {"tlsAllowInvalidCertificates", "tlsAllowInvalidHostnames"}
TRUE_DISABLES |= {"tlsInsecure", "sslAllowInvalidCertificates", "ssl_allow_invalid"}
FALSE_DISABLES = {
    "assert_hostname",
    "verify_ssl",
    "check_hostname",
    "ssl_match_hostname",
}
SERVER_CALLS = ("uvicorn.", "hypercorn.", "gunicorn.", "daphne.")
SERVER_MARKERS = {"ssl.Purpose.CLIENT_AUTH", "ssl.PROTOCOL_TLS_SERVER"}
ENVIRONMENT = {
    "PYTHONHTTPSVERIFY": {"0"},
    "CURL_CA_BUNDLE": {""},
    "REQUESTS_CA_BUNDLE": {""},
    "NODE_TLS_REJECT_UNAUTHORIZED": {"0"},
    "GIT_SSL_NO_VERIFY": {"1", "true", "True"},
}
MONGO_URI = re.compile(
    r"^mongodb(?:\+srv)?://.*[?&](?:tlsInsecure|tlsAllowInvalidCertificates"
    r"|tlsAllowInvalidHostnames|sslAllowInvalidCertificates)=true",
    re.I | re.S,
)
UNVERIFIED = "ssl._create_unverified_context"
ENVIRONMENT_SETTERS = ("putenv", "environ.setdefault", "setenv")


def text_of(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def is_cert_none(node, where):
    if node is None:
        return False
    if isinstance(node, ast.IfExp):
        return is_cert_none(node.body, where) or is_cert_none(node.orelse, where)
    if text_of(node) in CERT_NONE_TEXT:
        return True
    if dotted_name(node, where.context.aliases) in CERT_NONE:
        return True
    if isinstance(node, ast.Name):
        return any(
            kind == "value" and is_cert_none(value, place)
            for kind, value, place in lookup(node.id, where)
        )
    return False


def is_server_context(node, where, depth=0):
    if depth > 3 or node is None:
        return False
    if isinstance(node, ast.Call):
        name = dotted_name(node.func, where.context.aliases) or ""
        markers = [dotted_name(n, where.context.aliases) for n in ast.walk(node)]
        side = keyword(node, "server_side")
        return (
            name.startswith(SERVER_CALLS)
            or bool(SERVER_MARKERS & set(markers))
            or (isinstance(side, ast.Constant) and side.value is True)
        )
    if isinstance(node, ast.Name):
        return any(
            kind == "value" and is_server_context(value, place, depth + 1)
            for kind, value, place in lookup(node.id, where)
        )
    return False


def disables(name, value, where):
    if name in TRUE_DISABLES:
        return can_be_true(value, where)
    if name in FALSE_DISABLES:
        return can_be_false(value, where)
    if name == "ssl_cert_reqs" and isinstance(value, ast.Constant):
        return value.value is None or text_of(value) in CERT_NONE_TEXT
    if name in CERT_KEYS:
        return is_cert_none(value, where)
    return False


def http_call(name, function):
    method = function.attr if isinstance(function, ast.Attribute) else None
    return name.startswith(HTTP_MODULES) or method in HTTP_METHODS


def call_problem(call, where):
    name = dotted_name(call.func, where.context.aliases) or ""
    for item in call.keywords:
        if item.arg is None:
            continue
        if item.arg == "verify" and http_call(name, call.func):
            literal = isinstance(item.value, ast.Constant)
            if can_be_false(item.value, where) and not (
                literal and name in RUFF_VERIFY
            ):
                return name
        if item.arg == "ssl" and http_call(name, call.func):
            if isinstance(item.value, ast.Constant) and item.value.value is False:
                return name
        if disables(item.arg, item.value, where):
            return None if is_server_context(call, where) else name
        if environment_value(ast.Constant(value=item.arg), item.value):
            return item.arg
    if len(call.args) == 2 and name.endswith(ENVIRONMENT_SETTERS):
        return name if environment_value(call.args[0], call.args[1]) else None
    return None


def environment_value(key, value):
    if isinstance(value, ast.IfExp):
        return environment_value(key, value.body) or environment_value(
            key, value.orelse
        )
    return text_of(value) in ENVIRONMENT.get(text_of(key), set())


def dict_problem(node, where):
    for key, value in zip(node.keys, node.values):
        name = text_of(key)
        if name is None:
            continue
        if environment_value(key, value) or disables(name, value, where):
            return name
    return None


def assignment_problem(node, where):
    for target in node.targets:
        if isinstance(target, ast.Subscript):
            owner = dotted_name(target.value, where.context.aliases)
            key = target.slice
            key = key.value if type(key).__name__ == "Index" else key
            if owner == "os.environ" and environment_value(key, node.value):
                return "os.environ"
        if not isinstance(target, ast.Attribute):
            continue
        owner = target.value
        if target.attr == "_create_default_https_context":
            if dotted_name(node.value, where.context.aliases) == UNVERIFIED:
                return UNVERIFIED
        if is_server_context(owner, where):
            continue
        if target.attr == "verify" and can_be_false(node.value, where):
            return f"{dotted_name(owner, where.context.aliases) or 'session'}.verify"
        if target.attr in FALSE_DISABLES | CERT_KEYS and disables(
            target.attr, node.value, where
        ):
            return target.attr
    return None


def node_problem(node, context):
    if isinstance(node, ast.Call):
        return call_problem(node, where_of(node, context))
    if isinstance(node, ast.Dict):
        return dict_problem(node, where_of(node, context))
    if isinstance(node, ast.Assign):
        return assignment_problem(node, where_of(node, context))
    text = text_of(node)
    if text is not None and MONGO_URI.search(text):
        return "mongodb URI"
    return None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        problem = node_problem(node, context)
        if problem is not None:
            found.append(finding(context.path, RULE, problem, node))
    return found
