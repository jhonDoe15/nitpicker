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
        return None
    empty = isinstance(value, (ast.List, ast.Tuple)) and not value.elts
    return [] if empty else None


def is_unique_constraint(item, context):
    if not isinstance(item, ast.Call):
        return False
    return (dotted_name(item.func, context.aliases) or "").endswith("UniqueConstraint")


def constraint_set(call):
    fields = strings_of(keyword(call, "fields") or ast.Constant(value=None))
    if call.args or not fields:
        return None
    return UniqueSet(frozenset(fields), keyword(call, "condition") is not None)


def constraint_sets(value, context):
    if not isinstance(value, (ast.List, ast.Tuple)):
        return None
    found = []
    for item in value.elts:
        if isinstance(item, ast.Starred) or not isinstance(item, ast.Call):
            return None
        if is_unique_constraint(item, context):
            unique = constraint_set(item)
            if unique is None:
                return None
            found.append(unique)
    return found


def meta_facts(cls, context):
    meta = meta_class(cls)
    if meta is None:
        return False, [], False
    abstract, uniques, opaque = False, [], False
    for name, value in class_assignments(meta):
        if name == "abstract":
            abstract = constant(value) is True
        elif name in ("unique_together", "constraints"):
            reader = unique_together if name == "unique_together" else None
            found = reader(value) if reader else constraint_sets(value, context)
            opaque = opaque or found is None
            uniques.extend(found or [])
    return abstract, uniques, opaque
