import ast
import re

from checks.common import dotted_name

PYTEST_CALLS = {
    "pytest.raises",
    "pytest.warns",
    "pytest.deprecated_call",
    "pytest.fail",
    "pytest.skip",
    "pytest.xfail",
    "pytest.importorskip",
}
SELF_CALLS = {"fail", "skiptest"}
SELF_NAMES = {"self", "cls"}
CHECK_MODULE = "pytest_check"
EXEMPT_DECORATORS = {"skip", "skipif", "xfail", "skiptest", "skipunless"}
FIXTURE_DECORATORS = {"fixture", "yield_fixture"}
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
TEST_NAME = re.compile(r"test(?:$|_|[A-Z])")


def callee_name(func):
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def own_nodes(function, nested=False):
    pending = list(function.body)
    while pending:
        node = pending.pop()
        yield node
        if nested or not isinstance(node, SCOPES):
            pending.extend(ast.iter_child_nodes(node))


def is_check_module(node, aliases):
    target = node.func if isinstance(node, ast.Call) else node
    name = dotted_name(target, aliases) or ""
    return name == CHECK_MODULE or name.startswith(CHECK_MODULE + ".")


def is_self(node):
    return isinstance(node, ast.Name) and node.id in SELF_NAMES


def in_project(dotted, modules):
    parts = (dotted or "").split(".")
    return any(module[-len(parts) :] == parts for module in modules)


def is_imported_assertion(func, aliases, modules):
    resolved = aliases[0].get(func.id)
    return (
        func.id.lower().startswith("assert")
        and resolved is not None
        and not in_project(resolved.rsplit(".", 1)[0], modules)
    )


def is_assertion_call(call, aliases, modules):
    func = call.func
    if isinstance(func, ast.Attribute) and func.attr.lower().startswith("assert"):
        return True
    if isinstance(func, ast.Name) and is_imported_assertion(func, aliases, modules):
        return True
    resolved = dotted_name(func, aliases) or ""
    if resolved in PYTEST_CALLS or resolved.endswith(".expect"):
        return True
    if is_check_module(call, aliases):
        return True
    return (
        isinstance(func, ast.Attribute)
        and is_self(func.value)
        and func.attr.lower() in SELF_CALLS
    )


def is_assertion_error(node):
    target = node.func if isinstance(node, ast.Call) else node
    return callee_name(target) == "AssertionError"


def is_assertion_node(node, aliases, project):
    if isinstance(node, ast.Assert):
        return True
    if isinstance(node, ast.Raise):
        return project["any_raise"] or is_assertion_error(node.exc)
    if isinstance(node, (ast.With, ast.AsyncWith)):
        return any(is_check_module(item.context_expr, aliases) for item in node.items)
    return isinstance(node, ast.Call) and is_assertion_call(
        node, aliases, project["modules"]
    )


def called_name(func, aliases, modules):
    if isinstance(func, ast.Name):
        return func.id
    if not isinstance(func, ast.Attribute):
        return None
    if is_self(func.value) or in_project(dotted_name(func.value, aliases), modules):
        return func.attr
    return None


def asserts(function, aliases, project):
    for node in own_nodes(function, project["nested"]):
        if is_assertion_node(node, aliases, project):
            return True
        if isinstance(node, ast.Call):
            name = called_name(node.func, aliases, project["modules"])
            if name in project["names"]:
                return True
    return False


def terminal_call(function):
    for statement in reversed(function.body):
        if isinstance(statement, ast.Expr) and isinstance(
            statement.value, ast.Constant
        ):
            continue
        value = statement.value if isinstance(statement, ast.Expr) else None
        if isinstance(value, ast.Await):
            value = value.value
        return value if isinstance(value, ast.Call) else None
    return None


def is_test_function(function):
    return TEST_NAME.match(function.name) is not None


def has_decorator(function, names):
    for decorator in function.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        name = callee_name(target)
        if name is not None and name.lower() in names:
            return True
    return False


def is_fixture(function):
    return has_decorator(function, FIXTURE_DECORATORS)


def is_exempt(function):
    return has_decorator(function, EXEMPT_DECORATORS)


def is_test_class(node):
    return node.name.startswith("Test") or any(
        (callee_name(base) or "").endswith("TestCase") for base in node.bases
    )


def is_test(function):
    return is_test_function(function) and not is_fixture(function)


def is_unittest_class(node):
    return node is not None and any(
        (callee_name(base) or "").endswith("TestCase") for base in node.bases
    )


def statement_blocks(statement):
    if isinstance(statement, (ast.If, ast.With, ast.AsyncWith, ast.For, ast.While)):
        return [statement.body, getattr(statement, "orelse", [])]
    if isinstance(statement, (ast.Try, getattr(ast, "TryStar", ast.Try))):
        handlers = [handler.body for handler in statement.handlers]
        return [statement.body, *handlers, statement.orelse, statement.finalbody]
    return []


def test_cases(tree):
    found = []
    stack = [(statement, ()) for statement in reversed(tree.body)]
    while stack:
        statement, owners = stack.pop()
        if isinstance(statement, DEFINITIONS) and is_test(statement):
            name = ".".join([owner.name for owner in owners] + [statement.name])
            found.append((name, statement, owners[-1] if owners else None))
        elif isinstance(statement, ast.ClassDef) and is_test_class(statement):
            members = [(member, (*owners, statement)) for member in statement.body]
            stack.extend(reversed(members))
        else:
            for block in statement_blocks(statement):
                stack.extend((child, owners) for child in reversed(block))
    return sorted(found, key=lambda case: case[1].lineno)


def test_functions(tree):
    return [(name, function) for name, function, _ in test_cases(tree)]
