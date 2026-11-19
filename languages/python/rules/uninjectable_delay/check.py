import ast
import re

from checks.common import dotted_name, finding
from honesty.sleeps import FIXED_SLEEPS, delay_of
from uninjectable_delay.constants import (
    SECONDS_TO_MILLIS,
    constant_names,
    module_constants,
    number_of,
)

GUARDED = True
RULE = "uninjectable-delay"
MIN_DELAY_MILLIS = 500
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
OPTION_NAME = re.compile(
    r"option|opts|config|setting|delay|timeout|interval|wait|duration|param"
    r"|override|dependenc|deps|clock|sleeper|seconds|secs",
    re.IGNORECASE,
)


def outermost_function(node, parents):
    outermost = None
    current = parents.get(id(node))
    while current is not None:
        if isinstance(current, FUNCTIONS):
            outermost = current
        current = parents.get(id(current))
    return outermost


def is_dunder(name):
    return name.startswith("__") and name.endswith("__")


def is_public(function, parents):
    owner = parents.get(id(function))
    names = [function.name]
    while isinstance(owner, ast.ClassDef):
        names.append(owner.name)
        owner = parents.get(id(owner))
    if not isinstance(owner, ast.Module):
        return False
    return not any(name.startswith("_") and not is_dunder(name) for name in names)


def parameters(function):
    arguments = function.args
    return [*arguments.posonlyargs, *arguments.args, *arguments.kwonlyargs]


def default_names(function):
    arguments = function.args
    defaults = [*arguments.defaults, *(d for d in arguments.kw_defaults if d)]
    return {
        node.id for default in defaults for node in ast.walk(default) if isinstance(node, ast.Name)
    }


def can_carry_delay(function, name):
    return name in default_names(function) or any(
        OPTION_NAME.search(parameter.arg) for parameter in parameters(function)
    )


def owner_name(function, parents):
    owner = parents.get(id(function))
    if isinstance(owner, ast.ClassDef):
        return f"{owner.name}.{function.name}"
    return function.name


def check(context):
    if context.tests:
        return []
    constants = module_constants(context.tree)
    if not constants:
        return []
    found = []
    for node in ast.walk(context.tree):
        name = dotted_name(node.func, context.aliases) if isinstance(node, ast.Call) else None
        if name not in FIXED_SLEEPS:
            continue
        delay = delay_of(node)
        names = constant_names(delay, constants) if delay is not None else []
        seconds = number_of(delay, constants) if names else None
        function = outermost_function(node, context.parents)
        if (
            seconds is None
            or seconds * SECONDS_TO_MILLIS < MIN_DELAY_MILLIS
            or function is None
            or not is_public(function, context.parents)
            or can_carry_delay(function, names[0])
        ):
            continue
        millis = round(seconds * SECONDS_TO_MILLIS)
        subject = "|".join(
            [name, names[0], str(millis), owner_name(function, context.parents)]
        )
        found.append(finding(context.path, RULE, subject, node))
    return found

