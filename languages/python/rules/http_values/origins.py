import ast
import re

VALUE_HEADERS = re.compile(
    r"^(?:accept(?:-(?:charset|encoding|language))?|content-(?:type|encoding|language|disposition)"
    r"|transfer-encoding|connection|upgrade|cache-control|pragma|authorization|proxy-authorization"
    r"|www-authenticate|expect|te|host|origin|forwarded|x-forwarded-(?:proto|host|scheme)"
    r"|sec-fetch-\w+|vary)$"
)
STRUCTURED_HEADERS = re.compile(
    r"^(?:accept(?:-(?:charset|encoding|language))?|content-(?:type|disposition|language)"
    r"|cache-control|if-none-match|if-match|cookie|set-cookie|forwarded|vary|prefer|link)$"
)
HEADER_BAG = re.compile(r"headers$", re.IGNORECASE)
REQUEST_NAMES = {"request", "req", "self", "handler"}
KEPT_METHODS = {"strip", "lstrip", "rstrip"}
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
MAX_DEPTH = 5


def text_of(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def last_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def is_bag(node):
    return HEADER_BAG.search(last_name(node) or "") is not None


def scope_nodes(scope):
    pending = list(ast.iter_child_nodes(scope))
    for node in pending:
        yield node
        if not isinstance(node, SCOPES):
            pending.extend(ast.iter_child_nodes(node))


def single_assignments(scope):
    assigned, rebound = {}, set()
    for node in scope_nodes(scope):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                if target.id in assigned:
                    rebound.add(target.id)
                assigned[target.id] = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.value is not None:
                assigned[node.target.id] = node.value
        elif isinstance(node, (ast.AugAssign, ast.NamedExpr)):
            if isinstance(node.target, ast.Name):
                rebound.add(node.target.id)
        elif isinstance(node, (ast.For, ast.comprehension)):
            for name in ast.walk(node.target):
                if isinstance(name, ast.Name):
                    rebound.add(name.id)
    return {name: value for name, value in assigned.items() if name not in rebound}


def is_split_on_dot(node):
    return (
        isinstance(node, ast.Call)
        and last_name(node.func) in {"split", "rsplit"}
        and bool(node.args)
        and text_of(node.args[0]) == "."
    )


def is_extension(node):
    if isinstance(node, ast.Attribute):
        return node.attr == "suffix"
    if not isinstance(node, ast.Subscript):
        return False
    inner = node.value
    index = node.slice
    last = isinstance(index, ast.UnaryOp) or (
        isinstance(index, ast.Constant) and index.value == 1
    )
    splits = isinstance(inner, ast.Call) and last_name(inner.func) == "splitext"
    return last and (splits or is_split_on_dot(inner))


def call_origin(node, env, depth):
    name = last_name(node.func)
    receiver = node.func.value if isinstance(node.func, ast.Attribute) else None
    if name == "get" and receiver is not None and is_bag(receiver) and node.args:
        header = text_of(node.args[0])
        return ("header", header.lower()) if header is not None else None
    if name in KEPT_METHODS and receiver is not None:
        return origin_of(receiver, env, depth + 1)
    if name == "str" and isinstance(node.func, ast.Name) and node.args:
        return origin_of(node.args[0], env, depth + 1)
    return None


def origin_of(node, env, depth=0):
    if depth > MAX_DEPTH or node is None:
        return None
    if isinstance(node, ast.Name):
        return origin_of(env.get(node.id), env, depth + 1)
    if isinstance(node, ast.Call):
        return call_origin(node, env, depth)
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
        return origin_of(node.values[0], env, depth + 1)
    if is_extension(node):
        return ("extension", None)
    if isinstance(node, ast.Subscript) and is_bag(node.value):
        header = text_of(node.slice)
        return ("header", header.lower()) if header is not None else None
    if isinstance(node, ast.Attribute):
        if node.attr == "content_type" and last_name(node.value) in REQUEST_NAMES:
            return ("header", "content-type")
        if node.attr == "netloc":
            return ("netloc", None)
    return None


def is_value_origin(origin):
    if origin is None:
        return False
    kind, header = origin
    return kind != "header" or VALUE_HEADERS.match(header) is not None


def is_structured_origin(origin):
    return (
        origin is not None
        and origin[0] == "header"
        and bool(STRUCTURED_HEADERS.match(origin[1]))
    )
