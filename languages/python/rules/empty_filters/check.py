import ast

from checks.common import finding, shown
from empty_filters.forms import argument_form

RULE = "empty-filter-condition"
METHODS = {"filter", "exclude", "get", "aget", "where"}


def call_form(node, context):
    if not isinstance(node.func, ast.Attribute) or node.func.attr not in METHODS:
        return None
    for argument in node.args:
        form = argument_form(argument, context)
        if form is not None:
            return form, argument
    return None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call):
            result = call_form(node, context)
            if result is not None:
                form, argument = result
                subject = f"{node.func.attr}|{form}|{shown(ast.unparse(argument))}"
                found.append(finding(context.path, RULE, subject, node))
    return found
