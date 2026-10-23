import ast

from checks.common import dotted_name
from contracts.infrastructure import kind_of
from contracts.web import is_web_class

REPOSITORY_SUFFIXES = ("Repository", "Repo")
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def is_public(name):
    return not name.startswith("_")


def is_data_access_class(node, context):
    return any(
        kind_of(dotted_name(base, context.aliases)) == "persistence"
        for base in node.bases
    )


def is_framework_class(node, context):
    return is_web_class(node, context) or is_data_access_class(node, context)


def is_contract_class(node, context):
    return (
        is_public(node.name)
        and not node.name.endswith(REPOSITORY_SUFFIXES)
        and not is_framework_class(node, context)
    )


def class_members(node, context, label):
    for statement in node.body:
        if isinstance(statement, FUNCTIONS) and is_public(statement.name):
            yield f"{label}.{statement.name}", statement, True
        elif isinstance(statement, ast.ClassDef) and is_contract_class(
            statement, context
        ):
            yield from class_members(statement, context, f"{label}.{statement.name}")


def definition_members(node, context, label):
    if isinstance(node, FUNCTIONS):
        yield label, node, False
    elif isinstance(node, ast.ClassDef) and is_contract_class(node, context):
        yield from class_members(node, context, label)
