import ast

from checks.common import finding
from http_values.request_names import is_request_user
from nullable_access.guards import is_guarded
from nullable_access.sources import (
    instance_of,
    is_method_of_model,
    optional_label,
    single_binding,
)
from nullable_access.uses import dereferences
from nullable_access.users import (
    authenticated_scope,
    uses_django,
    user_attributes,
)

RULE = "nullable-dereference"
FIELD = "null=True field"
USER = "request.user"


def field_label(receiver, function, context, owner):
    if not isinstance(receiver, ast.Attribute) or not isinstance(
        receiver.value, ast.Name
    ):
        return None
    name = receiver.value.id
    model, proven = (
        (owner, set()) if name == "self" else instance_of(name, function, context)
    )
    field = model.fields.get(receiver.attr) if model else None
    if field is None or not field.null or receiver.attr in proven:
        return None
    if field.relation is not None and field.relation.many:
        return None
    return FIELD


def user_label(receiver, node, function, context):
    if not (is_request_user(receiver) and isinstance(node, ast.Attribute)):
        return None
    if node.attr not in user_attributes(context.project) or not uses_django(context):
        return None
    return None if authenticated_scope(function, context) else USER


def value_label(receiver, function, context):
    if isinstance(receiver, ast.Name):
        found = single_binding(receiver.id, function, context)
        if found is None or found[0] != "value" or found[1] is None:
            return None
        return optional_label(found[1], function, context)
    return (
        optional_label(receiver, function, context)
        if isinstance(receiver, ast.Call)
        else None
    )


def label_of(receiver, node, function, context, owner):
    label = value_label(receiver, function, context)
    if label is not None:
        return label, (False, False)
    label = user_label(receiver, node, function, context)
    if label is not None:
        return label, (True, True)
    label = field_label(receiver, function, context, owner)
    return label, (False, True)


def function_findings(function, context):
    owner = is_method_of_model(function, context)
    found, seen = [], set()
    for receiver, node in dereferences(function):
        key = ast.unparse(receiver)
        label, mode = label_of(receiver, node, function, context, owner)
        if label is None or key in seen:
            continue
        keys = [key, f"{key}_id"] if isinstance(receiver, ast.Attribute) else [key]
        if any(is_guarded(function, receiver, k, context.parents, mode) for k in keys):
            continue
        seen.add(key)
        found.append(finding(context.path, RULE, f"{key}|{label}", node))
    return found


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            found.extend(function_findings(node, context))
    return found
