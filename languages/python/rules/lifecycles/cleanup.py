import ast

from checks.common import finding
from lifecycles.scopes import (
    FUNCTIONS,
    RELEASE_METHODS,
    blocks_of,
    is_close_function,
    is_fixture,
)

RULE = "cleanup-skipped-on-failure"
MAX_NAMED = 3
RESET_NAMES = {"None", "False"}
GATHERS = {"gather"}


def release_call(node):
    if isinstance(node, ast.Await):
        node = node.value
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in RELEASE_METHODS
    ):
        return node
    return None


def statement_call(statement):
    if isinstance(statement, ast.Expr):
        return release_call(statement.value)
    return None


def is_reset(statement):
    if isinstance(statement, ast.Assign):
        value = statement.value
        empty = isinstance(value, (ast.List, ast.Dict, ast.Set, ast.Tuple)) or (
            isinstance(value, ast.Call)
            and isinstance(value.func, ast.Name)
            and value.func.id in {"dict", "list", "set"}
        )
        constant = isinstance(value, ast.Constant) and (
            value.value is None or value.value is False
        )
        return constant or empty
    if isinstance(statement, ast.Delete):
        return True
    return (
        isinstance(statement, ast.Expr)
        and isinstance(statement.value, ast.Call)
        and isinstance(statement.value.func, ast.Attribute)
        and statement.value.func.attr == "clear"
    )


def step_text(statement):
    call = statement_call(statement)
    if call is not None:
        return f"{ast.unparse(call.func)}()"
    if is_reset(statement):
        if isinstance(statement, ast.Expr):
            return f"{ast.unparse(statement.value.func)}()"
        return ast.unparse(statement.targets[0])
    return None


def named(steps):
    shown = ", ".join(steps[:MAX_NAMED])
    rest = len(steps) - MAX_NAMED
    return f"{shown} and {rest} more" if rest > 0 else shown


def receiver(statement):
    call = statement_call(statement)
    if call is not None:
        return ast.unparse(call.func.value)
    if isinstance(statement, ast.Assign):
        return ast.unparse(statement.targets[0])
    if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
        return ast.unparse(statement.value.func.value)
    return None


def other_step(statement, owner):
    text = step_text(statement)
    if text is None or receiver(statement) == owner:
        return None
    return text


def sequential(function, block):
    for index, statement in enumerate(block):
        call = statement_call(statement)
        if call is None:
            continue
        owner = receiver(statement)
        later = [other_step(item, owner) for item in block[index + 1 :]]
        later = [step for step in later if step is not None]
        if later:
            first = f"{ast.unparse(call.func)}()"
            return statement, f"{function.name}: {first} before {named(later)}"
    return None


def has_yield(statement):
    return isinstance(statement, ast.Expr) and isinstance(
        statement.value, (ast.Yield, ast.YieldFrom)
    )


def cleanup_blocks(function):
    if is_close_function(function):
        return list(blocks_of(function))
    if not is_fixture(function):
        return []
    found = []
    for block in blocks_of(function):
        marks = [index for index, item in enumerate(block) if has_yield(item)]
        if marks:
            found.append(block[marks[0] + 1 :])
    return found


def is_gather(call):
    func = call.func
    name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
    return name in GATHERS


def releases_all(call):
    elements = [
        item.value if isinstance(item, ast.Starred) else item for item in call.args
    ]
    releases = [item for item in elements if release_call(item) is not None]
    spread = [
        item
        for item in elements
        if isinstance(item, (ast.GeneratorExp, ast.ListComp))
        and release_call(item.elt) is not None
    ]
    return len(releases) > 1 or bool(spread)


def tolerant(call):
    return any(
        keyword.arg == "return_exceptions"
        and not (isinstance(keyword.value, ast.Constant) and keyword.value.value is False)
        for keyword in call.keywords
    )


def parallel(function):
    found = []
    for node in ast.walk(function):
        if isinstance(node, ast.Call) and is_gather(node):
            if releases_all(node) and not tolerant(node):
                found.append((node, f"{function.name}: gather over releases"))
    return found


def own_functions(tree):
    return [node for node in ast.walk(tree) if isinstance(node, FUNCTIONS)]


def check(context):
    found = []
    for function in own_functions(context.tree):
        for block in cleanup_blocks(function):
            skipped = sequential(function, block)
            if skipped is not None:
                found.append(finding(context.path, RULE, skipped[1], skipped[0]))
        if is_close_function(function):
            found.extend(
                finding(context.path, RULE, subject, node)
                for node, subject in parallel(function)
            )
    return found
