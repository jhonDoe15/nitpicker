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


def class_attributes(cls):
    declared = {}
    for node in ast.walk(cls):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                name = self_attribute(target)
                if name is not None:
                    declared.setdefault(name, (node, node.value, None))
        elif isinstance(node, ast.AnnAssign):
            name = self_attribute(node.target)
            if name is None and isinstance(node.target, ast.Name) and node in cls.body:
                name = node.target.id
            if name is not None:
                declared.setdefault(name, (node, node.value, node.annotation))
    return declared


def calls_in(function):
    return [node for node in ast.walk(function) if isinstance(node, ast.Call)]


def called_methods(function):
    names = []
    for call in calls_in(function):
        name = self_attribute(call.func)
        if name is not None:
            names.append(name)
    return names


def reachable_methods(cls, closer, depth=3):
    methods = {method.name: method for method in methods_of(cls)}
    seen = [closer]
    frontier = [closer]
    for _ in range(depth):
        frontier = [
            methods[name]
            for method in frontier
            for name in called_methods(method)
            if name in methods and methods[name] not in seen
        ]
        seen.extend(frontier)
    return seen


def attribute_aliases(method):
    found = {}
    for node in ast.walk(method):
        if isinstance(node, ast.Assign) and self_attribute(node.value) is not None:
            for target in node.targets:
                if isinstance(target, ast.Name):
                    found[target.id] = self_attribute(node.value)
    return found
