import ast

from checks.common import finding
from django_declarations.classes import meta_model
from orm.models import keyword
from serializer_nulls.chain import is_many, may_be_none, resolved_chain
from serializer_nulls.fields import (
    flag,
    is_serializer_class,
    serializer_fields,
    source_text,
)
from serializer_nulls.methods import method_fields, method_named, method_problem

RULE = "serializer-null-mismatch"
NULL = "null"
REQUIRED = "required"
METHOD = "method"


def null_problem(call, chain):
    if keyword(call, "default") is not None:
        chain = chain[-1:]
    explicit = keyword(call, "allow_null")
    if explicit is not None and not isinstance(explicit, ast.Constant):
        return None
    if flag(call, "allow_null") is True or flag(call, "many") is True:
        return None
    if any(is_many(item) for item in chain):
        return None
    return NULL if any(may_be_none(item) for item in chain) else None


def required_problem(call, chain):
    last = chain[-1]
    if hasattr(last, "owner") or last.node is None:
        return None
    given = {item.arg for item in call.keywords}
    if given & {"required", "default", "read_only"} or len(chain) > 1:
        return None
    editable = [k for k in last.node.keywords if k.arg == "editable"]
    if editable or last.primary_key:
        return None
    return REQUIRED if last.blank or last.has_default else None


def field_problem(name, call, model, context):
    if any(item.arg is None for item in call.keywords):
        return None
    text = source_text(name, call)
    chain = resolved_chain(model, text, context.project) if text else None
    if chain is None:
        return None
    problem = null_problem(call, chain)
    return problem or required_problem(call, chain)


def model_findings(cls, context, model):
    found = []
    for name, call in serializer_fields(cls, context):
        kind = field_problem(name, call, model, context)
        if kind is not None:
            subject = f"{name}|{model.name}|{kind}"
            found.append(finding(context.path, RULE, subject, call))
    return found


def method_findings(cls, context):
    found = []
    for name, call in method_fields(cls, context):
        function = method_named(cls, name, call)
        if function is None or flag(call, "allow_null") is True:
            continue
        if method_problem(function):
            subject = f"{name}|{cls.name}|{METHOD}"
            found.append(finding(context.path, RULE, subject, call))
    return found


def class_findings(cls, context):
    if not is_serializer_class(cls, context):
        return []
    found = method_findings(cls, context)
    model = meta_model(cls, context)
    return found + (model_findings(cls, context, model) if model else [])


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef):
            found.extend(class_findings(node, context))
    return found
