import ast
import re

from discovery.patterns import DEFAULT_PYTHON_FILES, is_collected_file, option
from index.project import module_parts
from silent_tests.calls import (
    DEFINITIONS,
    asserts,
    called_name,
    is_exempt,
    is_fixture,
    is_test_function,
    terminal_call,
    test_functions,
)

SUPPORT_STEM = re.compile(r"(?:^|_)(?:testing|assertions?|asserts?)(?:_|$)")
MIN_TEST_FILES = 3


def is_test_file(context):
    patterns = option(context.options, "pythonFiles", DEFAULT_PYTHON_FILES)
    return is_collected_file(context.path, patterns)


def is_support_file(context):
    stem = context.path.split("/")[-1]
    stem = stem[: -len(".py")] if stem.endswith(".py") else stem
    return context.tests or bool(SUPPORT_STEM.search(stem))


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
        for context in support
        for function in definitions(context.tree)
        if not is_test_function(function)
        and not is_fixture(function)
        and asserts(function, context.aliases, project)
    }


def terminal_name(function, aliases, modules):
    call = terminal_call(function)
    return None if call is None else called_name(call.func, aliases, modules)


def voting_files(tests, candidates, modules):
    project = {"names": set(), "modules": modules, "any_raise": False, "nested": True}
    votes = {}
    for context in tests:
        for _, function in test_functions(context.tree):
            if is_exempt(function) or asserts(function, context.aliases, project):
                continue
            name = terminal_name(function, context.aliases, modules)
            if name in candidates:
                votes.setdefault(name, set()).add(context.path)
    return votes


def build_helpers(project):
    contexts = sorted(project.contexts.values(), key=lambda context: context.path)
    support = [context for context in contexts if is_support_file(context)]
    modules = [module_parts(context.path) for context in support]
    candidates = asserting_definitions(support, modules)
    tests = [context for context in contexts if is_test_file(context)]
    votes = voting_files(tests, candidates, modules)
    names = {name for name, paths in votes.items() if len(paths) >= MIN_TEST_FILES}
    return {"names": names, "modules": modules, "any_raise": False, "nested": True}


def assertion_helpers(project):
    return project.memo("assertion-helpers", build_helpers)
