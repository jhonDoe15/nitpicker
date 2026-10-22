import ast

from checks.common import dotted_name, finding
from security.resolve.booleans import can_be_false
from security.resolve.calls import (
    dict_entries,
    keyword_entries,
    partial_target,
    text_of,
)
from security.resolve.scopes import where_of
from security.support import exempt
from security.tls.keys import (
    CERT_KEYS,
    FALSE_DISABLES,
    FLAG_TEXT,
    HTTP_METHODS,
    SERVER_KEYS,
    TRUE_DISABLES,
    URI_TEXT,
    disables,
    environment_value,
    http_call,
    is_server_context,
)

RULE = "tls-verification-off"
RUFF_METHODS = HTTP_METHODS - {"send", "stream", "TLSConfig"}
RUFF_VERIFY = {f"requests.{m}" for m in RUFF_METHODS}
RUFF_VERIFY |= {f"httpx.{m}" for m in HTTP_METHODS - {"TLSConfig"}}
UNVERIFIED = "ssl._create_unverified_context"
ENVIRONMENT_SETTERS = ("putenv", "environ.setdefault", "setenv")
PAIR_SETTERS = {"setattr": 1, "set_capability": 0, "setCapability": 0}
LOOKUPS = {
    "startswith",
    "endswith",
    "index",
    "count",
    "remove",
    "discard",
    "find",
    "replace",
}
CONCATENATIONS = (ast.JoinedStr, ast.BinOp, ast.FormattedValue)


def subject_of(call, where):
    name = dotted_name(call.func, where.context.aliases)
    if name:
        return name
    function = call.func
    if isinstance(function, ast.Attribute):
        receiver = function.value
        inner = dotted_name(getattr(receiver, "func", None), where.context.aliases)
        return f"{inner}().{function.attr}" if inner else function.attr
    return "call"


def own_problem(call, item, where, partial):
    name = dotted_name(call.func, where.context.aliases) or ""
    subject = subject_of(call, where)
    if item.arg in {"verify", "ssl"} and http_call(name, call.func):
        literal = isinstance(item.value, ast.Constant) and item.arg == "verify"
        ruff = literal and name in RUFF_VERIFY and not partial
        return subject if can_be_false(item.value, where) and not ruff else None
    if disables(item.arg, item.value, where):
        return None if is_server_context(call, where) else subject
    if environment_value(ast.Constant(value=item.arg), item.value):
        return item.arg
    return None


def spread_problem(call, where):
    name = dotted_name(call.func, where.context.aliases) or ""
    if not http_call(name, call.func):
        return None
    spread = [item for item in call.keywords if item.arg is None]
    for key, value, place in keyword_entries(spread, where).items:
        if key in {"verify", "ssl"} and can_be_false(value, place):
            return subject_of(call, where)
    return None


def pair_problem(call, where):
    name = dotted_name(call.func, where.context.aliases) or ""
    if len(call.args) == 2 and name.endswith(ENVIRONMENT_SETTERS):
        return name if environment_value(call.args[0], call.args[1]) else None
    last = name.rsplit(".", 1)[-1]
    index = PAIR_SETTERS.get(last)
    if index is None or len(call.args) != index + 2:
        return None
    key = text_of(call.args[index])
    if key and disables(key, call.args[index + 1], where):
        return None if is_server_context(call.args[0], where) and index else key
    return None


def call_problem(call, where):
    target = partial_target(call, where.context.aliases)
    checked = target if target is not None else call
    for item in checked.keywords:
        if item.arg is not None:
            problem = own_problem(checked, item, where, target is not None)
            if problem is not None:
                return problem
    return spread_problem(checked, where) or pair_problem(checked, where)


def is_server_dict(node, where):
    keys = {key for key, _, _ in dict_entries(node, where).items}
    return bool(keys & SERVER_KEYS)


def dict_problem(node, where):
    server = None
    for key, value in zip(node.keys, node.values):
        name = text_of(key)
        if name is None:
            continue
        if environment_value(key, value):
            return name
        if disables(name, value, where):
            server = is_server_dict(node, where) if server is None else server
            if not (server and name in CERT_KEYS):
                return name
    return None


def subscript_problem(target, value, where):
    owner = dotted_name(target.value, where.context.aliases)
    if owner == "os.environ" and environment_value(target.slice, value):
        return "os.environ"
    key = text_of(target.slice)
    if key and disables(key, value, where):
        if key in CERT_KEYS and is_server_dict(target.value, where):
            return None
        return key
    return None


def attribute_problem(target, value, where):
    owner = target.value
    if target.attr == "_create_default_https_context":
        if dotted_name(value, where.context.aliases) == UNVERIFIED:
            return UNVERIFIED
    if is_server_context(owner, where):
        return None
    if target.attr == "verify" and can_be_false(value, where):
        return f"{dotted_name(owner, where.context.aliases) or 'session'}.verify"
    keys = FALSE_DISABLES | CERT_KEYS | TRUE_DISABLES
    if target.attr in keys and disables(target.attr, value, where):
        return target.attr
    return None


def assignment_problem(node, where):
    for target in node.targets:
        if isinstance(target, ast.Subscript):
            problem = subscript_problem(target, node.value, where)
        elif isinstance(target, ast.Attribute):
            problem = attribute_problem(target, node.value, where)
        else:
            problem = None
        if problem is not None:
            return problem
    return None


def static_texts(node, context):
    top = node
    while isinstance(context.parents.get(id(top)), CONCATENATIONS):
        top = context.parents[id(top)]
    return " ".join(
        n.value
        for n in ast.walk(top)
        if isinstance(n, ast.Constant) and isinstance(n.value, str)
    )


def text_problem(node, context):
    text = text_of(node)
    parent = context.parents.get(id(node))
    if text is None or isinstance(parent, ast.Expr):
        return None
    if URI_TEXT.search(text):
        return (
            "mongodb URI"
            if "mongodb" in static_texts(node, context)
            else "connection URI"
        )
    if FLAG_TEXT.match(text) and not is_lookup(node, parent):
        return "--ignore-certificate-errors"
    return None


def is_lookup(node, parent):
    if isinstance(parent, (ast.Compare, ast.match_case, ast.MatchValue)):
        return True
    if isinstance(parent, ast.Call) and isinstance(parent.func, ast.Attribute):
        return parent.func.attr in LOOKUPS and node in parent.args
    return False


def node_problem(node, context):
    if isinstance(node, ast.Call):
        return call_problem(node, where_of(node, context))
    if isinstance(node, ast.Dict):
        return dict_problem(node, where_of(node, context))
    if isinstance(node, ast.Assign):
        return assignment_problem(node, where_of(node, context))
    if isinstance(node, ast.Constant):
        return text_problem(node, context)
    return None


def check(context):
    if exempt(context):
        return []
    found = []
    for node in ast.walk(context.tree):
        problem = node_problem(node, context)
        if problem is not None:
            found.append(finding(context.path, RULE, problem, node))
    return found
