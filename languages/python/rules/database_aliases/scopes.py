import ast

from checks.common import parameter_names, string_value

ALIAS_PARAMS = ("using", "db_alias")
PASSED_PARAMS = ("database", "connection_name")
PASSING_CALLS = {"using", "db_manager"}
MIGRATION_ALIAS = "schema_editor.connection.alias"
DEFAULT_ALIAS = "default"


def settings_aliases(context):
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Assign):
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
            if "DATABASES" in names and isinstance(node.value, ast.Dict):
                keys = [key for key in node.value.keys if key is not None]
                yield from (string_value(key) or "<dynamic>" for key in keys)
                if len(keys) > 1:
                    yield "<several>"
            for target in node.targets:
                if isinstance(target, ast.Subscript) and is_databases(target.value):
                    yield string_value(target.slice) or "<dynamic>"
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr == "update" and is_databases(node.func.value):
                yield "<dynamic>"


def is_databases(node):
    return isinstance(node, ast.Name) and node.id == "DATABASES"


def has_several_databases(project):
    def build(_):
        return any(
            alias != DEFAULT_ALIAS
            for context in project.contexts.values()
            if not context.tests
            for alias in settings_aliases(context)
        )

    return project.memo("several-databases", build)


def reads_key(function, name, key):
    for node in ast.walk(function):
        if isinstance(node, ast.Subscript) and getattr(node.value, "id", "") == name:
            if string_value(node.slice) == key:
                return True
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            owner = getattr(node.func.value, "id", "")
            first = string_value(node.args[0]) if node.args else None
            if owner == name and node.func.attr == "get" and first == key:
                return True
    return False


def passes_param(function, name):
    def holds(node):
        return any(isinstance(n, ast.Name) and n.id == name for n in ast.walk(node))

    for node in ast.walk(function):
        if isinstance(node, ast.Subscript) and "connections" in ast.unparse(node.value):
            if holds(node.slice):
                return True
        if isinstance(node, ast.Call):
            called = ast.unparse(node.func)
            if any(k.arg == "using" and holds(k.value) for k in node.keywords):
                return True
            if called.endswith(tuple(PASSING_CALLS)) or "router" in called:
                if any(holds(arg) for arg in node.args):
                    return True
    return False


def alias_in_scope(function):
    params = parameter_names(function)
    for name in ALIAS_PARAMS:
        if name in params:
            return name
    for name in PASSED_PARAMS:
        if name in params and passes_param(function, name):
            return name
    if "schema_editor" in params:
        return MIGRATION_ALIAS
    kwargs = function.args.kwarg
    if kwargs is not None and reads_key(function, kwargs.arg, "using"):
        return f"{kwargs.arg}['using']"
    return None
