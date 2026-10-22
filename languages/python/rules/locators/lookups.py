import ast

from checks.common import finding, last_name
from environment.roots import is_composition_root
from locators.labels import lookup_label
from locators.references import uses_containers
from locators.wrappers import wrapper_label

RULE = "service-locator-lookup"


def subject_of(node, context):
    label = lookup_label(node, context)
    if label:
        return label
    wrapped = wrapper_label(node, context)
    return f"{last_name(node.func)} via {wrapped}" if wrapped else None


def check(context):
    if context.tests or not uses_containers(context.project):
        return []
    if is_composition_root(context):
        return []
    found = []
    for node in ast.walk(context.tree):
        subject = subject_of(node, context)
        if subject:
            found.append(finding(context.path, RULE, subject, node))
    return found
