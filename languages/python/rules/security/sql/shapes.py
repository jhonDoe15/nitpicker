import ast

from checks.common import dotted_name
from security.resolve.scopes import SCOPES, is_enum_class

MAX_DEPTH = 10
INERT = ("", False, False)
UNSAFE = ("", True, False)
QUOTING = {"quote_name", "quote_ident", "quote_identifier", "escape_identifier"}
QUOTING |= {"quote_schema", "Identifier", "Literal", "Placeholder"}
PREPARER_QUOTING = {
    "quote",
    "format_table",
    "format_column",
    "quote_schema",
    "format_label",
}
PREPARERS = {"identifier_preparer", "preparer"}
NUMERIC_CALLS = {"int", "float", "len", "abs", "round", "bool", "min", "max", "sum"}
NUMERIC_CALLS |= {"math.ceil", "math.floor", "decimal.Decimal", "uuid.UUID"}
SAFE_ANNOTATIONS = {
    "int",
    "float",
    "bool",
    "Decimal",
    "UUID",
    "date",
    "datetime",
    "time",
}
CONTAINERS = {"list", "List", "tuple", "Tuple", "set", "Set", "frozenset", "FrozenSet"}
CONTAINERS |= {"Sequence", "Iterable", "Collection", "Iterator", "AbstractSet"}
CONTAINERS |= {"MutableSequence", "dict", "Dict", "Mapping"}
UNIONS = {"Union", "Optional"}
WRAPPERS = {"Annotated", "Final", "ClassVar", "Required", "NotRequired", "ReadOnly"}
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp)
EXITS = (ast.Raise, ast.Return, ast.Continue, ast.Break)
ANNOTATION_DEPTH = 6


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


def subscript_members(node):
    inner = node.slice
    return inner.elts if isinstance(inner, ast.Tuple) else [inner]


def safe_subscript(node, where, depth):
    name = tail(node.value, where)
    members = subscript_members(node)
    if name == "Literal":
        return True
    if name in WRAPPERS:
        return safe_annotation(members[0], where, depth + 1)
    if name in UNIONS or name in CONTAINERS:
        return all(safe_annotation(member, where, depth + 1) for member in members)
    return False


def safe_annotation(annotation, where, depth=0):
    if annotation is None or depth > ANNOTATION_DEPTH:
        return False
    if isinstance(annotation, ast.Constant):
        if annotation.value is None or annotation.value is Ellipsis:
            return depth > 0
        if isinstance(annotation.value, str):
            try:
                parsed = ast.parse(annotation.value, mode="eval").body
            except (SyntaxError, ValueError):
                return False
            return safe_annotation(parsed, where, depth + 1)
        return False
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        return all(
            safe_annotation(side, where, depth + 1)
            for side in (annotation.left, annotation.right)
        )
    if isinstance(annotation, ast.Subscript):
        return safe_subscript(annotation, where, depth)
    if isinstance(annotation, (ast.Name, ast.Attribute)):
        return tail(annotation, where) in SAFE_ANNOTATIONS or is_enum_class(
            annotation, where
        )
    return False


def membership(test, name, operator):
    if isinstance(test, ast.BoolOp):
        joined = ast.And if operator is ast.In else ast.Or
        if isinstance(test.op, joined):
            return [
                found
                for value in test.values
                for found in membership(value, name, operator)
            ]
        return []
    if not (isinstance(test, ast.Compare) and len(test.ops) == 1):
        return []
    left = test.left
    if (
        isinstance(left, ast.Name)
        and left.id == name
        and isinstance(test.ops[0], operator)
    ):
        return [test.comparators[0]]
    return []


def exits(body):
    return bool(body) and isinstance(body[-1], EXITS)


def earlier_guards(statement, holder, name):
    found = []
    for field in ("body", "orelse", "finalbody"):
        block = getattr(holder, field, None)
        if not isinstance(block, list) or statement not in block:
            continue
        for earlier in block[: block.index(statement)]:
            if (
                isinstance(earlier, ast.If)
                and exits(earlier.body)
                and not earlier.orelse
            ):
                found.extend(membership(earlier.test, name, ast.NotIn))
    return found


def guard_collections(node, context):
    if not isinstance(node, ast.Name) or id(node) not in context.parents:
        return []
    found = []
    child = node
    holder = context.parents.get(id(node))
    while holder is not None and not isinstance(holder, SCOPES):
        if isinstance(holder, COMPREHENSIONS) and not isinstance(
            child, ast.comprehension
        ):
            for generator in holder.generators:
                for test in generator.ifs:
                    found.extend(membership(test, node.id, ast.In))
        if isinstance(holder, ast.If) and child in holder.body:
            found.extend(membership(holder.test, node.id, ast.In))
        found.extend(earlier_guards(child, holder, node.id))
        child, holder = holder, context.parents.get(id(holder))
    if holder is not None:
        found.extend(earlier_guards(child, holder, node.id))
    return found
