import ast

from persistence.relationships import relation_finding, relations

RULE = "eager-relationship"
GUARDED = True
EAGER_LOADERS = {"joined", "subquery", "selectin", "immediate"}


def is_eager(value):
    if not isinstance(value, ast.Constant):
        return False
    return value.value is False or value.value in EAGER_LOADERS


def check(context):
    if context.tests:
        return []
    found = []
    for relation in relations(context):
        value = relation.options.get("lazy")
        if value is not None and is_eager(value):
            found.append(relation_finding(context, RULE, relation, value))
    return found
