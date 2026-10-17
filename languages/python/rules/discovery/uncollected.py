import ast
import os

from checks.common import finding
from discovery.classes import class_findings, defines_tests, test_methods
from discovery.excluded import file_reason, hidden_test_findings
from discovery.patterns import (
    DEFAULT_PYTHON_FILES,
    DEFAULT_PYTHON_FUNCTIONS,
    DEFAULT_UNITTEST_FILES,
    is_collected_file,
    is_test_case,
    looks_like_test_file,
    matches_name,
    option,
)

RULE = "uncollected-tests"


def defines_test_cases(tree):
    return any(
        isinstance(node, ast.ClassDef)
        and is_test_case(node)
        and test_methods(node, ["test"])
        for node in ast.walk(tree)
    )


def file_finding(context, subject):
    return [finding(context.path, RULE, subject, context.tree.body[0])]


def pytest_findings(context):
    options = context.options
    path = context.path
    patterns = option(options, "pythonFiles", DEFAULT_PYTHON_FILES)
    collected = is_collected_file(path, patterns)
    if not collected:
        if looks_like_test_file(path) and defines_tests(context.tree, options):
            return file_finding(context, os.path.basename(path))
        return []
    if not defines_tests(context.tree, options):
        return []
    reason = file_reason(path, context)
    if reason:
        return file_finding(context, reason)
    functions = option(options, "pythonFunctions", DEFAULT_PYTHON_FUNCTIONS)
    return class_findings(context) + hidden_test_findings(
        context, lambda name: matches_name(name, functions)
    )


def unittest_findings(context):
    path = context.path
    if (
        looks_like_test_file(path)
        and not is_collected_file(path, DEFAULT_UNITTEST_FILES)
        and defines_test_cases(context.tree)
    ):
        return file_finding(context, f"{os.path.basename(path)} (unittest)")
    return []


def check(context):
    if os.path.basename(context.path) == "conftest.py" or not context.tree.body:
        return []
    if context.options.get("testRunner", "pytest") == "unittest":
        return unittest_findings(context)
    return pytest_findings(context)
