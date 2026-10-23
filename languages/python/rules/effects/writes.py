from checks.common import words_of
from effects.tables import DATABASE, OWNER_KINDS

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
    "acreate",
    "aupdate",
    "adelete",
    "aget_or_create",
    "aupdate_or_create",
    "abulk_create",
    "abulk_update",
}
DJANGO_MODEL_METHODS = {"save", "delete", "asave", "adelete"}
MODEL_READS = {"refresh_from_db", "arefresh_from_db"}
DJANGO_ONLY = {"asave", "arefresh_from_db", "refresh_from_db"}
PEEWEE_INSTANCE = {"save", "delete_instance"}
PEEWEE_CLASS = {
    "create",
    "get",
    "get_or_none",
    "get_by_id",
    "get_or_create",
    "insert_many",
    "bulk_create",
    "bulk_update",
}
PEEWEE_STATEMENTS = {"insert", "insert_many", "replace", "update", "delete"}
PEEWEE_ROOTS = {"peewee", "playhouse"}
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


def database_receiver(names, spec):
    if spec is not None:
        return spec.default == DATABASE
    return any(
        OWNER_KINDS.get((words_of(owner) or [""])[-1]) == DATABASE
        for owner in names[:-1]
    )


def is_model(names, imports_django):
    method = names[-1]
    if len(names) < 2 or method not in DJANGO_MODEL_METHODS | MODEL_READS:
        return False
    if not imports_django and method not in DJANGO_ONLY:
        return False
    return not set(words_of(names[-2])) & NOT_MODELS


def is_write(names, kind, spec, imports_django):
    method = names[-1]
    database = kind == DATABASE or database_receiver(names, spec)
    if method in WRITE_METHODS and database:
        return True
    return (
        spec is None
        and method in DJANGO_MODEL_METHODS
        and is_model(names, imports_django)
    )


def is_peewee(names):
    method = names[-1]
    if len(names) < 2:
        return False
    if method in PEEWEE_INSTANCE:
        return True
    if not names[0][:1].isupper():
        return False
    if method == "execute":
        return any(name in PEEWEE_STATEMENTS for name in names[1:-1])
    return method in PEEWEE_CLASS
