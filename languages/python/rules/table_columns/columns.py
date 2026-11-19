import ast

from checks.common import dotted_name
from django_declarations.classes import derives_from
from orm.models import class_assignments, constant, keyword

PACKAGE = "django_tables2"
UNSORTED_BY_DEFAULT = {"ActionsColumn", "CheckBoxColumn", "ManyToManyColumn"}


def is_table(cls, context):
    return derives_from(cls, context, PACKAGE, "Table")


def is_column_call(call, context):
    dotted = dotted_name(call.func, context.aliases) or ""
    last = dotted.rsplit(".", 1)[-1]
    if not dotted.startswith(PACKAGE) or last in UNSORTED_BY_DEFAULT:
        return False
    return last.endswith("Column")


def declared_columns(cls, context):
    for name, call in class_assignments(cls):
        if isinstance(call, ast.Call) and is_column_call(call, context):
            yield name, call


def accessor_text(name, call):
    node = keyword(call, "accessor")
    if node is None:
        return name
    if isinstance(node, ast.Call) and node.args:
        node = node.args[0]
    value = constant(node)
    return value.replace(".", "__") if isinstance(value, str) else None


def table_methods(cls):
    return {
        statement.name
        for statement in cls.body
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def meta_unsortable(cls):
    for statement in cls.body:
        if isinstance(statement, ast.ClassDef) and statement.name == "Meta":
            return any(
                key == "orderable" and constant(value) is False
                for key, value in class_assignments(statement)
            )
    return False


def sort_declared(name, call, methods):
    orderable = keyword(call, "orderable")
    if orderable is not None and constant(orderable) is not True:
        return True
    return keyword(call, "order_by") is not None or f"order_{name}" in methods
