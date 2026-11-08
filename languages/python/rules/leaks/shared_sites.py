import ast

from per_test.starts import constant, decorator_named, keyword
from silent_tests.calls import is_fixture, is_test_class, is_test_function

DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
PER_TEST_HOOKS = {
    "setup",
    "teardown",
    "setup_method",
    "teardown_method",
    "setUp",
    "tearDown",
    "asyncSetUp",
    "asyncTearDown",
    "setup_function",
    "teardown_function",
}
SELF_NAMES = {"self", "cls"}


def members(tree):
    for node in tree.body:
        if isinstance(node, DEFINITIONS):
            yield None, node
        elif isinstance(node, ast.ClassDef) and is_test_class(node):
            for member in node.body:
                if isinstance(member, DEFINITIONS):
                    yield node, member


def fixture_scope(function, aliases):
    decorator = decorator_named(function, aliases, "fixture")
    if decorator is None:
        return None
    scope = keyword(decorator, "scope")
    per_test = scope is None or constant(scope, None) == "function"
    return {"per_test": per_test}


def role_of(owner, function, aliases):
    if function.name in PER_TEST_HOOKS:
        return "hook"
    if is_fixture(function):
        scope = fixture_scope(function, aliases)
        if scope is None or not scope["per_test"]:
            return None
        return "hook"
    if is_test_function(function) and (owner is None or is_test_class(owner)):
        return "test"
    return "helper"


def called_names(function):
    names = set()
    for node in ast.walk(function):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Name):
            names.add((None, node.func.id))
        elif (
            isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id in SELF_NAMES
        ):
            names.add(("self", node.func.attr))
    return names


def callable_from(helper, sites):
    owner_of_helper, function = helper
    for site_owner, site in sites:
        for kind, name in called_names(site):
            if name != function.name or site is function:
                continue
            if owner_of_helper is None and kind is None:
                return True
            if owner_of_helper is not None and kind == "self" and site_owner is owner_of_helper:
                return True
    return False


def site_functions(context):
    roles = {"test": [], "hook": [], "helper": []}
    for owner, function in members(context.tree):
        role = role_of(owner, function, context.aliases)
        if role is not None:
            roles[role].append((owner, function))
    starts = roles["test"] + roles["hook"]
    helpers = [item for item in roles["helper"] if callable_from(item, starts)]
    reset_helpers = [item for item in roles["helper"] if callable_from(item, roles["hook"])]
    return {"writes": starts + helpers, "resets": roles["hook"] + reset_helpers}
