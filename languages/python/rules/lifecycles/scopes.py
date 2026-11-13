import ast

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
CLOSE_NAMES = {
    "close",
    "aclose",
    "__exit__",
    "__aexit__",
    "dispose",
    "destroy",
    "shutdown",
    "stop",
    "teardown",
    "disconnect",
    "end",
}
TEST_TEARDOWNS = {
    "tearDown",
    "tearDownClass",
    "asyncTearDown",
    "teardown_method",
    "teardown_class",
    "teardown_function",
    "teardown_module",
    "pytest_sessionfinish",
    "pytest_unconfigure",
}
RELEASE_METHODS = {
    "close",
    "aclose",
    "disconnect",
    "destroy",
    "shutdown",
    "stop",
    "terminate",
    "unsubscribe",
    "dispose",
    "quit",
}
FIXTURE_NAMES = {"fixture", "yield_fixture"}


def is_close_function(function):
    return function.name in CLOSE_NAMES or function.name in TEST_TEARDOWNS


def decorator_name(decorator):
    node = decorator.func if isinstance(decorator, ast.Call) else decorator
    if isinstance(node, ast.Attribute):
        return node.attr
    return node.id if isinstance(node, ast.Name) else None


def is_fixture(function):
    return any(decorator_name(item) in FIXTURE_NAMES for item in function.decorator_list)


def self_attribute(node):
    if (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id in {"self", "cls"}
    ):
        return node.attr
    return None


def methods_of(cls):
    return [node for node in cls.body if isinstance(node, FUNCTIONS)]


def class_closers(cls):
    return [method for method in methods_of(cls) if method.name in CLOSE_NAMES]


def statement_lists(statement):
    if isinstance(statement, FUNCTIONS + (ast.ClassDef,)):
        return
    for field in ("body", "orelse", "finalbody"):
        block = getattr(statement, field, None)
        if isinstance(block, list):
            yield block
    for handler in getattr(statement, "handlers", []):
        yield handler.body
    for case in getattr(statement, "cases", []):
        yield case.body


def blocks_of(function):
    pending = [function.body]
    while pending:
        block = pending.pop()
        yield block
        for statement in block:
            pending.extend(statement_lists(statement))
