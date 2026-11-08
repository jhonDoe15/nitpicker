import ast
from collections import namedtuple

from checks.common import finding, functions_of, own_nodes
from checks.loop_scope import ancestors
from containers.scope import (
    FUNCTIONS,
    binds_locally,
    contains,
    is_name,
    method_calls,
    name_stores,
    repeating_scopes,
)

RULE = "list-used-as-set"
Binding = namedtuple("Binding", ["name", "node"])
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
        targets = node.targets if isinstance(node, ast.Assign) else []
        if isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [node.target]
        if (
            len(targets) == 1
            and isinstance(targets[0], ast.Name)
            and is_new_list(node.value)
        ):
            yield targets[0].id, node


def binding_count(function, name):
    augmented = {
        id(node.target)
        for node in own_nodes(function)
        if isinstance(node, ast.AugAssign)
    }
    return sum(id(store) not in augmented for store in name_stores(function, name))


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


def is_recursive(function):
    return not isinstance(function, ast.Lambda) and any(
        isinstance(node, ast.Name) and node.id == function.name
        for node in ast.walk(function)
    )


def nested_functions(test, function, parents):
    chain = ancestors(test, parents)
    nested = chain[1 : chain.index(function)] if function in chain else []
    return [node for node in nested if isinstance(node, FUNCTIONS)]


def runs_repeatedly(test, binding, function, parents):
    nested = nested_functions(test, function, parents)
    if any(binds_locally(node, binding.name) for node in nested):
        return False
    if any(
        not contains(scope, binding.node) for scope in repeating_scopes(test, parents)
    ):
        return True
    return any(is_recursive(node) for node in nested)


def check(context):
    if context.tests:
        return []
    found = []
    for function in [context.tree, *functions_of(context.tree)]:
        for name, node in list_bindings(function):
            if binding_count(function, name) != 1:
                continue
            if not appends(function, name) or is_positional(function, name):
                continue
            repeated = [
                test
                for test in membership_tests(function, name)
                if runs_repeatedly(test, Binding(name, node), function, context.parents)
            ]
            if repeated:
                found.append(finding(context.path, RULE, name, repeated[0]))
    return found
