import ast

from checks.common import is_log_call
from errors.cancellation.names import resolved_name

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
BLOCKS = ("body", "orelse", "finalbody")


def chain_text(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = chain_text(node.value)
        return f"{base}.{node.attr}" if base else None
    return None


def cancel_target(call):
    func = call.func if isinstance(call, ast.Call) else None
    if isinstance(func, ast.Attribute) and func.attr == "cancel" and not call.args:
        return func.value
    return None


def cancelled_by(statement):
    if isinstance(statement, ast.Expr):
        target = chain_text(cancel_target(statement.value))
        return {target} if target else set()
    if isinstance(statement, ast.For) and not statement.orelse:
        return cancelled_by_loop(statement)
    return set()


def cancelled_by_loop(loop):
    loop_name, source = chain_text(loop.target), chain_text(loop.iter)
    only = loop.body[0] if len(loop.body) == 1 else None
    if loop_name and source and isinstance(only, ast.Expr):
        if chain_text(cancel_target(only.value)) == loop_name:
            return {f"*{source}"}
    return set()


def rebinds(statement, key):
    name = key.lstrip("*")
    for node in ast.walk(statement):
        stored = isinstance(node, (ast.Name, ast.Attribute)) and isinstance(
            node.ctx, (ast.Store, ast.Del)
        )
        text = chain_text(node) if stored else None
        if text and (text == name or name.startswith(f"{text}.")):
            return True
    return False


def requirement(value, context):
    text = chain_text(value)
    if text:
        return [text]
    if isinstance(value, ast.Call) and (
        resolved_name(value.func, context) == "asyncio.gather"
    ):
        return gathered(value.args)
    return None


def gathered(arguments):
    found = []
    for argument in arguments:
        starred = isinstance(argument, ast.Starred)
        text = chain_text(argument.value if starred else argument)
        if text is None:
            return None
        found.append(f"*{text}" if starred else text)
    return found or None


def awaited_requirements(statements, context):
    needed = []
    for statement in statements:
        value = getattr(statement, "value", None)
        if not (
            isinstance(statement, (ast.Expr, ast.Assign))
            and isinstance(value, ast.Await)
        ):
            return None
        found = requirement(value.value, context)
        if found is None:
            return None
        needed.extend(found)
    return needed or None


def enclosing_blocks(node, context):
    chain = []
    current = node
    while current is not None and not isinstance(current, FUNCTIONS):
        parent = context.parents.get(id(current))
        for field in BLOCKS:
            block = getattr(parent, field, None)
            if isinstance(block, list) and current in block:
                chain.append(block[: block.index(current)])
        current = parent
    return chain


def cancelled_before(node, context):
    cancelled = set()
    for earlier in reversed(enclosing_blocks(node, context)):
        for statement in earlier:
            cancelled = {key for key in cancelled if not rebinds(statement, key)}
            cancelled |= cancelled_by(statement)
    return cancelled


def awaits_cancelled(node, body, context):
    needed = awaited_requirements(body, context)
    return needed is not None and set(needed) <= cancelled_before(node, context)


def is_async(node, context):
    current = context.parents.get(id(node))
    while current is not None:
        if isinstance(current, FUNCTIONS):
            return isinstance(current, ast.AsyncFunctionDef)
        current = context.parents.get(id(current))
    return False


def is_quiet(statement, context):
    if isinstance(statement, ast.Expr):
        value = statement.value
        return isinstance(value, ast.Constant) or (
            isinstance(value, ast.Call) and is_log_call(value, context.aliases)
        )
    return isinstance(statement, ast.Pass) or (
        isinstance(statement, ast.Return) and statement.value is None
    )


def quiet(statements, context):
    return all(is_quiet(statement, context) for statement in statements)
