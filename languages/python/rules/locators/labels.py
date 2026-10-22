import ast

from checks.common import dotted_name
from locators.model import COMPOSITION_BASES, INSTANCE_LIBRARIES, PROVIDER_LIBRARIES
from locators.references import reference_of


def instance_call_label(func, context):
    reference = reference_of(func.value, context)
    if reference and reference[0] == "instance":
        spec = INSTANCE_LIBRARIES[reference[1]]
        if func.attr in spec["methods"]:
            return f"{spec['display']}.{func.attr}"
    return None


def provider_call_label(func, context):
    reference = reference_of(func.value, context)
    if reference and reference[0] == "providers" and func.attr in reference[3]:
        return f"{reference[1]} {reference[2]}.{func.attr}"
    owner = func.value
    reference = (
        reference_of(owner.value, context) if isinstance(owner, ast.Attribute) else None
    )
    if reference and reference[0] == "providers" and owner.attr in reference[3]:
        if func.attr in PROVIDER_LIBRARIES[reference[1]]["methods"]:
            return f"{reference[1]} {reference[2]}.{owner.attr}"
    return None


def call_label(call, context):
    if not isinstance(call.func, ast.Attribute):
        return None
    return instance_call_label(call.func, context) or provider_call_label(
        call.func, context
    )


def subscript_label(node, context):
    if not isinstance(node.ctx, ast.Load):
        return None
    reference = reference_of(node.value, context)
    if reference and reference[0] == "instance":
        spec = INSTANCE_LIBRARIES[reference[1]]
        return f"{spec['display']}[...]" if spec["subscript"] else None
    return None


def in_composition_scope(node, context):
    current = context.parents.get(id(node))
    while current is not None:
        if isinstance(current, ast.ClassDef) and any(
            dotted_name(base, context.aliases) in COMPOSITION_BASES
            for base in current.bases
        ):
            return True
        current = context.parents.get(id(current))
    return False


def lookup_label(node, context):
    if isinstance(node, ast.Call):
        label = call_label(node, context)
    elif isinstance(node, ast.Subscript):
        label = subscript_label(node, context)
    else:
        label = None
    return None if label is None or in_composition_scope(node, context) else label
