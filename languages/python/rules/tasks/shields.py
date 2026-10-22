import ast

from checks.common import dotted_name

SHIELDABLE = {
    "trio.move_on_after",
    "trio.move_on_at",
    "trio.fail_after",
    "trio.fail_at",
    "trio.CancelScope",
    "anyio.move_on_after",
    "anyio.fail_after",
    "anyio.CancelScope",
}


def is_shield(node, aliases):
    return (
        isinstance(node, ast.Call)
        and dotted_name(node.func, aliases) in SHIELDABLE
        and any(
            keyword.arg == "shield"
            and isinstance(keyword.value, ast.Constant)
            and keyword.value.value is True
            for keyword in node.keywords
        )
    )


def shielding(statement, aliases):
    return isinstance(statement, (ast.With, ast.AsyncWith)) and any(
        is_shield(item.context_expr, aliases) for item in statement.items
    )
