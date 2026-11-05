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


def subject_of(node):
    text = ast.unparse(node)
    return text if len(text) <= SUBJECT_LENGTH else last_name(node) or "call"


def in_function(node, context):
    parent = context.parents.get(id(node))
    while parent is not None:
        if isinstance(parent, FUNCTION_NODES):
            return True
        parent = context.parents.get(id(parent))
    return False


def is_metadata_owner(owner):
    name = (last_name(owner) or "").lower()
    return name.endswith(METADATA) or name in FLASK_OWNERS


def metadata_change(node, context):
    if not isinstance(node, ast.Attribute) or node.attr not in METADATA_METHODS:
        return False
    owner = node.value
    if not is_metadata_owner(owner):
        return False
    import_time = isinstance(owner, ast.Attribute) and owner.attr == METADATA
    return in_function(node, context) or not import_time


def imports_table_library(context):
    names, modules = context.aliases[:2]
    found = list(names.values()) + list(modules.values())
    return any(module.startswith(TABLE_MODULES) for module in found)


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
    if exempt(context):
        return []
    tables = imports_table_library(context)
    found = []
    for node in ast.walk(context.tree):
        if metadata_change(node, context):
            found.append(finding(context.path, RULE, subject_of(node), node))
        elif isinstance(node, ast.Call) and call_change(node, context, tables):
            found.append(finding(context.path, RULE, subject_of(node.func), node))
    return found
