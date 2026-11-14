import ast

from checks.common import finding
from lifecycles.scopes import (
    FUNCTIONS,
    class_attributes,
    attribute_aliases,
    class_closers,
    reachable_methods,
    self_attribute,
)

RULE = "pending-unsettled-on-close"
FUTURE_FACTORIES = {"create_future", "Future", "Deferred"}
FUTURE_TYPES = ("Future", "Deferred")
SETTLE_METHODS = {"set_exception", "cancel", "set_result", "reject", "resolve"}
CONTAINER_CALLS = {"dict", "defaultdict", "OrderedDict", "list", "set"}
ADDING = {"setdefault", "append", "add", "update", "insert"}


def is_container(value, annotation):
    if isinstance(value, (ast.Dict, ast.List, ast.Set)):
        return True
    if isinstance(value, ast.Call):
        func = value.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        return name in CONTAINER_CALLS
    return value is None and annotation is not None


def mentions_future(annotation):
    return annotation is not None and any(
        word in ast.unparse(annotation) for word in FUTURE_TYPES
    )


def creates_future(value):
    if not isinstance(value, ast.Call):
        return False
    func = value.func
    name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
    return name in FUTURE_FACTORIES


def future_names(method):
    return {
        target.id
        for node in ast.walk(method)
        if isinstance(node, ast.Assign) and creates_future(node.value)
        for target in node.targets
        if isinstance(target, ast.Name)
    }


def adds_future(cls, name):
    for method in (node for node in ast.walk(cls) if isinstance(node, FUNCTIONS)):
        futures = future_names(method)
        for node in ast.walk(method):
            value = added_value(node, name)
            if value is not None and (
                creates_future(value)
                or (isinstance(value, ast.Name) and value.id in futures)
            ):
                return True
    return False


def added_value(node, name):
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if (
                isinstance(target, ast.Subscript)
                and self_attribute(target.value) == name
            ):
                return node.value
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in ADDING
        and self_attribute(node.func.value) == name
        and node.args
    ):
        return node.args[-1]
    return None


def mentions(node, name, aliases=None):
    aliases = aliases or {}
    return any(
        self_attribute(child) == name
        or (isinstance(child, ast.Name) and aliases.get(child.id) == name)
        for child in ast.walk(node)
    )


def settles(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in SETTLE_METHODS
    )


def settles_in(method, name):
    aliases = attribute_aliases(method)
    for node in ast.walk(method):
        if isinstance(node, ast.Call) and any(mentions(arg, name, aliases) for arg in node.args):
            if not (
                isinstance(node.func, ast.Attribute)
                and node.func.attr in {"append", "add", "extend"}
                and self_attribute(node.func.value) == name
            ):
                return True
        loops = (ast.For, ast.AsyncFor, ast.comprehension)
        if isinstance(node, loops) and mentions(node.iter, name, aliases):
            if any(
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Attribute)
                and child.func.attr in SETTLE_METHODS
                for child in ast.walk(node)
            ):
                return True
        if isinstance(node, ast.While) and mentions(node.test, name, aliases):
            if any(settles(child) for child in ast.walk(node)):
                return True
    return False


def check(context):
    found = []
    for cls in (node for node in ast.walk(context.tree) if isinstance(node, ast.ClassDef)):
        closers = class_closers(cls)
        if not closers:
            continue
        for name, (node, value, annotation) in class_attributes(cls).items():
            if not is_container(value, annotation):
                continue
            if not (mentions_future(annotation) or adds_future(cls, name)):
                continue
            reached = [m for closer in closers for m in reachable_methods(cls, closer)]
            if not any(settles_in(method, name) for method in reached):
                subject = f"{cls.name}.{name}: {closers[0].name}"
                found.append(finding(context.path, RULE, subject, node))
    return found
