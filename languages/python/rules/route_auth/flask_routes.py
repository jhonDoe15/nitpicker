import ast

from checks.common import dotted_name, walk_statements
from route_auth.common import Handler, is_auth_name, is_public, last_name, string_value

ROUTE_METHODS = {"route", "get", "post", "put", "patch", "delete"}
APPLICATIONS = {"flask.Flask", "flask.Blueprint"}
GUARD_HOOKS = {"before_request"}


def application_names(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                    name = dotted_name(node.value.func, context.aliases)
                    target = node.targets[0] if len(node.targets) == 1 else None
                    if name in APPLICATIONS and isinstance(target, ast.Name):
                        found.add(target.id)
        return found

    return project.memo("flask-applications", build)


def guarded_applications(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.FunctionDef):
                    found.update(guard_receivers(node))
        return found

    return project.memo("flask-guarded-applications", build)


def guard_receivers(function):
    hooks = [
        d.value.id
        for d in function.decorator_list
        if isinstance(d, ast.Attribute)
        and d.attr in GUARD_HOOKS
        and isinstance(d.value, ast.Name)
    ]
    if hooks and any(is_auth_name(last_name(n)) for n in calls_and_names(function)):
        return hooks
    return []


def calls_and_names(function):
    for node in ast.walk(function):
        if isinstance(node, ast.Call):
            yield node.func
        elif isinstance(node, (ast.Name, ast.Attribute)):
            yield node


def route_of(function, applications):
    for decorator in function.decorator_list:
        if not (
            isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Attribute)
        ):
            continue
        receiver = decorator.func.value
        if decorator.func.attr in ROUTE_METHODS and isinstance(receiver, ast.Name):
            if receiver.id in applications:
                return decorator, receiver.id
    return None


def flask_handlers(context):
    if not any(v.startswith("flask") for t in context.aliases[:2] for v in t.values()):
        return []
    applications = application_names(context.project)
    guarded = guarded_applications(context.project)
    found = []
    for node in walk_statements(context.tree.body):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        route = route_of(node, applications)
        if route is None:
            continue
        decorator, receiver = route
        names = [last_name(d) for d in node.decorator_list if d is not decorator]
        auth = [name for name in names if is_auth_name(name)]
        if receiver in guarded:
            auth.append("before_request")
        path = string_value(decorator.args[0]) if decorator.args else ""
        public = is_public(node.name, path.replace("/", " "))
        found.append(Handler(node.name, node, context, auth, public))
    return found
