import ast
import re

from checks.common import dotted_name, own_nodes
from http_values.request_names import is_request
from null_keys.inputs import assignments_of

REQUEST_MAPPINGS = {"session", "COOKIES", "GET", "POST", "headers", "query_params", "cookies"}
COORDINATORS = {"coordinator", "_coordinator"}
DOCUMENT_NAME = re.compile(r"config|metadata|discovery|document|well_?known|manifest|openid|oidc", re.IGNORECASE)
REQUEST = "request"
TOKEN = "token"
REMOTE = "remote"
COORDINATOR = "coordinator"


def is_scope(node):
    if isinstance(node, ast.Name):
        return node.id == "scope"
    return isinstance(node, ast.Attribute) and node.attr == "scope"


def is_scope_cookies(node):
    return (
        isinstance(node, ast.Subscript)
        and isinstance(node.slice, ast.Constant)
        and node.slice.value == "cookies"
        and is_scope(node.value)
    )


def call_kind(call, context, name=""):
    dotted = dotted_name(call.func, context.aliases) or ""
    if dotted.rsplit(".", 1)[-1] == "get_unverified_header":
        return TOKEN
    func = call.func
    if isinstance(func, ast.Attribute) and func.attr == "json" and not call.args:
        if is_request(func.value):
            return REQUEST
        return REMOTE if DOCUMENT_NAME.search(name) else None
    return None


def kind_of(node, local, context, name=""):
    if isinstance(node, ast.Await):
        node = node.value
    if isinstance(node, ast.Name):
        return local.get(node.id)
    if isinstance(node, ast.Call):
        return call_kind(node, context, name)
    if isinstance(node, ast.Attribute):
        return attribute_kind(node)
    return REQUEST if is_scope_cookies(node) else None


def attribute_kind(node):
    if node.attr in REQUEST_MAPPINGS and is_request(node.value):
        return REQUEST
    owner = node.value
    if node.attr == "data" and isinstance(owner, ast.Attribute) and owner.attr in COORDINATORS:
        return COORDINATOR
    return None


def local_kinds(function, context):
    assigned, others = assignments_of(function)
    local = {}
    for name, entries in assigned.items():
        kinds = {kind_of(value, {}, context, name) for value, _ in entries}
        if name not in others and len(kinds) == 1 and None not in kinds:
            local[name] = kinds.pop()
    return local


def subscripts_of(function):
    return [
        node
        for node in own_nodes(function)
        if isinstance(node, ast.Subscript) and isinstance(node.ctx, ast.Load)
    ]
