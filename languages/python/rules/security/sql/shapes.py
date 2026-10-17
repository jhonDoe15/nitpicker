import ast

from checks.common import dotted_name
from security.values import is_enum_class

MAX_DEPTH = 10
INERT = ("", False, False)
UNSAFE = ("", True, False)
QUOTING = {"quote_name", "quote_ident", "quote_identifier", "escape_identifier"}
QUOTING |= {"quote_schema", "Identifier", "Literal", "Placeholder"}
NUMERIC_CALLS = {"int", "float", "len", "abs", "round", "bool", "min", "max", "sum"}
NUMERIC_CALLS |= {"math.ceil", "math.floor", "decimal.Decimal", "uuid.UUID"}
SAFE_ANNOTATIONS = {"int", "float", "bool", "Decimal", "UUID", "date", "datetime"}
SAFE_ANNOTATIONS |= {"Literal"}


def combine(results, built=None):
    text = " ".join(result[0] for result in results if result[0])
    unsafe = any(result[1] for result in results)
    return text, unsafe, any(r[2] for r in results) if built is None else built


def textual(result):
    return bool(result[0]) or result[2]


def tail(node, where):
    return (dotted_name(node, where.context.aliases) or "").rsplit(".", 1)[-1]


def is_constant_text(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, (str, int))


def safe_annotation(annotation, where):
    if annotation is None:
        return False
    for node in ast.walk(annotation):
        if isinstance(node, (ast.Name, ast.Attribute)):
            if tail(node, where) in SAFE_ANNOTATIONS or is_enum_class(node, where):
                return True
    return False
