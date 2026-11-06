import ast

from checks.common import dotted_name, finding, last_name
from security.resolve.booleans import can_be_true
from security.resolve.calls import keyword
from security.resolve.scopes import where_of
from security.support import exempt

RULE = "orm-schema-sync"
GUARDED = True
METADATA = "metadata"
METADATA_METHODS = {"create_all", "drop_all"}
FLASK_OWNERS = {"db"}
TABLE_METHODS = {"create_tables", "drop_tables", "create_table", "drop_table"}
TABLE_MODULES = ("peewee", "playhouse")
TORTOISE_REGISTERS = {"register_tortoise", "RegisterTortoise"}
TORTOISE_ROOT = "tortoise."
GENERATE_SCHEMAS = "Tortoise.generate_schemas"
PONY_MAPPING = "generate_mapping"
FUNCTION_NODES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
SUBJECT_LENGTH = 60
FLASK_MODULE = "flask_sqlalchemy"
MIGRATION_MODULE = "alembic"
MIGRATION_FOLDERS = {"migrations", "versions", "alembic"}
COMMAND_DECORATOR = "command"
MAIN_GUARD = "__main__"


def subject_of(node):
    text = ast.unparse(node)
    return text if len(text) <= SUBJECT_LENGTH else last_name(node) or "call"


def ancestors(node, context):
    parent = context.parents.get(id(node))
    while parent is not None:
        yield parent
        parent = context.parents.get(id(parent))


def in_function(node, context):
    return any(
        isinstance(parent, FUNCTION_NODES) for parent in ancestors(node, context)
    )


def is_main_guard(node):
    test = node.test if isinstance(node, ast.If) else None
    return isinstance(test, ast.Compare) and any(
        isinstance(side, ast.Constant) and side.value == MAIN_GUARD
        for side in [test.left, *test.comparators]
    )


def is_command(node):
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return False
    for decorator in node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        if (last_name(target) or "").endswith(COMMAND_DECORATOR):
            return True
    return False


def in_script(node, context):
    return any(
        is_main_guard(parent) or is_command(parent)
        for parent in ancestors(node, context)
    )


def imported_modules(context):
    names, modules = context.aliases[:2]
    return list(names.values()) + list(modules.values())


def project_imports(project):
    return {
        module
        for context in project.contexts.values()
        for module in imported_modules(context)
    }


def imports_anywhere(context, prefixes):
    found = context.project.memo("orm-imported-modules", project_imports)
    return any(module.startswith(prefixes) for module in found)


def is_migration(context):
    folders = set(context.path.split("/")[:-1])
    return bool(folders & MIGRATION_FOLDERS) or any(
        module.startswith(MIGRATION_MODULE) for module in imported_modules(context)
    )


def is_metadata_owner(owner, context):
    name = (last_name(owner) or "").lower()
    if name.endswith(METADATA):
        return True
    return name in FLASK_OWNERS and imports_anywhere(context, (FLASK_MODULE,))


def metadata_change(node, context):
    if not isinstance(node, ast.Attribute) or node.attr not in METADATA_METHODS:
        return False
    owner = node.value
    if not is_metadata_owner(owner, context):
        return False
    import_time = isinstance(owner, ast.Attribute) and owner.attr == METADATA
    return in_function(node, context) or not import_time


def switched_on(call, name, context):
    value = keyword(call, name)
    return value is not None and can_be_true(value, where_of(call, context))


def call_change(call, context, tables):
    name = dotted_name(call.func, context.aliases) or ""
    method = call.func.attr if isinstance(call.func, ast.Attribute) else ""
    if name.startswith(TORTOISE_ROOT) and name.rsplit(".", 1)[-1] in TORTOISE_REGISTERS:
        return switched_on(call, "generate_schemas", context)
    if name.startswith(TORTOISE_ROOT) and name.endswith(GENERATE_SCHEMAS):
        return True
    if method == PONY_MAPPING:
        return switched_on(call, "create_tables", context)
    return tables and method in TABLE_METHODS


def check(context):
    if exempt(context) or is_migration(context):
        return []
    tables = imports_anywhere(context, TABLE_MODULES)
    found = []
    for node in ast.walk(context.tree):
        if metadata_change(node, context):
            found.append((node, subject_of(node)))
        elif isinstance(node, ast.Call) and call_change(node, context, tables):
            found.append((node, subject_of(node.func)))
    return [
        finding(context.path, RULE, subject, node)
        for node, subject in found
        if not in_script(node, context)
    ]
