import ast

from checks.common import finding, last_name
from environment.roots import is_composition_root
from locators.labels import lookup_label
from locators.resolve.references import uses_containers
from locators.wrappers import wrapper_label

RULE = "service-locator-lookup"


def subject_of(node, context):
    label = lookup_label(node, context)
    if label:
        return label
    wrapped = wrapper_label(node, context)
    if not wrapped:
        return None
    label, path = wrapped
    return f"{last_name(node.func)} via {label} in {path}"


def check(context):
    if context.tests or not uses_containers(context.project):
        return []
    if is_composition_root(context):
        return []
    found = {}
    calls = (n for n in ast.walk(context.tree) if isinstance(n, (ast.Call, ast.Subscript)))
    for node in calls:
        subject = subject_of(node, context)
        if subject:
            found.setdefault((node.lineno, subject), finding(context.path, RULE, subject, node))
    return list(found.values())
