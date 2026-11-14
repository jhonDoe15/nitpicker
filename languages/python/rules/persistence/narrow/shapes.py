import ast

from checks.common import last_name
from persistence.memory.results import (
    MANAGER,
    executed_model,
    is_session_like,
    statement_model,
    unawaited,
)
from persistence.updates.rows import DJANGO, SQLALCHEMY, django_result, selects_columns

COUNT_TESTS = {
    ast.Gt: 0,
    ast.GtE: 1,
    ast.NotEq: 0,
    ast.Eq: 0,
    ast.Lt: 1,
    ast.LtE: 0,
}
SCALARS = {"scalar", "scalar_one", "one"}
NARROWING = {
    "only",
    "values",
    "values_list",
    "load_only",
    "with_entities",
    "add_columns",
}


def terminal(node, names):
    node = unawaited(node)
    is_method = isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    return node if is_method and node.func.attr in names and not node.args else None


def is_narrowed(node):
    return any(
        isinstance(item, ast.Call) and last_name(item.func) in NARROWING
        for item in ast.walk(node)
    )


def base_model(receiver, context):
    receiver = unawaited(receiver)
    if is_narrowed(receiver) or selects_columns(receiver):
        return None
    if isinstance(receiver, ast.Attribute) and receiver.attr == MANAGER:
        owner = receiver.value
        return (
            (owner.id, DJANGO)
            if isinstance(owner, ast.Name) and owner.id[:1].isupper()
            else None
        )
    found = django_result(receiver)
    if found is not None:
        return found.model, DJANGO
    model, owner = statement_model(receiver)
    if model is None:
        model, owner = executed_model(receiver)
    return (model, SQLALCHEMY) if model and is_session_like(owner, context) else None


def model_name(node):
    while isinstance(node, ast.Attribute):
        node = node.value
    return node.id if isinstance(node, ast.Name) and node.id[:1].isupper() else None


def count_argument(select):
    counter = select.args[0] if len(select.args) == 1 else None
    is_count = isinstance(counter, ast.Call) and last_name(counter.func) == "count"
    return counter if is_count else None


def counted_model(node):
    selects = [
        item
        for item in ast.walk(node)
        if isinstance(item, ast.Call) and getattr(item.func, "id", None) == "select"
    ]
    counters = [counter for item in selects if (counter := count_argument(item))]
    if not counters:
        return None
    sources = [
        item.args[0]
        for item in ast.walk(node)
        if isinstance(item, ast.Call)
        and last_name(item.func) == "select_from"
        and item.args
    ]
    sources += [argument for counter in counters for argument in counter.args]
    return next((name for name in map(model_name, sources) if name), None)


def count_select(node):
    node = unawaited(node)
    call = terminal(node, SCALARS)
    if call is not None:
        return counted_model(call.func.value)
    if (
        isinstance(node, ast.Call)
        and last_name(node.func) in {"scalar", "scalar_one"}
        and node.args
    ):
        return counted_model(node.args[0])
    return None


def zero_test(compare):
    if len(compare.ops) != 1 or len(compare.comparators) != 1:
        return None
    other = compare.comparators[0]
    if not (isinstance(other, ast.Constant) and not isinstance(other.value, bool)):
        return None
    return type(compare.ops[0]), other.value


def is_count_test(compare):
    test = zero_test(compare)
    return test is not None and COUNT_TESTS.get(test[0]) == test[1]


def is_none_test(compare):
    other = compare.comparators[0] if len(compare.comparators) == 1 else None
    is_none = isinstance(other, ast.Constant) and other.value is None
    return (
        is_none
        and len(compare.ops) == 1
        and isinstance(compare.ops[0], (ast.Is, ast.IsNot, ast.Eq, ast.NotEq))
    )
