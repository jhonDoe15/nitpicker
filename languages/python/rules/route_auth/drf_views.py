import ast

from checks.common import walk_statements
from route_auth.common import Handler, class_bases, is_public, last_name
from soft_delete.models import lineage, project_classes

VIEW_SUFFIXES = ("APIView", "ViewSet", "ModelViewSet")
OPEN = "AllowAny"
DEFAULTS = "DEFAULT_PERMISSION_CLASSES"
ATTRIBUTE = "permission_classes"
METHOD = "get_permissions"


def is_view_class(cls):
    return any(name.endswith(VIEW_SUFFIXES) for name in class_bases(cls))


def permission_names(value):
    if not isinstance(value, (ast.List, ast.Tuple)):
        return None
    return [name for name in (last_name(element) for element in value.elts) if name]


def declared(cls):
    for statement in cls.body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target = statement.targets[0]
            if isinstance(target, ast.Name) and target.id == ATTRIBUTE:
                return permission_names(statement.value)
        if isinstance(statement, ast.FunctionDef) and statement.name == METHOD:
            return [METHOD]
    return None


def class_permissions(cls, context):
    classes = project_classes(context.project)
    for member, _ in lineage(cls, context, classes):
        names = declared(member)
        if names is not None:
            return names
    return None


def is_defaults_target(node):
    return any(
        isinstance(target, ast.Subscript)
        and isinstance(target.slice, ast.Constant)
        and target.slice.value == DEFAULTS
        for target in node.targets
    )


def default_permissions(project):
    def build(_):
        found = []
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.Assign) and is_defaults_target(node):
                    found.append(node.value)
                if isinstance(node, ast.Dict):
                    for key, value in zip(node.keys, node.values):
                        if isinstance(key, ast.Constant) and key.value == DEFAULTS:
                            found.append(value)
        return found

    return project.memo("drf-default-permissions", build)


def is_guarded_by_default(project):
    for value in default_permissions(project):
        elements = value.elts if isinstance(value, (ast.List, ast.Tuple)) else []
        texts = [e.value for e in elements if isinstance(e, ast.Constant)]
        if any(not text.endswith(OPEN) for text in texts):
            return True
    return False


def function_permissions(function):
    names = None
    for decorator in function.decorator_list:
        if isinstance(decorator, ast.Call) and last_name(decorator.func) == ATTRIBUTE:
            names = permission_names(decorator.args[0]) if decorator.args else []
    return names


def is_api_view(function):
    return any(
        last_name(d) == "api_view"
        for d in function.decorator_list
        if isinstance(d, ast.Call)
    )


def build_handler(name, node, context, permissions):
    public = is_public(name) or permissions == [] or OPEN in (permissions or [])
    auth = [p for p in permissions or [] if p != OPEN]
    return Handler(name, node, context, auth, public)


def drf_handlers(context):
    if not any(
        v.startswith("rest_framework") for t in context.aliases[:2] for v in t.values()
    ):
        return []
    if is_guarded_by_default(context.project):
        return []
    found = []
    for node in walk_statements(context.tree.body):
        if isinstance(node, ast.ClassDef) and is_view_class(node):
            permissions = class_permissions(node, context)
            found.append(build_handler(node.name, node, context, permissions))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and is_api_view(
            node
        ):
            found.append(
                build_handler(node.name, node, context, function_permissions(node))
            )
    return found
