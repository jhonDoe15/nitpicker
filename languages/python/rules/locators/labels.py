import ast

from checks.common import dotted_name
from locators.model import INSTANCE_LIBRARIES, PROVIDER_LIBRARIES
from locators.registrations import in_registration
from locators.resolve.references import library_of, reference_of
from locators.resolve.symbols import is_composition_class

SUBSCRIPT_METHOD = "__getitem__"
MEMBER_NAMES = frozenset(
    name for spec in INSTANCE_LIBRARIES.values() for name in spec["methods"]
) | {SUBSCRIPT_METHOD}


def member_label(receiver, attr, context):
    if attr not in MEMBER_NAMES:
        return None
    reference = reference_of(receiver, context)
    if not reference or reference[0] != "instance":
        dotted = dotted_name(receiver, context.aliases)
        library = library_of(dotted, "classes", context) if dotted else None
        reference = ("instance", library) if library else None
    if reference is None:
        return None
    spec = INSTANCE_LIBRARIES[reference[1]]
    if attr in spec["methods"]:
        return f"{spec['display']}.{attr}"
    return (
        f"{spec['display']}[...]"
        if spec["subscript"] and attr == SUBSCRIPT_METHOD
        else None
    )


def instance_call_label(func, context):
    return member_label(func.value, func.attr, context)


def getattr_label(call, context):
    func, args = call.func, call.args
    named = (
        isinstance(func, ast.Name)
        and func.id == "getattr"
        and len(args) >= 2
        and isinstance(args[1], ast.Constant)
        and isinstance(args[1].value, str)
    )
    return member_label(args[0], args[1].value, context) if named else None


def provider_call_label(func, context):
    reference = reference_of(func.value, context)
    if reference and reference[0] == "providers":
        if func.attr in reference[3]:
            return f"{reference[1]} {reference[2]}.{func.attr}"
        if func.attr in PROVIDER_LIBRARIES[reference[1]]["class_methods"]:
            return f"{reference[1]} {reference[2]}.{func.attr}"
    owner = func.value
    reference = (
        reference_of(owner.value, context) if isinstance(owner, ast.Attribute) else None
    )
    if (
        reference
        and reference[0] == "providers"
        and owner.attr in reference[3]
        and func.attr in PROVIDER_LIBRARIES[reference[1]]["methods"]
    ):
        return f"{reference[1]} {reference[2]}.{owner.attr}"
    return None


def call_label(call, context):
    if not isinstance(call.func, ast.Attribute):
        return getattr_label(call, context)
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


def value_label(node, context):
    parent = context.parents.get(id(node))
    called = isinstance(parent, ast.Call) and parent.func is node
    if called or not isinstance(node.ctx, ast.Load):
        return None
    return member_label(node.value, node.attr, context)


def in_composition_scope(node, context):
    current = context.parents.get(id(node))
    while current is not None:
        if isinstance(current, ast.ClassDef) and is_composition_class(current, context):
            return True
        current = context.parents.get(id(current))
    return False


def is_allowed_here(node, context):
    return in_composition_scope(node, context) or in_registration(node, context)


def lookup_label(node, context):
    if isinstance(node, ast.Call):
        label = call_label(node, context)
    elif isinstance(node, ast.Subscript):
        label = subscript_label(node, context)
    elif isinstance(node, ast.Attribute):
        label = value_label(node, context)
    else:
        label = None
    return None if label is None or is_allowed_here(node, context) else label
