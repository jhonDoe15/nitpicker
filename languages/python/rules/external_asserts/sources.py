import ast

from checks.common import dotted_name, own_nodes, root_name

FIRST_CALLS = {"first", "one_or_none", "scalar_one_or_none", "fetchone", "scalar"}
CLIENT_WORDS = ("client", "api", "http")
CLIENT_MODULES = ("requests", "httpx", "aiohttp", "urllib3")
EXTERNAL_WORDS = {
    "payload",
    "response",
    "resp",
    "body",
    "metadata",
    "params",
    "headers",
}
BUILDERS = {"setdefault", "update", "append", "add"}
EXTERNAL_RECEIVERS = (
    "environ",
    "getenv",
    "config",
    "settings",
    "request",
    "session",
    "cache",
    "redis",
    "payload",
    "response",
    "resp",
    "body",
    "meta",
    "params",
    "headers",
    "cookies",
    "query",
    "form",
    "json",
    "data",
    "event",
    "message",
)
AGGREGATE = "count("


def unwrapped(value):
    return value.value if isinstance(value, ast.Await) else value


def is_manager(receiver):
    return ast.unparse(receiver).rsplit(".", 1)[-1] in {"objects", "_default_manager"}


def written_locally(function, name):
    for node in own_nodes(function):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AugAssign):
            targets = [node.target]
        if any(root_name(item) == name for item in targets):
            return True
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in BUILDERS
            and root_name(node.func.value) == name
        ):
            return True
    return False


def has_default(call):
    default = call.args[1] if len(call.args) > 1 else None
    default = default or next(
        (k.value for k in call.keywords if k.arg == "default"), None
    )
    return default is not None and not (
        isinstance(default, ast.Constant) and default.value is None
    )


def get_source(call, function):
    receiver = call.func.value
    if is_manager(receiver) or not call.args or has_default(call):
        return None
    if not any(word in ast.unparse(receiver).lower() for word in EXTERNAL_RECEIVERS):
        return None
    owner = root_name(receiver)
    if owner is None:
        return None
    if isinstance(receiver, ast.Name) and written_locally(function, owner):
        return None
    return f"{ast.unparse(call.func)}()"


def read_source(value, function):
    value = unwrapped(value)
    if isinstance(value, ast.Call) and isinstance(value.func, ast.Attribute):
        name = value.func.attr
        if name == "get":
            return get_source(value, function)
        if name in FIRST_CALLS and AGGREGATE not in ast.unparse(value).lower():
            return f"{ast.unparse(value.func)}()"
    if isinstance(value, ast.Subscript):
        owner = root_name(value)
        if owner in EXTERNAL_WORDS:
            return f"{ast.unparse(value.value)}[]"
    return None


def client_source(value, aliases):
    value = unwrapped(value)
    if not isinstance(value, ast.Call):
        return None
    if isinstance(value.func, ast.Attribute) and value.func.attr == "json":
        return f"{ast.unparse(value.func)}()"
    dotted = dotted_name(value.func, aliases) or ""
    if dotted.startswith(CLIENT_MODULES):
        return f"{dotted}()"
    receiver = value.func.value if isinstance(value.func, ast.Attribute) else None
    words = ast.unparse(receiver).lower() if receiver is not None else ""
    if any(word in words for word in CLIENT_WORDS):
        return f"{ast.unparse(value.func)}()"
    return None
