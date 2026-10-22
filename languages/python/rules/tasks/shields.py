import ast

from checks.common import dotted_name

TIMED = {
    "trio.move_on_after",
    "trio.move_on_at",
    "trio.fail_after",
    "trio.fail_at",
    "anyio.move_on_after",
    "anyio.fail_after",
}
SCOPES = {"trio.CancelScope", "anyio.CancelScope"}
INFINITE = {"math.inf", "numpy.inf"}


def is_true(node):
    return isinstance(node, ast.Constant) and node.value is True


def is_unbounded(node, aliases):
    if isinstance(node, ast.Constant):
        return node.value is None
    if isinstance(node, ast.Call) and dotted_name(node.func, aliases) == "float":
        return any(
            isinstance(arg, ast.Constant) and str(arg.value).endswith("inf")
            for arg in node.args
        )
    return dotted_name(node, aliases) in INFINITE


def keyword(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)


def bounded_shield(node, aliases):
    if not isinstance(node, ast.Call):
        return False
    name = dotted_name(node.func, aliases)
    if not is_true(keyword(node, "shield")):
        return False
    if name in TIMED:
        limit = node.args[0] if node.args else keyword(node, "deadline")
        limit = limit if limit is not None else keyword(node, "seconds")
        return limit is not None and not is_unbounded(limit, aliases)
    deadline = keyword(node, "deadline")
    return (
        name in SCOPES and deadline is not None and not is_unbounded(deadline, aliases)
    )


def shielding(statement, aliases):
    return isinstance(statement, (ast.With, ast.AsyncWith)) and any(
        bounded_shield(item.context_expr, aliases) for item in statement.items
    )
