import ast

from silent_tests.calls import TEST_NAME, is_fixture
from syntax.walk import if_chain

HOOK_PREFIX = "pytest_"
SETUP_NAMES = {
    "setUp",
    "setUpClass",
    "setUpModule",
    "asyncSetUp",
    "setup",
    "setup_method",
    "setup_class",
    "setup_module",
    "setup_function",
}
TRY_TYPES = (ast.Try, getattr(ast, "TryStar", ast.Try))
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def is_scope(function):
    name = function.name
    if is_fixture(function) or name.startswith(HOOK_PREFIX) or name in SETUP_NAMES:
        return True
    return TEST_NAME.match(name) is not None


def skip_scopes(tree):
    return [node for node in ast.walk(tree) if isinstance(node, FUNCTIONS) and is_scope(node)]


def push(stack, *bodies):
    for body in bodies:
        stack.extend(reversed(body))


def unconditional(body, folder, wanted):
    found = []
    stack = list(reversed(body))
    while stack:
        statement = stack.pop()
        if isinstance(statement, (ast.Expr, ast.Raise)):
            if wanted(statement):
                found.append(statement)
        elif isinstance(statement, ast.If):
            both_branches(statement, folder, wanted, stack, found)
        elif isinstance(statement, (ast.With, ast.AsyncWith)):
            push(stack, statement.body)
        elif isinstance(statement, TRY_TYPES):
            push(stack, statement.finalbody, statement.orelse, statement.body)
        elif isinstance(statement, (ast.For, ast.AsyncFor)):
            push(stack, statement.orelse, statement.body)
        elif isinstance(statement, ast.While):
            if folder.truthiness(statement.test) is True:
                push(stack, statement.body)
    return found


def both_branches(statement, folder, wanted, stack, found):
    truth = folder.truthiness(statement.test)
    if truth is not None:
        push(stack, statement.body if truth else statement.orelse)
        return
    _, bodies, final = if_chain(statement)
    if not final:
        return
    picks = [unconditional(body, folder, wanted) for body in [*bodies, final]]
    if all(picks):
        found.append(picks[0][0])
