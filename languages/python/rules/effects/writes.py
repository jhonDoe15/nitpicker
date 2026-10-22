import ast
import re

from checks.common import dotted_name, words_of
from effects.tables import DATABASE, OWNER_KINDS, WRITE

WRITE_METHODS = {
    "save",
    "create",
    "insert",
    "insert_one",
    "insert_many",
    "update",
    "update_one",
    "update_many",
    "delete",
    "delete_one",
    "delete_many",
    "remove",
    "upsert",
    "replace_one",
    "put_item",
    "bulk_create",
    "bulk_update",
    "bulk_insert_mappings",
    "bulk_save_objects",
    "executemany",
    "get_or_create",
    "update_or_create",
    "merge",
    "add",
    "add_all",
    "persist",
    "hset",
    "setex",
    "mset",
}
SQL_METHODS = {"execute", "executemany", "exec_driver_sql", "executescript"}
SQL_WRITE = re.compile(r"^\s*(?:insert|update|delete|merge|replace)\b", re.I)
CONSTRUCT_WRITES = {
    "sqlalchemy.insert",
    "sqlalchemy.update",
    "sqlalchemy.delete",
    "sqlalchemy.dialects.postgresql.insert",
    "sqlalchemy.dialects.mysql.insert",
    "sqlalchemy.dialects.sqlite.insert",
}
DJANGO_MODEL_METHODS = {"save", "delete"}
NOT_MODELS = {
    "form",
    "formset",
    "file",
    "image",
    "session",
    "cache",
    "storage",
    "response",
    "stream",
    "buffer",
    "workbook",
    "wb",
    "doc",
    "document",
    "archive",
    "pdf",
    "img",
    "f",
    "fh",
}


def full_text(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        return "".join(
            part.value if isinstance(part, ast.Constant) else "?"
            for part in node.values
        )
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, right = full_text(node.left), full_text(node.right)
        return None if left is None else left + (right or "?")
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mod):
        return full_text(node.left)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        if node.func.attr == "format":
            return full_text(node.func.value)
    return None


def database_receiver(names, spec_kind):
    if spec_kind == DATABASE:
        return True
    return any(
        OWNER_KINDS.get((words_of(owner) or [""])[-1]) == DATABASE
        for owner in names[:-1]
    )


def construct_root(node, aliases):
    while isinstance(node, (ast.Call, ast.Attribute)):
        if isinstance(node, ast.Call):
            name = dotted_name(node.func, aliases)
            if name in CONSTRUCT_WRITES:
                return name
            node = node.func
        else:
            node = node.value
    return None


def is_write(call, names, kind, receiver_kind, context, imports_django):
    method = names[-1]
    database = kind == DATABASE or database_receiver(names, receiver_kind)
    if method in WRITE_METHODS and database:
        return True
    if method in SQL_METHODS and database and call.args:
        text = full_text(call.args[0])
        if text is not None and SQL_WRITE.match(text):
            return True
        return construct_root(call.args[0], context.aliases) in CONSTRUCT_WRITES
    if method in DJANGO_MODEL_METHODS and imports_django and len(names) >= 2:
        return not set(words_of(names[-2])) & NOT_MODELS
    return False


def write_tags(call, names, kind, receiver_kind, context, imports_django, text):
    if is_write(call, names, kind, receiver_kind, context, imports_django):
        return {WRITE: (text,)}
    return {}
