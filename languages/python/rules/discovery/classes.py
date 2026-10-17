import ast

from checks.common import finding
from discovery.patterns import (
    DEFAULT_PYTHON_CLASSES,
    DEFAULT_PYTHON_FUNCTIONS,
    is_function,
    is_test_case,
    matches_name,
    option,
)

RULE = "uncollected-tests"


def test_methods(node, prefixes):
    return [
        member
        for member in node.body
        if is_function(member) and matches_name(member.name, prefixes)
    ]


def has_initializer(node):
    return any(is_function(m) and m.name == "__init__" for m in node.body)


def inherited_names(tree):
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            names.update(
                base.id if isinstance(base, ast.Name) else getattr(base, "attr", "")
                for base in node.bases
            )
    return names


def class_findings(context):
    options = context.options
    classes = option(options, "pythonClasses", DEFAULT_PYTHON_CLASSES)
    functions = option(options, "pythonFunctions", DEFAULT_PYTHON_FUNCTIONS)
    inherited = inherited_names(context.tree)
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.ClassDef) or is_test_case(node):
            continue
        if not test_methods(node, functions):
            continue
        if not matches_name(node.name, classes):
            if node.name not in inherited:
                found.append(
                    finding(context.path, RULE, f"{node.name} (python_classes)", node)
                )
        elif has_initializer(node):
            found.append(finding(context.path, RULE, f"{node.name} (__init__)", node))
    return found


def defines_tests(tree, options):
    classes = option(options, "pythonClasses", DEFAULT_PYTHON_CLASSES)
    functions = option(options, "pythonFunctions", DEFAULT_PYTHON_FUNCTIONS)
    for node in tree.body:
        if is_function(node) and matches_name(node.name, functions):
            return True
        if isinstance(node, ast.ClassDef) and (
            is_test_case(node)
            or (matches_name(node.name, classes) and test_methods(node, functions))
        ):
            if test_methods(node, functions):
                return True
    return False
