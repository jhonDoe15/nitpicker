import ast

from checks.common import dotted_name
from security.resolve.classes import bases_of, class_facts, instance_classes
from security.resolve.scopes import MAX_HOPS, lookup
from security.sql.shapes import safe_annotation

SCHEMA_CALLS = {
    "sqlalchemy.Table",
    "sqlalchemy.table",
    "sqlalchemy.Column",
    "sqlalchemy.column",
    "sqlalchemy.sql.table",
    "sqlalchemy.sql.column",
    "sqlalchemy.schema.Table",
    "sqlalchemy.schema.Column",
}
INSPECT = {"sqlalchemy.inspect"}
SCHEMA_ATTRIBUTES = {"name", "fullname", "key", "column", "attname", "db_column"}
SCHEMA_ATTRIBUTES |= {"db_tablespace", "db_table", "table_name"}
TABLE_PARTS = {"c", "columns", "mapper", "local_table", "persist_selectable", "table"}
TABLE_PARTS |= {"primary_key", "foreign_keys", "column_attrs", "attrs", "tables"}
TABLE_PARTS |= {"sorted_tables", "concrete_fields", "fields", "local_fields"}
TABLE_PARTS |= {"local_concrete_fields", "many_to_many", "private_fields"}
DJANGO_META = "_meta"
DJANGO_CALLS = {"get_field", "get_fields"}
SEQUENCE_CALLS = {"sorted", "reversed", "list", "tuple", "iter"}
MAPPING_VIEWS = {"keys", "values", "items"}
METADATA_PARTS = {"sorted_tables", "tables"}


def is_schema(node, where, depth=0):
    if depth > MAX_HOPS or node is None:
        return False
    if isinstance(node, ast.Call):
        return schema_call(node, where, depth)
    if isinstance(node, ast.Attribute):
        if node.attr == "__table__" or node.attr == DJANGO_META:
            return True
        if node.attr in METADATA_PARTS and isinstance(node.value, ast.Attribute):
            return node.value.attr == "metadata" or is_schema(
                node.value, where, depth + 1
            )
        return is_schema(node.value, where, depth + 1) and (
            node.attr in TABLE_PARTS or is_part(node.value)
        )
    if isinstance(node, ast.Subscript):
        return is_part(node.value) and is_schema(node.value, where, depth + 1)
    if isinstance(node, ast.Name):
        entries = lookup(node.id, where)
        return bool(entries) and all(
            kind != "param" and is_schema(value, place, depth + 1)
            for kind, value, place in entries
        )
    return False


def is_part(node):
    return isinstance(node, ast.Attribute) and node.attr in TABLE_PARTS


def schema_call(node, where, depth):
    name = dotted_name(node.func, where.context.aliases) or ""
    if name in SCHEMA_CALLS:
        first = node.args[0] if node.args else None
        return isinstance(first, ast.Constant) and isinstance(first.value, str)
    if name in INSPECT:
        return True
    function = node.func
    if isinstance(function, ast.Attribute):
        if function.attr in DJANGO_CALLS | MAPPING_VIEWS:
            return is_schema(function.value, where, depth + 1)
    if name in SEQUENCE_CALLS and node.args:
        return is_schema(node.args[0], where, depth + 1)
    return False


def schema_text(node, where):
    return node.attr in SCHEMA_ATTRIBUTES and is_schema(node.value, where)


def field_annotation(cls, place, name, hops=0):
    annotation = class_facts(cls, place.context).annotations.get(name)
    if annotation is not None or hops > MAX_HOPS:
        return annotation, place
    for base, base_place in bases_of(cls, place):
        found = field_annotation(base, base_place, name, hops + 1)
        if found[0] is not None:
            return found
    return None, place


def typed_field(node, where):
    classes = instance_classes(node.value, where)
    if not classes:
        return False
    for cls, place in classes:
        annotation, owner = field_annotation(cls, place, node.attr)
        if not safe_annotation(annotation, owner):
            return False
    return True
