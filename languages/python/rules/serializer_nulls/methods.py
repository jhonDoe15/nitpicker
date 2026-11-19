import ast

from checks.common import dotted_name, last_name, own_nodes
from orm.models import class_assignments, constant, keyword
from review.common import is_none

METHOD_FIELD = "SerializerMethodField"
EXTENSION = "extend_schema_field"
NULL_WORDS = ("allow_null", "nullable")


def method_fields(cls, context):
    for name, call in class_assignments(cls):
        if not isinstance(call, ast.Call):
            continue
        dotted = dotted_name(call.func, context.aliases) or ""
        if dotted.rsplit(".", 1)[-1] == METHOD_FIELD:
            yield name, call


def method_named(cls, name, call):
    given = constant(keyword(call, "method_name"))
    wanted = given if isinstance(given, str) else f"get_{name}"
    for statement in cls.body:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if statement.name == wanted:
                return statement
    return None


def returns_none(function):
    return any(
        isinstance(node, ast.Return) and (node.value is None or is_none(node.value))
        for node in own_nodes(function)
    )


def mentions_none(part):
    if isinstance(part, ast.Constant):
        return part.value is None or (
            isinstance(part.value, str)
            and ("Optional" in part.value or "None" in part.value)
        )
    return isinstance(part, (ast.Name, ast.Attribute)) and last_name(part) == "Optional"


def optional_annotation(function):
    node = function.returns
    return node is not None and any(mentions_none(part) for part in ast.walk(node))


def extension_text(function):
    for decorator in function.decorator_list:
        called = decorator.func if isinstance(decorator, ast.Call) else decorator
        if (dotted_name(called, ({}, {})) or "").rsplit(".", 1)[-1] == EXTENSION:
            return ast.unparse(decorator)
    return None


def method_problem(function):
    optional = optional_annotation(function)
    if not (returns_none(function) or optional):
        return False
    extension = extension_text(function)
    if extension is None:
        return not optional
    return not any(word in extension for word in NULL_WORDS)
