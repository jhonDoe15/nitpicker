import ast

from boundary.type_aliases import alias_statements
from checks.common import dotted_name, walk_statements
from contracts.web import annotated_injection, is_injector, parameters_with_defaults
from route_auth.common import (
    Handler,
    is_auth_name,
    is_public,
    keyword_value,
    last_name,
    string_value,
)

ROUTE_METHODS = {"get", "post", "put", "patch", "delete", "api_route", "websocket"}
ROUTERS = {"fastapi.FastAPI", "fastapi.APIRouter"}
DEPENDENCIES = "dependencies"


def dependency_name(call):
    if call.args:
        return last_name(call.args[0])
    return None


def injected_calls(expression):
    return [n for n in ast.walk(expression) if isinstance(n, ast.Call)]


def dependency_names(expression, context):
    names = []
    for call in injected_calls(expression):
        if is_injector(call, context):
            names.append(dependency_name(call))
    return [name for name in names if name]


def listed_dependencies(call, context):
    value = keyword_value(call, DEPENDENCIES) if isinstance(call, ast.Call) else None
    return dependency_names(value, context) if value is not None else []


def project_aliases(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            for name, value in alias_statements(context.tree):
                if annotated_injection(value, context):
                    found.setdefault(name, []).extend(dependency_names(value, context))
        return found

    return project.memo("fastapi-alias-dependencies", build)


def router_scopes(project):
    def build(_):
        routers, globals_ = {}, []
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                    found = router_assignment(node, context)
                    if found is not None:
                        name, names, is_app = found
                        routers.setdefault(name, []).extend(names)
                        globals_.extend(names if is_app else [])
                elif (
                    isinstance(node, ast.Call)
                    and last_name(node.func) == "include_router"
                ):
                    if node.args and last_name(node.args[0]):
                        names = listed_dependencies(node, context)
                        routers.setdefault(last_name(node.args[0]), []).extend(names)
        return routers, globals_

    return project.memo("fastapi-router-scopes", build)


def router_assignment(node, context):
    constructor = dotted_name(node.value.func, context.aliases)
    target = node.targets[0] if len(node.targets) == 1 else None
    if constructor not in ROUTERS or not isinstance(target, ast.Name):
        return None
    return (
        target.id,
        listed_dependencies(node.value, context),
        constructor.endswith("FastAPI"),
    )


def route_of(function):
    for decorator in function.decorator_list:
        if not (
            isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Attribute)
        ):
            continue
        receiver = decorator.func.value
        if decorator.func.attr in ROUTE_METHODS and isinstance(receiver, ast.Name):
            return decorator, receiver.id
    return None


def parameter_dependencies(function, context):
    aliases = project_aliases(context.project)
    found = []
    for argument, default in parameters_with_defaults(function):
        if default is not None:
            found.extend(dependency_names(default, context))
        annotation = argument.annotation
        if annotation is None:
            continue
        found.extend(dependency_names(annotation, context))
        found.extend(aliases.get(last_name(annotation) or "", []))
    return found


def fastapi_handlers(context):
    if not any(
        v.startswith("fastapi") for t in context.aliases[:2] for v in t.values()
    ):
        return []
    routers, global_names = router_scopes(context.project)
    found = []
    for node in walk_statements(context.tree.body):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        route = route_of(node)
        if route is None or route[1] not in routers:
            continue
        decorator, receiver = route
        names = listed_dependencies(decorator, context) + parameter_dependencies(
            node, context
        )
        names += routers[receiver] + global_names
        include = keyword_value(decorator, "include_in_schema")
        hidden = isinstance(include, ast.Constant) and include.value is False
        path = string_value(decorator.args[0]) if decorator.args else ""
        public = hidden or is_public(node.name, path.replace("/", " "))
        found.append(
            Handler(
                node.name, node, context, [n for n in names if is_auth_name(n)], public
            )
        )
    return found
