import ast
from collections import namedtuple

from checks.common import dotted_name
from orm.models import class_assignments, constant, keyword, relation_target

Field = namedtuple(
    "Field",
    "name type node null blank unique primary_key has_default choices relation",
)
Relation = namedtuple("Relation", "name kind target related_name query_name many")
RELATION_KINDS = ("ForeignKey", "OneToOneField", "ManyToManyField")
DEFAULT_KEYWORDS = ("default", "db_default")
NOT_COLUMNS = {"GenericForeignKey", "GenericRelation"}


def is_true(call, name):
    return constant(keyword(call, name)) is True


def field_type(call, context):
    dotted = dotted_name(call.func, context.aliases) or ""
    last = dotted.rsplit(".", 1)[-1]
    if not last or last in NOT_COLUMNS:
        return None
    if dotted.startswith("django") or relation_kind(last):
        return last
    return last if last.endswith("Field") and last[0].isupper() else None


def relation_kind(type_name):
    for kind in RELATION_KINDS:
        if type_name.endswith(kind):
            return kind
    return None


def string_keyword(call, name):
    value = constant(keyword(call, name))
    return value if isinstance(value, str) else None


def relation_of(name, call, type_name, owner):
    kind = relation_kind(type_name)
    target = relation_target(call, owner)
    if kind is None or not target:
        return None
    related = string_keyword(call, "related_name")
    query = string_keyword(call, "related_query_name") or related
    return Relation(name, kind, target, related, query, kind == "ManyToManyField")


def field_of(name, call, type_name, relation):
    one_to_one = relation is not None and relation.kind == "OneToOneField"
    return Field(
        name,
        type_name,
        call,
        is_true(call, "null"),
        is_true(call, "blank"),
        is_true(call, "unique") or one_to_one or is_true(call, "primary_key"),
        is_true(call, "primary_key"),
        any(keyword(call, key) is not None for key in DEFAULT_KEYWORDS),
        keyword(call, "choices"),
        relation,
    )


def declared_fields(cls, context):
    found = {}
    for name, call in class_assignments(cls):
        type_name = field_type(call, context) if isinstance(call, ast.Call) else None
        if type_name is not None:
            relation = relation_of(name, call, type_name, cls.name)
            found[name] = field_of(name, call, type_name, relation)
    return found


def implicit_key():
    return Field("id", "AutoField", None, False, False, True, True, True, None, None)
