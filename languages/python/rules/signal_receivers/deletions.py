import ast

from checks.common import last_name

DELETING_BASES = {
    "DeleteView",
    "DestroyAPIView",
    "DestroyModelMixin",
    "ModelViewSet",
    "ModelAdmin",
}


def is_row_delete(call):
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "delete"
        and not call.args
    )


def deletes_in(context):
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call) and is_row_delete(node):
            return True
        if isinstance(node, ast.ClassDef):
            if DELETING_BASES & {last_name(base) for base in node.bases}:
                return True
    return False


def rows_deleted(project):
    def build(_):
        return any(
            deletes_in(context)
            for context in project.contexts.values()
            if not context.tests
        )

    return project.memo("rows-deleted", build)
