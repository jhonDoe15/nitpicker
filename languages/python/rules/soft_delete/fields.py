import ast

from checks.common import walk_statements, words_of
from kinds.index import functions_of

SOFT_FIELDS = {
    "deleted_at",
    "is_deleted",
    "deleted",
    "archived",
    "is_archived",
    "archived_at",
    "hidden",
    "is_hidden",
    "is_visible",
    "visibility",
}
WRITER_WORDS = {"delete", "restore", "remove", "archive", "hide", "soft"}
INTENT_WORDS = {
    "trash",
    "trashed",
    "restore",
    "purge",
    "cleanup",
    "undelete",
    "recycle",
    "deleted",
    "admin",
    "hard",
}
INTENT_PATHS = {"admin", "migrations"}


def mentions(node, fields):
    for child in ast.walk(node):
        if isinstance(child, ast.keyword) and child.arg:
            if child.arg.split("__")[0] in fields:
                return True
        elif isinstance(child, ast.Attribute) and child.attr in fields:
            return True
        elif isinstance(child, ast.Name) and child.id in fields:
            return True
        elif isinstance(child, ast.Constant) and isinstance(child.value, str):
            if child.value.split("__")[0] in fields:
                return True
    return False


def is_intentional(qualified, path):
    words = {word for part in qualified.split(".") for word in words_of(part)}
    folders = {part.removesuffix(".py") for part in path.split("/")}
    return bool(words & INTENT_WORDS) or bool(folders & INTENT_PATHS)


def helper_names(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            if context.tests:
                continue
            for qualified, function in functions_of(context):
                words = set(words_of(function.name))
                body = ast.Module(body=function.body, type_ignores=[])
                if not words & WRITER_WORDS and loads_field(body):
                    found.add(function.name)
        return found

    return project.memo("soft-delete-helpers", build)


def loads_field(body):
    return any(
        isinstance(node, ast.Attribute)
        and node.attr in SOFT_FIELDS
        and isinstance(node.ctx, ast.Load)
        for node in walk_statements(body.body)
    ) or any(
        isinstance(node, ast.keyword)
        and node.arg
        and node.arg.split("__")[0] in SOFT_FIELDS
        for node in walk_statements(body.body)
    )
