import ast
import fnmatch
import os

from checks.common import directories, finding

DEFAULT_PYTHON_FILES = ["test_*.py", "*_test.py"]
TEST_FILE_WORDS = ("test", "tests")
HELPER_DIRECTORIES = {
    "testing",
    "test_utils",
    "test_helpers",
    "test_support",
    "testutils",
    "test_fixtures",
    "fixtures",
}
HELPER_STEMS = {"testing", "testutils", "fixtures"}


def is_collected(path, patterns):
    name = os.path.basename(path)
    return any(
        fnmatch.fnmatch(name, pattern)
        or fnmatch.fnmatch(path, pattern)
        or fnmatch.fnmatch(path, f"*/{pattern}")
        for pattern in patterns
    )


def defines_tests(tree):
    for node in tree.body:
        if isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef)
        ) and node.name.startswith("test"):
            return True
        if isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            if any(
                isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef))
                and member.name.startswith("test")
                for member in node.body
            ):
                return True
    return False


def looks_like_test_file(path):
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    in_tests = bool(set(directories(path)) & {"tests", "test"})
    named = (
        stem in TEST_FILE_WORDS or stem.startswith("tests_") or stem.endswith("_tests")
    )
    return in_tests or named


def uncollected_findings(context):
    options = context.options
    if options.get("testRunner", "pytest") != "pytest" or context.path.endswith(
        "conftest.py"
    ):
        return []
    patterns = options.get("pythonFiles") or DEFAULT_PYTHON_FILES
    if is_collected(context.path, patterns) or not looks_like_test_file(context.path):
        return []
    if not defines_tests(context.tree):
        return []
    return [
        finding(
            context.path,
            "uncollected-tests",
            os.path.basename(context.path),
            context.tree.body[0],
        )
    ]


def under_source_root(path, roots):
    return any(
        root in {".", ""} or path == root or path.startswith(root.rstrip("/") + "/")
        for root in roots
    )


def helper_name(path):
    parts = path.split("/")
    directory = next((part for part in parts[:-1] if part in HELPER_DIRECTORIES), None)
    if directory is not None:
        return f"{directory}/"
    stem = os.path.splitext(parts[-1])[0]
    return parts[-1] if stem in HELPER_STEMS else None


def helper_findings(context):
    roots = context.options.get("sourceRoots") or ["."]
    if context.tests or not under_source_root(context.path, roots):
        return []
    name = helper_name(context.path)
    if name is None:
        return []
    return [
        {
            "rule": "test-helper-in-source",
            "path": context.path,
            "subject": name,
            "line": 1,
        }
    ]


def check(context):
    return uncollected_findings(context) + helper_findings(context)
