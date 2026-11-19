import ast
import re

from checks.common import finding, own_nodes, parameter_names
from concurrency.functions import resolve_callee
from concurrency.remote import is_self

RULE = "swapped-arguments"
GUARDED = True
TRANSPARENT_DECORATORS = {"staticmethod", "classmethod", "override", "abstractmethod"}
SUFFIX = re.compile(r"(?:_[a-z]|\d+)$")
PAIRS = [
    {"left", "right"},
    {"lhs", "rhs"},
]


def plain(name):
    return name.lstrip("_").lower()


def stem(name):
    return SUFFIX.sub("", plain(name))


def interchangeable(first, second):
    one, two = plain(first), plain(second)
    if len(one) == 1 and len(two) == 1:
        return True
    if {one, two} in PAIRS:
        return True
    return stem(first) == stem(second) and bool(stem(first))


def argument_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute) and is_self(node.value):
        return node.attr
    return None


def decorator_name(decorator):
    node = decorator.func if isinstance(decorator, ast.Call) else decorator
    if isinstance(node, ast.Attribute):
        return node.attr
    return node.id if isinstance(node, ast.Name) else None


def plain_callee(function):
    return all(
        decorator_name(decorator) in TRANSPARENT_DECORATORS
        for decorator in function.decorator_list
    )


def is_decorated_with(function, name):
    return any(decorator_name(d) == name for d in function.decorator_list)


def bound_receiver(call, function):
    func = call.func
    if not (isinstance(func, ast.Attribute) and is_self(func.value)):
        return False
    if is_decorated_with(function, "staticmethod"):
        return False
    return func.value.id == "self" or is_decorated_with(function, "classmethod")


def slots(call, function):
    arguments = function.args
    parameters = [a.arg for a in arguments.posonlyargs + arguments.args]
    if bound_receiver(call, function):
        parameters = parameters[1:]
    given = []
    for value in call.args:
        if isinstance(value, ast.Starred):
            break
        given.append(argument_name(value))
    taken = {keyword.arg for keyword in call.keywords}
    return parameters, given, taken


def swaps_in(parameters, given, recursive):
    count = min(len(parameters), len(given))
    names = [plain(name) for name in parameters]
    if len(set(names[:count])) != count:
        return []
    swaps = []
    for index in range(count):
        name = given[index]
        if name is None or plain(name) not in names:
            continue
        other = names.index(plain(name))
        slot = given[other] if other < count else None
        if other == index or slot is None or plain(slot) == names[other]:
            continue
        exchange = plain(slot) == names[index]
        moved = other < index and plain(slot) not in names and not recursive
        if not (exchange or moved):
            continue
        if interchangeable(parameters[index], parameters[other]):
            continue
        if (other, index) not in swaps:
            swaps.append((index, other))
    return swaps


def subject_of(parameters, given, swap):
    index, other = swap
    return f"{given[index]}|{parameters[index]}|{given[other]}|{parameters[other]}"


def enclosing_functions(node, parents):
    found = []
    while id(node) in parents:
        node = parents[id(node)]
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            found.append(node)
    return found


def is_local_name(call, enclosing):
    if not isinstance(call.func, ast.Name):
        return False
    name = call.func.id
    return any(
        name in parameter_names(function)
        or any(
            isinstance(n, ast.Name) and n.id == name and isinstance(n.ctx, ast.Store)
            for n in own_nodes(function)
        )
        for function in enclosing
    )


def check(context):
    if context.tests:
        return []
    found = []
    for call in ast.walk(context.tree):
        if not isinstance(call, ast.Call):
            continue
        enclosing = enclosing_functions(call, context.parents)
        if is_local_name(call, enclosing):
            continue
        resolved = resolve_callee(call, call, context)
        if resolved is None or not plain_callee(resolved[1]):
            continue
        function = resolved[1]
        parameters, given, taken = slots(call, function)
        if taken & set(parameters):
            continue
        recursive = any(function is outer for outer in enclosing)
        for swap in swaps_in(parameters, given, recursive):
            subject = subject_of(parameters, given, swap)
            found.append(finding(context.path, RULE, subject, call))
    return found
