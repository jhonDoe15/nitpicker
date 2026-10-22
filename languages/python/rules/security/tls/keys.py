import ast
import re

from checks.common import dotted_name
from security.resolve.booleans import bound_values, can_be_false, can_be_true, keyword
from security.resolve.calls import text_of

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
HTTP_METHODS |= {"request", "send", "stream", "ws_connect", "Client", "AsyncClient"}
HTTP_METHODS |= {"TLSConfig"}
HTTP_MODULES = ("requests.", "httpx.", "boto3.", "botocore.", "aiohttp.", "docker.")
CERT_NONE = {
    "ssl.CERT_NONE",
    "CERT_NONE",
    "ssl.VerifyMode.CERT_NONE",
    "VerifyMode.CERT_NONE",
}
CERT_NONE_TEXT = {"CERT_NONE", "NONE", "none"}
CERT_KEYS = {"cert_reqs", "ssl_cert_reqs", "verify_mode", "validate"}
INTEGER_KEYS = {"cert_reqs", "verify_mode"}
TRUE_DISABLES = {
    "tlsAllowInvalidCertificates",
    "tlsAllowInvalidHostnames",
    "tlsInsecure",
}
TRUE_DISABLES |= {
    "sslAllowInvalidCertificates",
    "ssl_allow_invalid",
    "ignore_https_errors",
}
TRUE_DISABLES |= {"acceptInsecureCerts", "accept_insecure_certs", "allowInsecureCerts"}
FALSE_DISABLES = {
    "assert_hostname",
    "verify_ssl",
    "check_hostname",
    "ssl_match_hostname",
}
FALSE_DISABLES |= {
    "verify_certs",
    "ssl_assert_hostname",
    "ssl_check_hostname",
    "cert_check",
}
SERVER_CALLS = ("uvicorn.", "hypercorn.", "gunicorn.", "daphne.")
SERVER_MARKERS = {"ssl.Purpose.CLIENT_AUTH", "ssl.PROTOCOL_TLS_SERVER"}
SERVER_KEYS = {"certfile", "keyfile", "ssl_certfile", "ssl_keyfile"}
ENVIRONMENT = {
    "PYTHONHTTPSVERIFY": {"0"},
    "CURL_CA_BUNDLE": {""},
    "REQUESTS_CA_BUNDLE": {""},
    "NODE_TLS_REJECT_UNAUTHORIZED": {"0"},
    "GIT_SSL_NO_VERIFY": {"1", "true", "True"},
}
INSECURE_PARAMETERS = (
    r"(?:tlsInsecure|tlsAllowInvalidCertificates|tlsAllowInvalidHostnames"
    r"|sslAllowInvalidCertificates|sslAllowInvalidHostnames)=true|sslValidate=false"
    r"|sslmode=no-verify"
)
URI_TEXT = re.compile(rf"[?&](?:{INSECURE_PARAMETERS})(?:&|$|#)", re.I)
FLAG_TEXT = re.compile(r"^(?:--)?ignore-certificate-errors(?![-\w])(?:=\S*)?$")
MAX_DEPTH = 4


def is_cert_none(node, where, key=None, depth=0):
    if node is None or depth > MAX_DEPTH:
        return False
    if isinstance(node, ast.IfExp):
        return any(
            is_cert_none(n, where, key, depth + 1) for n in (node.body, node.orelse)
        )
    if text_of(node) in CERT_NONE_TEXT:
        return True
    if (
        key in INTEGER_KEYS
        and isinstance(node, ast.Constant)
        and type(node.value) is int
    ):
        return node.value == 0
    if dotted_name(node, where.context.aliases) in CERT_NONE:
        return True
    return any(
        is_cert_none(value, place, key, depth + 1)
        for value, place in bound_values(node, where)
    )


def server_call(node, where):
    name = dotted_name(node.func, where.context.aliases) or ""
    markers = {dotted_name(n, where.context.aliases) for n in ast.walk(node)}
    side = keyword(node, "server_side")
    return (
        name.startswith(SERVER_CALLS)
        or bool(SERVER_MARKERS & markers)
        or (isinstance(side, ast.Constant) and side.value is True)
    )


def is_server_context(node, where, depth=0):
    if depth > MAX_DEPTH or node is None:
        return False
    if isinstance(node, ast.Call):
        return server_call(node, where)
    return any(
        is_server_context(value, place, depth + 1)
        for value, place in bound_values(node, where)
    )


def disables(name, value, where):
    if name in TRUE_DISABLES:
        return can_be_true(value, where)
    if name in FALSE_DISABLES:
        return can_be_false(value, where)
    if name == "ssl_cert_reqs" and isinstance(value, ast.Constant):
        return value.value is None or text_of(value) in CERT_NONE_TEXT
    if name in CERT_KEYS:
        return is_cert_none(value, where, name)
    return False


def environment_value(key, value):
    if isinstance(value, ast.IfExp):
        return environment_value(key, value.body) or environment_value(
            key, value.orelse
        )
    return text_of(value) in ENVIRONMENT.get(text_of(key), set())


def http_call(name, function):
    method = function.attr if isinstance(function, ast.Attribute) else None
    return (
        name.startswith(HTTP_MODULES)
        or method in HTTP_METHODS
        or name.endswith("TLSConfig")
    )
