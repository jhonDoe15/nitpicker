import ast
from collections import namedtuple

from checks.common import dotted_name
from orm.models import class_assignments, constant, keyword

UniqueSet = namedtuple("UniqueSet", "fields conditional")


def meta_class(cls):
    for statement in cls.body:
        if isinstance(statement, ast.ClassDef) and statement.name == "Meta":
            return statement
    return None


def strings_of(node):
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        names = [constant(item) for item in node.elts]
        if all(isinstance(name, str) for name in names):
            return tuple(names)
    return None


def unique_together(value):
    if isinstance(value, (ast.List, ast.Tuple)) and value.elts:
        groups = [strings_of(item) for item in value.elts]
        if all(group is not None for group in groups):
            return [UniqueSet(frozenset(group), False) for group in groups]
        single = strings_of(value)
        if single:
            return [UniqueSet(frozenset(single), False)]
    return []


def constraint_set(call, context):
    dotted = dotted_name(call.func, context.aliases) or ""
    if not dotted.endswith("UniqueConstraint") or call.args:
        return None
    fields = strings_of(keyword(call, "fields") or ast.Constant(value=None))
    if not fields:
        return None
    conditional = keyword(call, "condition") is not None
    return UniqueSet(frozenset(fields), conditional)


def constraint_sets(value, context):
    if not isinstance(value, (ast.List, ast.Tuple)):
        return []
    found = [
        constraint_set(item, context)
        for item in value.elts
        if isinstance(item, ast.Call)
    ]
    return [item for item in found if item is not None]


def meta_facts(cls, context):
    meta = meta_class(cls)
    if meta is None:
        return False, [], False
    abstract, uniques = False, []
    for name, value in class_assignments(meta):
        if name == "abstract":
            abstract = constant(value) is True
        elif name == "unique_together":
            uniques.extend(unique_together(value))
        elif name == "constraints":
            uniques.extend(constraint_sets(value, context))
    return abstract, uniques, True
