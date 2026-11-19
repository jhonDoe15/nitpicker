import ast

from checks.common import dotted_name
from django_declarations.classes import derives_from
from orm.models import class_assignments, constant, keyword
from security.resolve.scopes import definition, where_of

NOT_MODEL_VALUES = {
    "SerializerMethodField",
    "HiddenField",
    "ReadOnlyField",
    "SkipField",
}
FRAMEWORK = "rest_framework"


def is_serializer_class(cls, context):
    return derives_from(cls, context, FRAMEWORK, "Serializer")


def is_serializer_field(call, context):
    dotted = dotted_name(call.func, context.aliases) or ""
    last = dotted.rsplit(".", 1)[-1]
    if last in NOT_MODEL_VALUES:
        return False
    if dotted.startswith(FRAMEWORK):
        return last.endswith(("Field", "Serializer"))
    if not isinstance(call.func, (ast.Name, ast.Attribute)):
        return False
    found = definition(call.func, where_of(call.func, context))
    return found is not None and is_serializer_class(found[0], found[1].context)


def serializer_fields(cls, context):
    for name, call in class_assignments(cls):
        if isinstance(call, ast.Call) and is_serializer_field(call, context):
            yield name, call


def flag(call, name):
    return constant(keyword(call, name))


def source_text(name, call):
    source = flag(call, "source")
    if source is None:
        return name
    if isinstance(source, str) and source != "*":
        return source.replace(".", "__")
    return None
