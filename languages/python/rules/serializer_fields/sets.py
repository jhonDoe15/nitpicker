import ast
import re

from django_declarations.classes import meta_assignment, meta_model
from django_declarations.entries import elements, text_of
from orm.models import class_assignments, constant
from serializer_nulls.fields import is_serializer_class

ALL_FIELDS = "__all__"
VARIANT = re.compile(r"Nested|Brief|Minimal|Summary|List|Write|Create|Update|Input")
MINIMUM_PEERS = 3
SHARE = 0.8


def is_variant(cls, context):
    return bool(VARIANT.search(cls.name) or VARIANT.search(context.path))


def names_of(node):
    items = elements(node)
    texts = [text_of(item) for item in items]
    if not items or any(text is None for text in texts):
        return None
    return set(texts)


def field_set(cls, model):
    fields = meta_assignment(cls, "fields")
    if isinstance(fields, ast.Constant) and constant(fields) == ALL_FIELDS:
        return set(model.fields) - (names_of(meta_assignment(cls, "exclude")) or set())
    return names_of(fields)


def exclusion_based(cls):
    return meta_assignment(cls, "exclude") is not None


def explicit_set(cls, model):
    if exclusion_based(cls) or meta_assignment(cls, "fields") is None:
        return None
    return field_set(cls, model)


def declared_names(cls):
    return {name for name, _ in class_assignments(cls)}


def serializer_sets(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            for cls in ast.walk(context.tree):
                if not isinstance(cls, ast.ClassDef):
                    continue
                if not is_serializer_class(cls, context) or is_variant(cls, context):
                    continue
                model = meta_model(cls, context)
                names = explicit_set(cls, model) if model else None
                if names is not None:
                    entry = (context.path, cls.name, names | declared_names(cls))
                    found.setdefault(model.key, []).append(entry)
        return found

    return project.memo("serializer-field-sets", build)
