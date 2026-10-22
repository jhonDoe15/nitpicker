import ast

from checks.common import dotted_name
from locators.model import REGISTRATION_ATTRIBUTES, REGISTRATION_METHODS
from locators.resolve.references import reference_of, uses_containers
from locators.resolve.symbols import resolve_in, symbols


def holds_registrations(node, context):
    if isinstance(node, ast.Attribute) and node.attr in REGISTRATION_ATTRIBUTES:
        node = node.value
    reference = reference_of(node, context)
    return reference is not None and reference[0] == "instance"


def registered_expressions(context):
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Assign):
            if any(
                isinstance(target, ast.Subscript)
                and holds_registrations(target.value, context)
                for target in node.targets
            ):
                yield [node.value]
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in REGISTRATION_METHODS
            and holds_registrations(node.func.value, context)
        ):
            yield [*node.args, *(keyword.value for keyword in node.keywords)]


def callbacks_in(expressions, context, functions):
    found = set()
    for expression in expressions:
        for node in ast.walk(expression):
            if isinstance(node, ast.Lambda):
                found.add(id(node))
            elif isinstance(node, (ast.Name, ast.Attribute)):
                dotted = dotted_name(node, context.aliases)
                key = resolve_in(context, dotted, functions) if dotted else None
                if key:
                    found.add(id(functions[key][1]))
    return found


def registered_callbacks(project):
    def build(_):
        found = set()
        if not uses_containers(project):
            return found
        functions = symbols(project)["functions"]
        for context in project.contexts.values():
            if context.tests:
                continue
            for expressions in registered_expressions(context):
                found |= callbacks_in(expressions, context, functions)
        return found

    return project.memo("locator-registrations", build)


def in_registration(node, context):
    callbacks = registered_callbacks(context.project)
    current = node
    while current is not None:
        if id(current) in callbacks:
            return True
        current = context.parents.get(id(current))
    return False
