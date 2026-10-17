import ast
import fnmatch
import os

DEFAULT_PYTHON_FILES = ["test_*.py", "*_test.py"]
DEFAULT_PYTHON_CLASSES = ["Test"]
DEFAULT_PYTHON_FUNCTIONS = ["test"]
DEFAULT_UNITTEST_FILES = ["test*.py"]
TEST_FILE_WORDS = ("test", "tests")
TEST_CASE_NAMES = {"TestCase", "IsolatedAsyncioTestCase", "AsyncTestCase"}


def option(options, key, default):
    value = options.get(key)
    return value if value else default


def matches_name(name, patterns):
    return any(name.startswith(p) or fnmatch.fnmatch(name, p) for p in patterns)


def is_collected_file(path, patterns):
    name = os.path.basename(path)
    return any(
        (
            fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch(path, f"*/{pattern}")
            if "/" in pattern
            else fnmatch.fnmatch(name, pattern)
        )
        for pattern in patterns
    )


def looks_like_test_file(path):
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    parts = path.split("/")[:-1]
    named = (
        stem in TEST_FILE_WORDS or stem.startswith("tests_") or stem.endswith("_tests")
    )
    return bool(set(parts) & {"tests", "test"}) or named


def is_function(node):
    return isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))


def is_test_case(node):
    names = (
        base.attr if isinstance(base, ast.Attribute) else getattr(base, "id", "")
        for base in node.bases
    )
    return any(name in TEST_CASE_NAMES for name in names)
