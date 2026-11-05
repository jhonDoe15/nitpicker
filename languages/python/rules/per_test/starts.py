import ast
import os

from checks.common import dotted_name, finding
from per_test.kinds import call_key, heavy_calls
from silent_tests.calls import is_test_class, is_test_function

RULE = "server-or-container-per-test"
GUARDED = True
HOOKS = {"setup_method", "setUp", "asyncSetUp"}
MODULE_HOOKS = {"setup_function"}
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
CONFTEST = "conftest.py"
MAX_DEPTH = 20


def decorator_named(function, aliases, suffix):
    for decorator in function.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        if (dotted_name(target, aliases) or "").endswith(suffix):
            return decorator
    return None


def keyword(decorator, name):
    if isinstance(decorator, ast.Call):
        for item in decorator.keywords:
            if item.arg == name:
                return item.value
    return None


def constant(node, default):
    return node.value if isinstance(node, ast.Constant) else default


def parameters(function):
    arguments = function.args
    names = [item.arg for item in arguments.posonlyargs + arguments.args + arguments.kwonlyargs]
    return {name for name in names if name not in {"self", "cls"}}


def usefixtures_names(marks, aliases):
    names = set()
    for mark in marks:
        if isinstance(mark, ast.Call) and (dotted_name(mark.func, aliases) or "").endswith(
            "usefixtures"
        ):
            names.update(constant(item, None) for item in mark.args)
    return names - {None}


def module_marks(tree):
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "pytestmark" for target in node.targets
        ):
            value = node.value
            return list(value.elts) if isinstance(value, (ast.List, ast.Tuple)) else [value]
    return []


def used_fixtures(function, owner, context):
    marks = [*function.decorator_list, *(owner.decorator_list if owner else [])]
    return usefixtures_names(marks + module_marks(context.tree), context.aliases)


def param_count(decorator):
    params = keyword(decorator, "params")
    if isinstance(params, (ast.List, ast.Tuple)):
        return max(1, len(params.elts))
    return 1


def parametrize_values(decorator):
    if len(decorator.args) >= 2:
        return decorator.args[1]
    return keyword(decorator, "argvalues")


def case_count(function, aliases):
    count = 1
    for decorator in function.decorator_list:
        if not isinstance(decorator, ast.Call):
            continue
        if (dotted_name(decorator.func, aliases) or "").endswith("parametrize"):
            values = parametrize_values(decorator)
            if isinstance(values, (ast.List, ast.Tuple)):
                count *= max(1, len(values.elts))
    return count


def members(tree):
    for node in tree.body:
        if isinstance(node, DEFINITIONS):
            yield None, node
        elif isinstance(node, ast.ClassDef):
            for member in node.body:
                if isinstance(member, DEFINITIONS):
                    yield node, member


def visible(fixture, path, owner):
    if fixture["conftest"] is not None:
        root = fixture["conftest"]
        return root == "" or path.startswith(f"{root}/")
    if fixture["path"] != path:
        return False
    return fixture["owner"] is None or fixture["owner"] is owner


def closeness(fixture):
    if fixture["conftest"] is not None:
        return (0, len(fixture["conftest"]))
    return (1 if fixture["owner"] is None else 2, 0)


def serves(fixture, found, path, owner):
    candidates = [
        other
        for other in found["fixtures"]
        if other["name"] == fixture["name"] and visible(other, path, owner)
    ]
    return bool(candidates) and max(candidates, key=closeness) is fixture


def fixture_record(context, owner, function, decorator):
    scope = keyword(decorator, "scope")
    name = constant(keyword(decorator, "name"), None) or function.name
    conftest = os.path.basename(context.path) == CONFTEST
    return {
        "name": name,
        "path": context.path,
        "owner": owner,
        "conftest": os.path.dirname(context.path) if conftest else None,
        "per_test": scope is None or constant(scope, None) == "function",
        "autouse": constant(keyword(decorator, "autouse"), False) is True,
        "requests": parameters(function) - {"request"},
        "heavy": heavy_calls(function, context),
        "params": param_count(decorator),
        "function": function,
    }


def index(project):
    fixtures, tests = [], []
    for context in project.contexts.values():
        if not context.tests and os.path.basename(context.path) != CONFTEST:
            continue
        for owner, function in members(context.tree):
            decorator = decorator_named(function, context.aliases, "fixture")
            if decorator is not None:
                fixtures.append(fixture_record(context, owner, function, decorator))
            elif is_test_function(function) and (owner is None or is_test_class(owner)):
                tests.append(
                    {
                        "path": context.path,
                        "owner": owner,
                        "requests": parameters(function)
                        | used_fixtures(function, owner, context),
                        "cases": case_count(function, context.aliases),
                    }
                )
    return {"fixtures": fixtures, "tests": tests}


def runs(fixture, found, depth=0):
    if depth > MAX_DEPTH:
        return 0
    name = fixture["name"]
    total = sum(
        test["cases"]
        for test in found["tests"]
        if serves(fixture, found, test["path"], test["owner"])
        and (fixture["autouse"] or name in test["requests"])
    )
    for other in found["fixtures"]:
        if other is fixture or not other["per_test"] or name not in other["requests"]:
            continue
        if serves(fixture, found, other["path"], other["owner"]):
            total += runs(other, found, depth + 1)
    return total


def fixture_findings(context):
    found = context.project.memo("per-test-starts", index)
    reported = []
    for fixture in found["fixtures"]:
        if fixture["path"] != context.path or not fixture["per_test"] or not fixture["heavy"]:
            continue
        if runs(fixture, found) * fixture["params"] >= 2:
            name, node = fixture["heavy"][0]
            reported.append(finding(context.path, RULE, name, node))
    return reported


def hook_findings(context):
    return [
        finding(context.path, RULE, name, node)
        for owner, function in members(context.tree)
        if (owner is not None and function.name in HOOKS and is_test_class(owner))
        or (owner is None and function.name in MODULE_HOOKS)
        for name, node in heavy_calls(function, context)
    ]


def repeated_findings(context):
    groups = {}
    for owner, function in members(context.tree):
        if not is_test_function(function) or (owner is not None and not is_test_class(owner)):
            continue
        if decorator_named(function, context.aliases, "fixture") is not None:
            continue
        for name, node in heavy_calls(function, context):
            key = (owner.name if owner else None, call_key(node))
            groups.setdefault(key, []).append((function, name, node))
    return [
        finding(context.path, RULE, name, node)
        for sites in groups.values()
        if len({id(function) for function, _, _ in sites}) > 1
        for _, name, node in sites
    ]


def check(context):
    if not context.tests and os.path.basename(context.path) != CONFTEST:
        return []
    found = fixture_findings(context) + hook_findings(context) + repeated_findings(context)
    return sorted(found, key=lambda item: (item["line"], item["subject"]))
