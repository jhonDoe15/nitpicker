import ast

from checks.common import finding
from signatures.annotations import (
    FUNCTION_TYPES,
    decorator_names,
    is_hook,
    is_tri_state,
    parameters_of,
    qualified_name,
)

RULE = "tri-state-boolean"
FIXED_SIGNATURE_DECORATORS = {"override", "overload"}
FIXED_SIGNATURE_METHODS = {"__exit__", "__aexit__"}


def is_fixed_signature(function):
    return (
        function.name in FIXED_SIGNATURE_METHODS
        or is_hook(function)
        or bool(decorator_names(function) & FIXED_SIGNATURE_DECORATORS)
    )


def function_findings(function, context):
    if is_fixed_signature(function):
        return []
    owner = qualified_name(function, context)
    found = [
        finding(context.path, RULE, f"{owner}({argument.arg})", argument)
        for argument in parameters_of(function)
        if is_tri_state(argument.annotation)
    ]
    if is_tri_state(function.returns):
        found.append(finding(context.path, RULE, f"{owner}()", function))
    return found


def field_name(node, context):
    target = node.target
    parent = context.parents.get(id(node))
    if isinstance(target, ast.Name) and isinstance(parent, (ast.ClassDef, ast.Module)):
        owner = parent.name if isinstance(parent, ast.ClassDef) else None
        return f"{owner}.{target.id}" if owner else target.id
    if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name):
        function = enclosing_method(node, context)
        if target.value.id == "self" and function is not None:
            return (
                f"{qualified_name(function, context).rsplit('.', 1)[0]}.{target.attr}"
            )
    return None


def enclosing_method(node, context):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, FUNCTION_TYPES):
        parent = context.parents.get(id(parent))
    return parent


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTION_TYPES):
            found.extend(function_findings(node, context))
        elif isinstance(node, ast.AnnAssign) and is_tri_state(node.annotation):
            name = field_name(node, context)
            if name is not None:
                found.append(finding(context.path, RULE, name, node))
    return found
