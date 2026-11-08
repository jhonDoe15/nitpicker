import ast

from checks.common import finding, functions_of, own_nodes
from checks.loop_scope import ancestors
from containers.scope import (
    FUNCTIONS,
    contains,
    is_name,
    method_calls,
    name_stores,
    repeating_scopes,
)

RULE = "list-used-as-set"
APPENDS = {"append"}
POSITIONAL = {"insert", "pop", "index", "sort", "reverse"}


def is_new_list(value):
    if isinstance(value, ast.List):
        return True
    return (
        isinstance(value, ast.Call)
        and isinstance(value.func, ast.Name)
        and value.func.id == "list"
    )


def list_bindings(function):
    for node in own_nodes(function):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and is_new_list(node.value)
        ):
            yield node.targets[0].id, node


def membership_tests(function, name):
    for node in ast.walk(function):
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            right = node.comparators[0]
            if isinstance(node.ops[0], (ast.In, ast.NotIn)) and is_name(name)(right):
                yield node


def is_positional(function, name):
    calls = list(method_calls(function, is_name(name)))
    subscripts = [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Subscript) and is_name(name)(node.value)
    ]
    return bool(subscripts) or any(method in POSITIONAL for method, _ in calls)


def appends(function, name):
    calls = [
        call
        for method, call in method_calls(function, is_name(name))
        if method in APPENDS
    ]
    augmented = [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.AugAssign) and is_name(name)(node.target)
    ]
    return calls + augmented


def runs_repeatedly(test, binding, function, parents):
    if any(
        not contains(scope, binding) for scope in repeating_scopes(test, parents)
    ):
        return True
    chain = ancestors(test, parents)
    nested = chain[1 : chain.index(function)] if function in chain else []
    return any(isinstance(node, FUNCTIONS) for node in nested)


def check(context):
    if context.tests:
        return []
    found = []
    for function in functions_of(context.tree):
        for name, binding in list_bindings(function):
            if len(name_stores(function, name)) != 1:
                continue
            if not appends(function, name) or is_positional(function, name):
                continue
            repeated = [
                test
                for test in membership_tests(function, name)
                if runs_repeatedly(test, binding, function, context.parents)
            ]
            if repeated:
                found.append(finding(context.path, RULE, name, repeated[0]))
    return found
