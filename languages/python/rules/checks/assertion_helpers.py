import ast
import re

from assertion_rules import (
    DEFINITIONS,
    asserts,
    called_name,
    is_exempt,
    is_fixture,
    is_test_file,
    is_test_function,
    terminal_call,
    test_functions,
)
from rule_helpers import import_aliases, is_test_path

SUPPORT_STEM = re.compile(r"(?:^|_)(?:testing|assertions?|asserts?)(?:_|$)")
MIN_TEST_FILES = 3


def is_support_file(path):
    stem = path.split("/")[-1]
    stem = stem[: -len(".py")] if stem.endswith(".py") else stem
    return is_test_path(path) or bool(SUPPORT_STEM.search(stem))


def module_parts(path):
    parts = path[: -len(".py")].split("/") if path.endswith(".py") else path.split("/")
    return parts[:-1] if parts[-1] == "__init__" else parts


def definitions(tree):
    found = []
    for node in tree.body:
        if isinstance(node, DEFINITIONS):
            found.append(node)
        elif isinstance(node, ast.ClassDef):
            found.extend(
                member for member in node.body if isinstance(member, DEFINITIONS)
            )
    return found


def asserting_definitions(support, modules):
    project = {"names": set(), "modules": modules, "any_raise": True, "nested": False}
    return {
        function.name
        for tree, aliases in support
        for function in definitions(tree)
        if not is_test_function(function)
        and not is_fixture(function)
        and asserts(function, aliases, project)
    }


def terminal_name(function, aliases, modules):
    call = terminal_call(function)
    return None if call is None else called_name(call.func, aliases, modules)


def voting_files(tests, candidates, modules):
    project = {"names": set(), "modules": modules, "any_raise": False, "nested": True}
    votes = {}
    for path, tree, aliases in tests:
        for _, function in test_functions(tree):
            if is_exempt(function) or asserts(function, aliases, project):
                continue
            name = terminal_name(function, aliases, modules)
            if name in candidates:
                votes.setdefault(name, set()).add(path)
    return votes


def assertion_helpers(trees):
    parsed = {path: (tree, import_aliases(tree)) for path, tree in trees.items()}
    support_paths = [path for path in parsed if is_support_file(path)]
    modules = [module_parts(path) for path in support_paths]
    candidates = asserting_definitions([parsed[path] for path in support_paths], modules)
    tests = [(path, *parsed[path]) for path in parsed if is_test_file(path)]
    votes = voting_files(tests, candidates, modules)
    names = {name for name, paths in votes.items() if len(paths) >= MIN_TEST_FILES}
    return {"names": names, "modules": modules, "any_raise": False, "nested": True}
