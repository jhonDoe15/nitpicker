import ast
import re

from checks.common import finding, shown, string_value
from text_splits.pairs import last_name, scope_of

RULE = "host-port-colon-split"
HOST_NAME = re.compile(r"^(?i:host|hostname|authority|origin|netloc)$|_host$|[a-z]Host$")
HOST_HEADER = re.compile(r"^(?:host|x-forwarded-host)$", re.I)
SPLITTING = {"split", "partition", "index", "find"}
IPV6_NAMES = re.compile(r"ipv6|ipaddress|ip_address|getaddrinfo", re.I)
COLON_COUNTERS = {"count", "rfind", "rindex", "rpartition", "rsplit"}


def colon_counted(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in COLON_COUNTERS
        and bool(node.args)
        and string_value(node.args[0]) == ":"
    )


def is_host(node):
    if isinstance(node, (ast.Name, ast.Attribute)):
        return bool(HOST_NAME.search(last_name(node)))
    header = None
    if isinstance(node, ast.Subscript):
        header = string_value(node.slice)
    elif isinstance(node, ast.Call) and node.args:
        if isinstance(node.func, ast.Attribute) and node.func.attr == "get":
            header = string_value(node.args[0])
    return header is not None and HOST_HEADER.search(header) is not None


def colon_split(node):
    if not (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in SPLITTING
        and node.args
        and string_value(node.args[0]) == ":"
    ):
        return False
    return is_host(node.func.value)


def ipv6_aware(scope):
    for node in ast.walk(scope):
        text = string_value(node)
        if text is not None and ("[" in text or "]" in text):
            return True
        if isinstance(node, ast.Attribute) and node.attr in {"hostname", "port"}:
            return True
        if colon_counted(node):
            return True
        if isinstance(node, (ast.Name, ast.Attribute)):
            if IPV6_NAMES.search(last_name(node)):
                return True
    return False


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if colon_split(node) and not ipv6_aware(scope_of(node, context.parents)):
            found.append(
                finding(context.path, RULE, shown(ast.unparse(node.func.value)), node)
            )
    return found
