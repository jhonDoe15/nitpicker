import ast
from collections import namedtuple

from checks.common import dotted_name
from orm.models import class_assignments

Manager = namedtuple("Manager", "name node kind class_name")
PROPERTY_DECORATORS = {"property", "cached_property"}
MANAGER_BASES = {"Manager", "BaseManager"}
QUERYSET_BASES = {"QuerySet"}


def last_part(node, context):
    return (dotted_name(node, context.aliases) or "").rsplit(".", 1)[-1]


def property_names(cls, context):
    names = set()
    for statement in cls.body:
        if not isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        decorators = {last_part(item, context) for item in statement.decorator_list}
        if decorators & PROPERTY_DECORATORS:
            names.add(statement.name)
    return names


def generic_foreign_keys(cls, context):
    return {
        name
        for name, value in class_assignments(cls)
        if isinstance(value, ast.Call)
        and last_part(value.func, context) == "GenericForeignKey"
    }


def manager_of(name, call, context):
    function = call.func
    if isinstance(function, ast.Attribute) and function.attr == "as_manager":
        owner = function.value
        owner = owner.func if isinstance(owner, ast.Call) else owner
        return Manager(name, call, "queryset", last_part(owner, context) or None)
    if isinstance(function, ast.Call) and last_part(function.func, context) == (
        "from_queryset"
    ):
        queryset = function.args[0] if function.args else None
        return Manager(
            name, call, "from_queryset", last_part(queryset, context) or None
        )
    if isinstance(function, (ast.Name, ast.Attribute)):
        last = last_part(function, context)
        if last.endswith(("Manager", "Objects")) or last in MANAGER_BASES:
            return Manager(name, call, "manager", last)
    return None


def managers_of(cls, context):
    found = {}
    for name, value in class_assignments(cls):
        if isinstance(value, ast.Call):
            manager = manager_of(name, value, context)
            if manager is not None:
                found[name] = manager
    return found
