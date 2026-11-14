import ast

from checks.common import finding
from persistence.memory.check import (
    FUNCTIONS,
    count_shape,
    enclosing,
    is_model,
    is_skipped,
)
from persistence.narrow.columns import is_scalar_column
from persistence.narrow.shapes import (
    base_model,
    count_select,
    is_count_test,
    is_narrowed,
    is_none_test,
    terminal,
)
from persistence.updates.loops import assignment_of, reads
from persistence.updates.rows import rows_of

GUARDED = True
COLUMN_RULE = "row-for-one-column"
EXISTENCE_RULE = "row-for-existence"
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.GeneratorExp)


def resolve(node, context):
    if not isinstance(node, ast.Name):
        return node
    function = enclosing(node, context, FUNCTIONS)
    if function is None or len(reads(function, node.id)) != 1:
        return node
    value = assignment_of(function, node.id)
    return node if value is None else value


def column_of(comprehension):
    generator = comprehension.generators[0]
    element = comprehension.elt
    is_single = (
        len(comprehension.generators) == 1
        and not generator.ifs
        and not generator.is_async
    )
    if not (is_single and isinstance(generator.target, ast.Name)):
        return None
    owner = isinstance(element, ast.Attribute) and isinstance(element.value, ast.Name)
    return element.attr if owner and element.value.id == generator.target.id else None


def column_finding(node, context):
    field = column_of(node)
    source = resolve(node.generators[0].iter, context) if field else None
    found = rows_of(source, context) if source is not None else None
    if found is None or is_narrowed(source):
        return None
    result, orm = found
    if not is_scalar_column(context, result.model, field):
        return None
    return finding(context.path, COLUMN_RULE, f"{result.model}|{field}|{orm}", node)


def compared(node, context):
    left = resolve(node.left, context)
    call = terminal(left, {"count"})
    if call is not None and is_count_test(node):
        return call, "count"
    call = terminal(left, {"first"})
    if call is not None and is_none_test(node):
        return call, "first"
    return None


def tested(node, context):
    expression = resolve(node, context)
    if expression is node and isinstance(node, ast.Name):
        return None
    for shape in ("count", "first"):
        call = terminal(expression, {shape})
        if call is not None and count_shape(
            node, context.parents.get(id(node)), context
        ):
            return call, shape
    return None


def existence_finding(node, context):
    if isinstance(node, ast.Compare):
        selected = (
            count_select(resolve(node.left, context)) if is_count_test(node) else None
        )
        if selected is not None and is_model(context, selected):
            return finding(
                context.path, EXISTENCE_RULE, f"{selected}|count|sqlalchemy", node
            )
        found = compared(node, context)
    elif isinstance(node, (ast.Call, ast.Name)) and isinstance(
        getattr(node, "ctx", ast.Load()), ast.Load
    ):
        found = tested(node, context)
    else:
        found = None
    if found is None:
        return None
    call, shape = found
    base = base_model(call.func.value, context)
    if base is None or not is_model(context, base[0]):
        return None
    return finding(context.path, EXISTENCE_RULE, f"{base[0]}|{shape}|{base[1]}", node)


def check(context):
    if is_skipped(context):
        return []
    found = []
    for node in ast.walk(context.tree):
        item = (
            column_finding(node, context)
            if isinstance(node, COMPREHENSIONS)
            else existence_finding(node, context)
        )
        if item is not None:
            found.append(item)
    return found
