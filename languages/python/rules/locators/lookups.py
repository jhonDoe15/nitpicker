import ast

from checks.common import finding, last_name
from environment.environment import is_main_guard
from environment.roots import is_composition_root
from locators.labels import lookup_label
from locators.resolve.references import uses_containers
from locators.wrappers import wrapper_label

RULE = "service-locator-lookup"
GUARDED = True
SITES = (ast.Call, ast.Subscript, ast.Attribute)


def subject_of(node, context):
    label = lookup_label(node, context)
    if label:
        return label
    wrapped = wrapper_label(node, context) if isinstance(node, ast.Call) else None
    if not wrapped:
        return None
    label, path = wrapped
    return f"{last_name(node.func)} via {label} in {path}"


def has_main_guard(tree):
    return any(isinstance(node, ast.If) and is_main_guard(node) for node in tree.body)


def check(context):
    if context.tests or not uses_containers(context.project):
        return []
    if is_composition_root(context) or has_main_guard(context.tree):
        return []
    found = {}
    sites = (n for n in ast.walk(context.tree) if isinstance(n, SITES))
    for node in sites:
        subject = subject_of(node, context)
        if subject:
            found.setdefault(
                (node.lineno, subject), finding(context.path, RULE, subject, node)
            )
    return list(found.values())
