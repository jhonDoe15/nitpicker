import ast
import re

from checks.common import dotted_name, last_name, string_value
from orm.models import class_assignments

BARE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
PERMISSION_CALLS = {
    "has_perm": 0,
    "has_perms": 0,
    "user_has_perm": 1,
    "_user_has_perm": 1,
}
PERMISSION_KEYWORDS = {"perm", "perm_list", "permission"}
MODEL_PERMISSION_BASES = {
    "DjangoModelPermissions",
    "DjangoModelPermissionsOrAnonReadOnly",
    "DjangoObjectPermissions",
}
MIXIN_BASE = "PermissionRequiredMixin"
DECORATOR = "permission_required"
USER_NAMES = {"user", "request_user", "current_user"}
USER_TYPES = ("User", "AbstractUser", "AbstractBaseUser")


def literals_of(node):
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return [item for item in node.elts if isinstance(item, ast.Constant)]
    return [node] if isinstance(node, ast.Constant) else []


def bare_literals(node):
    return [
        item for item in literals_of(node) if BARE_NAME.match(string_value(item) or "")
    ]


def argument_of(call, index):
    for keyword in call.keywords:
        if keyword.arg in PERMISSION_KEYWORDS:
            return keyword.value
    return call.args[index] if len(call.args) > index else None


def has_object(call, name):
    if name == "has_perm":
        return len(call.args) > 1 or any(k.arg == "obj" for k in call.keywords)
    if name in {"user_has_perm", "_user_has_perm"}:
        return len(call.args) > 2 or any(k.arg == "obj" for k in call.keywords)
    return False


def annotations_of(context):
    def build(_):
        return {
            arg.arg: ast.unparse(arg.annotation).rsplit(".", 1)[-1]
            for node in ast.walk(context.tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            for arg in node.args.args + node.args.kwonlyargs
            if arg.annotation is not None
        }

    return context.project.memo(("annotations", context.path), build)


def own_has_perm(project):
    def build(_):
        return {
            node.name
            for context in project.contexts.values()
            for node in ast.walk(context.tree)
            if isinstance(node, ast.ClassDef)
            and any(
                isinstance(m, ast.FunctionDef) and m.name == "has_perm"
                for m in node.body
            )
        }

    return project.memo("own-has-perm", build)


def calling_helpers(project):
    def build(_):
        return {
            node.name
            for context in project.contexts.values()
            for node in ast.walk(context.tree)
            if isinstance(node, ast.FunctionDef)
            and any(
                isinstance(c, ast.Call) and last_name(c.func) == "has_perm"
                for c in ast.walk(node)
            )
        }

    return project.memo("has-perm-helpers", build)


def is_user_receiver(owner, context):
    if isinstance(owner, ast.Attribute):
        return owner.attr in USER_NAMES
    if not isinstance(owner, ast.Name):
        return False
    kind = annotations_of(context).get(owner.id)
    if kind in own_has_perm(context.project):
        return False
    return owner.id in USER_NAMES or (kind or "").endswith(USER_TYPES)


def is_permission_helper(function, context):
    dotted = dotted_name(function, context.aliases) or ""
    if not isinstance(function, ast.Name):
        return False
    return dotted.startswith("django") or function.id in calling_helpers(
        context.project
    )


def call_sites(call, context):
    function = call.func
    name = last_name(function)
    if name in PERMISSION_CALLS:
        if name in {"has_perm", "has_perms"}:
            if not (
                isinstance(function, ast.Attribute)
                and is_user_receiver(function.value, context)
            ):
                return []
        elif not is_permission_helper(function, context):
            return []
        argument = argument_of(call, PERMISSION_CALLS[name])
        scoped = has_object(call, name)
        return [(name, item, scoped) for item in bare_literals(argument)]
    dotted = dotted_name(function, context.aliases) or ""
    if dotted.startswith("django") and dotted.endswith(f".{DECORATOR}") and call.args:
        return [(DECORATOR, item, False) for item in bare_literals(call.args[0])]
    return []


def base_last_names(cls):
    names = set()
    for base in cls.bases:
        node = base.value if isinstance(base, ast.Subscript) else base
        names.add(getattr(node, "attr", getattr(node, "id", "")))
    return names


def mixin_sites(cls):
    if MIXIN_BASE not in base_last_names(cls):
        return []
    return [
        (DECORATOR, item, False)
        for name, value in class_assignments(cls)
        if name == DECORATOR
        for item in bare_literals(value)
    ]


def mapping_sites(cls):
    if not base_last_names(cls) & MODEL_PERMISSION_BASES:
        return []
    found = []
    for name, value in class_assignments(cls):
        if name == "perms_map" and isinstance(value, ast.Dict):
            for entry in value.values:
                found.extend(("perms_map", i, False) for i in bare_literals(entry))
    return found


def permission_sites(context):
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call):
            found.extend(call_sites(node, context))
        elif isinstance(node, ast.ClassDef):
            found.extend(mixin_sites(node))
            found.extend(mapping_sites(node))
    return sorted(found, key=lambda site: (site[1].lineno, site[1].col_offset))
