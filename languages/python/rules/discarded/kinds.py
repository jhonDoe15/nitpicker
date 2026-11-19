import ast

from checks.common import dotted_name
from discarded.bindings import evidence_in
from discarded.tables import CONSTRUCTORS, FACTORIES, RESULTS
from security.resolve.scopes import scope_of

MANAGER_NAMES = {"objects", "_default_manager"}
MAX_DEPTH = 8
MODULE = None
SELF = "self"


def is_class_name(node):
    return isinstance(node, ast.Name) and node.id[:1].isupper()


def annotation_kind(node, context):
    if isinstance(node, ast.Subscript):
        node = node.value
    if node is None or not isinstance(node, (ast.Name, ast.Attribute)):
        return None
    return CONSTRUCTORS.get(dotted_name(node, context.aliases) or "")


def operator_kind(node, context, seen):
    left = kind_of(node.left, context, seen)
    if left == SELF:
        return SELF
    if isinstance(node.op, ast.Mod) and left == "str":
        return left
    if isinstance(node.op, ast.Div) and left == "path":
        return left
    if isinstance(node.op, (ast.Add, ast.Sub)) and left == "datetime":
        return left
    return None


def call_kind(node, context, seen):
    dotted = dotted_name(node.func, context.aliases) or ""
    if dotted in FACTORIES or (
        dotted in CONSTRUCTORS and not dotted.startswith("typing.")
    ):
        return FACTORIES.get(dotted) or CONSTRUCTORS[dotted]
    if not isinstance(node.func, ast.Attribute):
        return None
    owner = kind_of(node.func.value, context, seen)
    if owner == SELF:
        return SELF
    if owner is None or node.func.attr not in RESULTS[owner]:
        return None
    return "queryset" if owner in {"queryset", "manager"} else owner


def literal_kind(node):
    if isinstance(node, ast.Constant):
        return {str: "str", bytes: "bytes"}.get(type(node.value))
    if isinstance(node, ast.JoinedStr):
        return "str"
    return {ast.Tuple: "tuple", ast.Set: "set", ast.SetComp: "set"}.get(type(node))


def places_of(node, context):
    scope = scope_of(node, context)
    while scope is not None:
        yield scope
        scope = scope_of(scope, context)
    yield MODULE


def name_kind(node, context, seen):
    for place in places_of(node, context):
        key = (node.id, id(place))
        if key in seen:
            return SELF
        evidence = evidence_in(node.id, place, context)
        if evidence is None:
            return None
        if evidence:
            return joined_kind(evidence, context, (*seen, key))
    return None


def joined_kind(evidence, context, seen):
    values, annotations = evidence
    kinds = [annotation_kind(item, context) for item in annotations]
    kinds += [kind_of(item, context, seen) for item in values if item is not None]
    kinds = [kind for kind in kinds if kind != SELF]
    return kinds[0] if kinds and all(kind == kinds[0] for kind in kinds) else None


def kind_of(node, context, seen=()):
    if len(seen) > MAX_DEPTH:
        return None
    if isinstance(node, ast.Call):
        return call_kind(node, context, seen)
    if isinstance(node, ast.BinOp):
        return operator_kind(node, context, seen)
    if isinstance(node, ast.Name):
        return name_kind(node, context, seen)
    if isinstance(node, ast.Attribute):
        manager = node.attr in MANAGER_NAMES and is_class_name(node.value)
        return "manager" if manager else None
    return literal_kind(node)
