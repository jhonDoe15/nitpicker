import ast

from checks.common import finding
from django_models.origin import terminal_call
from unique_lookups.related import related_call
from unique_lookups.keys import (
    call_keys,
    chain_keys,
    exact_names,
    is_covered,
    mutable_key,
)

RULE = "non-unique-lookup"
GETTERS = {"get", "aget"}
CREATORS = {"get_or_create", "aget_or_create", "update_or_create", "aupdate_or_create"}
MUTABLE = {"JSONField", "ArrayField", "TextField"}


def subject_of(model, method, kind, names):
    return f"{model.name}.{method}|{kind}|{','.join(dict.fromkeys(names))}"


def mutable_subject(call, model, method, context):
    own = call_keys(call, context)
    key = mutable_key(model, own.names, context.project, MUTABLE)
    return subject_of(model, method, "mutable", [key]) if key else None


def unique_subject(call, model, method, context, implicit=()):
    own = call_keys(call, context)
    chain = chain_keys(call.func.value, context)
    written = own.names + chain.names
    keys = written + implicit
    if own.or_ or own.unknown or chain.unknown or chain.or_ or not written:
        return None
    if not model.complete:
        return None
    names = exact_names(model, keys, context.project)
    if names is None or is_covered(model, names):
        return None
    return subject_of(model, method, "not-unique", written)


def call_subject(call, context):
    found = terminal_call(call, context)
    implicit = ()
    if found is None:
        related = related_call(call, context)
        found = related[:2] if related else None
        implicit = related[2] if related else ()
    if found is None or found[1] not in GETTERS | CREATORS:
        return None
    model, method = found
    own = call_keys(call, context)
    if method in GETTERS and own.or_:
        return subject_of(model, method, "q-or", own.names)
    if method in CREATORS:
        mutable = mutable_subject(call, model, method, context)
        if mutable:
            return mutable
    return unique_subject(call, model, method, context, implicit)


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call):
            subject = call_subject(node, context)
            if subject is not None:
                found.append(finding(context.path, RULE, subject, node))
    return found
