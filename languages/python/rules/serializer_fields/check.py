import ast

from checks.common import finding
from django_declarations.classes import meta_assignment, meta_model
from serializer_fields.sets import (
    MINIMUM_PEERS,
    SHARE,
    is_variant,
    serializer_sets,
)
from serializer_nulls.fields import is_serializer_class

RULE = "serializer-fields-omitted"


def common_fields(peers, model):
    counts = {}
    for _, _, names in peers:
        for name in names & set(model.fields):
            counts[name] = counts.get(name, 0) + 1
    return {name for name, count in counts.items() if count / len(peers) >= SHARE}


def omitted(cls, context, model, sets):
    peers = [
        item
        for item in sets.get(model.key, [])
        if (item[0], item[1]) != (context.path, cls.name)
    ]
    mine = next(
        (
            i[2]
            for i in sets.get(model.key, [])
            if (i[0], i[1]) == (context.path, cls.name)
        ),
        None,
    )
    if mine is None or len(peers) < MINIMUM_PEERS:
        return []
    keys = {name for name, field in model.fields.items() if not field.primary_key}
    return sorted((common_fields(peers, model) & keys) - mine)


def check(context):
    if context.tests:
        return []
    sets = serializer_sets(context.project)
    found = []
    for cls in ast.walk(context.tree):
        if not isinstance(cls, ast.ClassDef) or not is_serializer_class(cls, context):
            continue
        model = meta_model(cls, context)
        if model is None or is_variant(cls, context):
            continue
        node = meta_assignment(cls, "fields")
        for name in omitted(cls, context, model, sets) if node else []:
            subject = f"{name}|{cls.name}|{model.name}"
            found.append(finding(context.path, RULE, subject, node))
    return found
