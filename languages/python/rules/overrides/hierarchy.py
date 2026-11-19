import ast

from checks.common import dotted_name
from security.resolve.scopes import definition, module_where

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
MAX_DEPTH = 8
OPAQUE_ROOTS = ("typing.", "typing_extensions.", "abc.", "enum.", "dataclasses.")


def base_expression(base):
    return base.value if isinstance(base, ast.Subscript) else base


def is_library_name(dotted):
    return "." in dotted and not dotted.startswith(OPAQUE_ROOTS)


def resolved_bases(cls, context):
    projects, libraries = [], []
    for base in cls.bases:
        expression = base_expression(base)
        found = definition(expression, module_where(context))
        if found is not None and found[0] is not cls:
            projects.append((found[0], found[1].context))
            continue
        dotted = dotted_name(expression, context.aliases)
        if dotted and is_library_name(dotted):
            libraries.append(dotted)
    return projects, libraries


def ancestry(cls, context, depth=0):
    projects, libraries = resolved_bases(cls, context)
    classes, outside = [], list(libraries)
    if depth >= MAX_DEPTH:
        return classes, outside
    for base, place in projects:
        classes.append((base, place))
        deeper, further = ancestry(base, place, depth + 1)
        classes.extend(deeper)
        outside.extend(further)
    return classes, outside


def own_methods(cls):
    methods = {}
    for statement in cls.body:
        if isinstance(statement, FUNCTIONS):
            methods.setdefault(statement.name, statement)
    return methods
