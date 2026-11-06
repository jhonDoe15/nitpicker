import ast

from persistence.relationships import (
    BACKREF,
    RELATIONSHIP,
    SQLMODEL,
    Relation,
    call_kind,
    call_options,
    relation_finding,
    relations,
)

RULE = "many-to-many-cascade-delete"
GUARDED = True
DELETING_CASCADES = {"all", "delete", "delete-orphan"}
LINK_OPTIONS = {RELATIONSHIP: ("secondary",), SQLMODEL: ("link_model", "secondary")}


def is_true(value):
    return isinstance(value, ast.Constant) and value.value is True


def deleting_cascade(options):
    value = options.get("cascade")
    if isinstance(value, ast.Constant) and isinstance(value.value, str):
        tokens = {token.strip() for token in value.value.split(",")}
        if tokens & DELETING_CASCADES:
            return value
    flag = options.get("cascade_delete")
    return flag if is_true(flag) else None


def is_none(value):
    return isinstance(value, ast.Constant) and value.value is None


def is_many_to_many(relation):
    links = [relation.options.get(name) for name in LINK_OPTIONS.get(relation.kind, ())]
    linked = any(link is not None and not is_none(link) for link in links)
    return linked and not is_true(relation.options.get("viewonly"))


def paired_backref(relation, context):
    value = relation.options.get("backref")
    if isinstance(value, ast.Call) and call_kind(value, context) == BACKREF:
        return Relation(value, BACKREF, call_options(value, BACKREF))
    return None


def sides(relation, context):
    backref = paired_backref(relation, context)
    return [relation] if backref is None else [relation, backref]


def check(context):
    if context.tests:
        return []
    found = []
    for relation in relations(context):
        if not is_many_to_many(relation):
            continue
        for side in sides(relation, context):
            node = deleting_cascade(side.options)
            if node is not None and not is_true(side.options.get("single_parent")):
                found.append(relation_finding(context, RULE, side, node))
    return found
