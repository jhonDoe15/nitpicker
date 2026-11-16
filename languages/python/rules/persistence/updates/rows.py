import ast

from persistence.memory.results import (
    MAPPING,
    QueryResult,
    ROWS,
    django_result,
    executed_model,
    is_session_like,
    query_result,
    statement_model,
    unawaited,
)

DJANGO, SQLALCHEMY = "django", "sqlalchemy"


def selects_columns(node):
    for item in ast.walk(node):
        is_select = (
            isinstance(item, ast.Call) and getattr(item.func, "id", None) == "select"
        )
        if is_select and (
            len(item.args) != 1 or not isinstance(item.args[0], ast.Name)
        ):
            return True
    return False


def rows_of(node, context):
    node = unawaited(node)
    if selects_columns(node):
        return None
    if (
        isinstance(node, ast.Call)
        and getattr(node.func, "id", None) == "list"
        and len(node.args) == 1
    ):
        node = unawaited(node.args[0])
    found = django_result(node)
    if found is not None:
        return (found, DJANGO) if found.kind != MAPPING else None
    found = query_result(node, context)
    if found is None:
        model, receiver = statement_model(node)
        if model is None:
            model, receiver = executed_model(node)
        found = (
            QueryResult(model, ROWS)
            if model and is_session_like(receiver, context)
            else None
        )
    return (found, SQLALCHEMY) if found is not None else None
