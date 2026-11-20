import ast

from checks.common import dotted_name, finding

GUARDED = True
RULE = "unchecked-response-json"
HTTP_VERBS = {"get", "post", "put", "patch", "delete", "head", "options", "request"}
CLIENT_FACTORIES = {
    "requests.Session",
    "requests.session",
    "httpx.Client",
    "httpx.AsyncClient",
}
BODY_READERS = {"json", "text", "content", "iter_content", "iter_lines"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def position(node):
    return (node.lineno, node.col_offset)


def client_names(function, aliases):
    names = set()
    for node in ast.walk(function):
        pairs = []
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            pairs.append((node.targets[0], node.value))
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            pairs.extend((item.optional_vars, item.context_expr) for item in node.items)
        for target, value in pairs:
            if isinstance(value, ast.Await):
                value = value.value
            if (
                isinstance(target, ast.Name)
                and isinstance(value, ast.Call)
                and dotted_name(value.func, aliases) in CLIENT_FACTORIES
            ):
                names.add(target.id)
    return names


def is_response_call(value, aliases, clients):
    if isinstance(value, ast.Await):
        value = value.value
    if not isinstance(value, ast.Call) or not isinstance(value.func, ast.Attribute):
        return False
    owner = value.func.value
    if value.func.attr not in HTTP_VERBS:
        return False
    if isinstance(owner, ast.Name) and owner.id in clients:
        return True
    return (dotted_name(owner, aliases) or "") in {"requests", "httpx"}


def response_names(function, aliases):
    clients = client_names(function, aliases)
    names = {}
    for node in ast.walk(function):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and is_response_call(node.value, aliases, clients)
        ):
            names.setdefault(node.targets[0].id, 0)
            names[node.targets[0].id] += 1
    return {name for name, count in names.items() if count == 1}


def json_reads(function, names):
    for node in ast.walk(function):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "json"
            and not node.args
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id in names
        ):
            yield node


def chained_reads(function, aliases):
    clients = client_names(function, aliases)
    for node in ast.walk(function):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "json"
            and not node.args
            and is_response_call(node.func.value, aliases, clients)
        ):
            yield node


def is_body_use(node, parents):
    parent = parents.get(id(node))
    return isinstance(parent, ast.Attribute) and parent.attr in BODY_READERS


def checked_before(function, call, parents):
    name = call.func.value.id
    return any(
        isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Load)
        and position(node) < position(call)
        and not is_body_use(node, parents)
        for node in ast.walk(function)
    )


def inside_handler(call, parents):
    node = parents.get(id(call))
    while node is not None and not isinstance(node, FUNCTIONS):
        parent = parents.get(id(node))
        if isinstance(parent, ast.Try) and node in parent.body and parent.handlers:
            return True
        node = parent
    return False


def check(context):
    if context.tests:
        return []
    found = []
    for function in ast.walk(context.tree):
        if not isinstance(function, FUNCTIONS):
            continue
        names = response_names(function, context.aliases)
        for call in json_reads(function, names):
            if inside_handler(call, context.parents):
                continue
            if not checked_before(function, call, context.parents):
                found.append(finding(context.path, RULE, call.func.value.id, call))
        for call in chained_reads(function, context.aliases):
            if not inside_handler(call, context.parents):
                found.append(finding(context.path, RULE, "response", call))
    return found
