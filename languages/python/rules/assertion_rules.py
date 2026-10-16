import ast
import re
from collections import Counter

ASSERTION_NAMES = {
    "raises",
    "warns",
    "deprecated_call",
    "fail",
    "skip",
    "skiptest",
    "xfail",
    "importorskip",
    "expect",
}
HELPER_PREFIXES = (
    "check",
    "verify",
    "ensure",
    "validate",
    "expect",
    "should",
    "must",
    "confirm",
    "compare",
    "require",
)
EXEMPT_DECORATORS = {"skip", "skipif", "xfail", "skiptest", "skipunless"}
SUPPORT_STEM = re.compile(r"(?:^|_)(?:testing|assertions?|asserts?)(?:_|$)")
MIN_TERMINAL_USES = 2
MAX_ROUNDS = 5


def callee_name(func):
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def is_assertion_name(name, helpers):
    lowered = name.lower()
    return lowered.startswith("assert") or lowered in ASSERTION_NAMES or name in helpers


def asserts(function, helpers):
    for node in ast.walk(function):
        if isinstance(node, ast.Assert):
            return True
        if isinstance(node, ast.Raise) and is_assertion_error(node.exc):
            return True
        if isinstance(node, ast.Call):
            name = callee_name(node.func)
            if name is not None and is_assertion_name(name, helpers):
                return True
    return False


def is_assertion_error(node):
    target = node.func if isinstance(node, ast.Call) else node
    return callee_name(target) == "AssertionError"


def functions(tree):
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]


def terminal_call(function):
    for statement in reversed(function.body):
        if isinstance(statement, ast.Expr) and isinstance(
            statement.value, ast.Constant
        ):
            continue
        value = statement.value if isinstance(statement, ast.Expr) else None
        if isinstance(value, ast.Await):
            value = value.value
        return callee_name(value.func) if isinstance(value, ast.Call) else None
    return None


TEST_NAME = re.compile(r"test(?:$|_|[A-Z])")


def is_test_function(function):
    return TEST_NAME.match(function.name) is not None


def measured_helpers(test_trees):
    counts = Counter()
    for tree in test_trees:
        for function in functions(tree):
            name = is_test_function(function) and terminal_call(function)
            if name and name.lower().startswith(HELPER_PREFIXES):
                counts[name] += 1
    return {name for name, uses in counts.items() if uses >= MIN_TERMINAL_USES}


def defined_helpers(support_trees, helpers):
    known = set(helpers)
    for _ in range(MAX_ROUNDS):
        found = {
            function.name
            for tree in support_trees
            for function in functions(tree)
            if not is_test_function(function) and asserts(function, known)
        }
        if found <= known:
            break
        known |= found
    return known


def assertion_helpers(test_trees, support_trees):
    return defined_helpers(support_trees, measured_helpers(test_trees))


def is_test_file(path):
    name = path.split("/")[-1]
    return name.startswith("test_") or name.endswith("_test.py")


def is_support_file(path, is_test_path):
    stem = path.split("/")[-1][: -len(".py")] if path.endswith(".py") else path
    return is_test_path(path) or bool(SUPPORT_STEM.search(stem))


def is_exempt(function):
    for decorator in function.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        if callee_name(target) and callee_name(target).lower() in EXEMPT_DECORATORS:
            return True
    return False


def is_test_class(node):
    return node.name.startswith("Test") or any(
        (callee_name(base) or "").endswith("TestCase") for base in node.bases
    )


def test_functions(tree):
    found = []
    for node in tree.body:
        if isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef)
        ) and is_test_function(node):
            found.append((node.name, node))
        elif isinstance(node, ast.ClassDef) and is_test_class(node):
            found.extend(
                (f"{node.name}.{member.name}", member)
                for member in node.body
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef))
                and is_test_function(member)
            )
    return found


def unasserted_tests(tree, helpers):
    return [
        (subject, function)
        for subject, function in test_functions(tree)
        if not is_exempt(function) and not asserts(function, helpers)
    ]
