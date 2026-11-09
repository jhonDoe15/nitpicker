import ast

from checks.common import dotted_name, finding
from security.resolve.classes import bases_of, function_of
from security.resolve.scopes import (
    FUNCTIONS,
    definition,
    lookup,
    module_where,
    values_of,
    where_of,
)
from security.support import exempt

RULE = "unmapped-exception"
APP_FACTORIES = {
    "fastapi.FastAPI",
    "fastapi.APIRouter",
    "fastapi.routing.APIRouter",
    "starlette.applications.Starlette",
}
ROUTE_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "trace",
    "api_route",
    "websocket",
}
STATUS_BASES = {
    "fastapi.HTTPException",
    "fastapi.exceptions.HTTPException",
    "starlette.exceptions.HTTPException",
    "fastapi.WebSocketException",
    "starlette.exceptions.WebSocketException",
    "fastapi.exceptions.WebSocketException",
    "fastapi.exceptions.RequestValidationError",
    "fastapi.exceptions.WebSocketRequestValidationError",
}
BUILTIN_PREFIX = "builtins."
SUPPRESS = "suppress"
CATCH_ALL = {"Exception", "BaseException", "builtins.Exception"}
MAX_DEPTH = 4
MAX_ANCESTORS = 12


def is_app(node, where):
    if isinstance(node, ast.Attribute) and node.attr == "router":
        node = node.value
    if not isinstance(node, ast.Name):
        return False
    for value, place in values_of(node.id, where):
        if isinstance(value, ast.Call):
            if dotted_name(value.func, place.context.aliases) in APP_FACTORIES:
                return True
    return False


def is_route(function, context):
    where = where_of(function, context)
    for decorator in function.decorator_list:
        call = decorator if isinstance(decorator, ast.Call) else None
        target = call.func if call is not None else decorator
        if isinstance(target, ast.Attribute) and target.attr in ROUTE_METHODS:
            if is_app(target.value, where):
                return True
    return False


def ancestry(cls, where):
    chain = [(cls, where)]
    external = set()
    for current, place in chain:
        for base in current.bases:
            if definition(base, place) is None:
                external.add(dotted_name(base, place.context.aliases) or "")
        if len(chain) < MAX_ANCESTORS:
            chain.extend(
                (base, at)
                for base, at in bases_of(current, place)
                if all(base is not seen for seen, _ in chain)
            )
    return [node for node, _ in chain], external


def class_key(node):
    return id(node)


def is_isinstance(function):
    return isinstance(function, ast.Name) and function.id == "isinstance"


def class_targets(node, where):
    resolved = definition(node, where)
    if resolved is not None:
        return [resolved]
    if isinstance(node, (ast.Tuple, ast.List)):
        return [found for element in node.elts for found in class_targets(element, where)]
    if not isinstance(node, ast.Name):
        return []
    found = []
    for kind, value, place in lookup(node.id, where):
        if kind == "iter" and isinstance(value, (ast.Tuple, ast.List)):
            found.extend(class_targets(value, place))
        elif kind == "value" and isinstance(value, ast.Name):
            resolved = definition(value, place)
            found.extend([resolved] if resolved is not None else [])
    return found


def handler_classes(function, place, registry):
    for node in ast.walk(function):
        if isinstance(node, ast.Call) and is_isinstance(node.func):
            if len(node.args) == 2:
                for resolved in class_targets(node.args[1], where_of(node, place.context)):
                    registry["named"].add(class_key(resolved[0]))


def register(target, handler, where, registry):
    resolved = class_targets(target, where)
    if resolved:
        registry["classes"].update(class_key(found[0]) for found in resolved)
        return
    name = dotted_name(target, where.context.aliases) or ""
    if name in CATCH_ALL and handler is not None:
        found = definition(handler, where, FUNCTIONS)
        if found is not None:
            handler_classes(found[0], found[1], registry)


def decorated_handlers(function, where, registry):
    for decorator in function.decorator_list:
        if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute):
            if decorator.func.attr == "exception_handler" and decorator.args:
                handler = ast.Name(id=function.name)
                register(decorator.args[0], handler, where, registry)


def call_handlers(call, where, registry):
    function = call.func
    if isinstance(function, ast.Attribute) and function.attr == "add_exception_handler":
        if len(call.args) == 2:
            register(call.args[0], call.args[1], where, registry)
    if dotted_name(function, where.context.aliases) in APP_FACTORIES:
        for item in call.keywords:
            if item.arg == "exception_handlers":
                handlers_mapping(item.value, where, registry)


def handlers_mapping(node, where, registry):
    if isinstance(node, ast.Name):
        values = values_of(node.id, where)
        if len(values) == 1:
            node, where = values[0]
    if isinstance(node, ast.Dict):
        for key, value in zip(node.keys, node.values):
            if key is not None:
                register(key, value, where, registry)


def build_registry(project):
    registry = {"classes": set(), "named": set()}
    for context in project.contexts.values():
        if context.tests:
            continue
        for node in ast.walk(context.tree):
            if isinstance(node, FUNCTIONS):
                decorated_handlers(node, module_where(context), registry)
            elif isinstance(node, ast.Call):
                call_handlers(node, where_of(node, context), registry)
    return registry


def is_opaque(name):
    return "." in name and not name.startswith(BUILTIN_PREFIX)


def is_mapped(cls, place, registry):
    chain, external = ancestry(cls, place)
    if external & STATUS_BASES or any(is_opaque(name) for name in external):
        return True
    keys = {class_key(node) for node in chain}
    return bool(keys & (registry["classes"] | registry["named"]))


def is_suppress(item):
    call = item.context_expr
    if not isinstance(call, ast.Call):
        return False
    function = call.func
    name = function.id if isinstance(function, ast.Name) else getattr(function, "attr", "")
    return name == SUPPRESS


def body_nodes(function):
    pending = list(function.body)
    for node in pending:
        if isinstance(node, (*FUNCTIONS, ast.ClassDef, ast.Lambda)):
            continue
        if isinstance(node, ast.Try) and node.handlers:
            pending.extend([*node.handlers, *node.orelse, *node.finalbody])
            continue
        if isinstance(node, (ast.With, ast.AsyncWith)) and any(map(is_suppress, node.items)):
            continue
        yield node
        pending.extend(ast.iter_child_nodes(node))


def raised_class(node, where):
    if not isinstance(node, ast.Raise) or node.exc is None:
        return None
    target = node.exc.func if isinstance(node.exc, ast.Call) else node.exc
    return definition(target, where)


def label(function, context):
    owner = context.parents.get(id(function))
    if isinstance(owner, ast.ClassDef):
        return f"{owner.name}.{function.name}"
    return function.name


def raised_classes(route, context):
    found = {}
    seen = {id(route)}
    pending = [(route, context, [], 0)]
    for function, current, path, depth in pending:
        for node in body_nodes(function):
            where = where_of(node, current)
            raised = raised_class(node, where)
            if raised is not None and class_key(raised[0]) not in found:
                found[class_key(raised[0])] = (raised[0], raised[1], path)
            target = function_of(node, where) if isinstance(node, ast.Call) else None
            if target is None or depth >= MAX_DEPTH or id(target[0]) in seen:
                continue
            seen.add(id(target[0]))
            step = label(target[0], target[1].context)
            pending.append((target[0], target[1].context, [*path, step], depth + 1))
    return list(found.values())


def route_finding(context, route, raised):
    cls, _, path = raised
    subject = f"`{route.name}` can raise `{cls.name}`"
    item = finding(context.path, RULE, subject, route)
    if path:
        steps = ", ".join(f"`{step}`" for step in path)
        item["via"] = f"{subject} (through {steps})"
    return item


def check(context):
    if exempt(context):
        return []
    registry = context.project.memo("unmapped-exception-handlers", build_registry)
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTIONS) and is_route(node, context):
            for raised in raised_classes(node, context):
                if not is_mapped(raised[0], raised[1], registry):
                    found.append(route_finding(context, node, raised))
    return found
