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


def is_true(node, bindings, at):
    value = bindings.resolve(node, at)
    return isinstance(value, ast.Constant) and value.value is True


def is_shield(node, aliases, bindings, at):
    node = bindings.resolve(node, at)
    return (
        isinstance(node, ast.Call)
        and dotted_name(node.func, aliases) in SHIELDABLE
        and any(
            keyword.arg == "shield" and is_true(keyword.value, bindings, at)
            for keyword in node.keywords
        )
    )


def shielding(statement, aliases, bindings):
    return isinstance(statement, (ast.With, ast.AsyncWith)) and any(
        is_shield(item.context_expr, aliases, bindings, statement)
        for item in statement.items
    )
