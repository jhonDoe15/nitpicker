import ast

from checks.common import words_of
from kinds.receivers import callee_of
from soft_delete.fields import SOFT_FIELDS
from soft_delete.models import base_names, lineage, project_classes

COLLECTIONS = {
    "list",
    "List",
    "Sequence",
    "MutableSequence",
    "Iterable",
    "Collection",
    "Iterator",
    "tuple",
    "Tuple",
    "set",
    "Set",
    "frozenset",
    "FrozenSet",
    "deque",
    "Deque",
}
NARROWING_WORDS = {
    "nondeleted",
    "undeleted",
    "live",
    "alive",
    "active",
    "visible",
    "present",
}
UNWRAPPED = {"Optional", "Final", "ClassVar", "Annotated"}


def declared_fields(cls):
    found = set()
    for statement in cls.body:
        target = None
        if isinstance(statement, ast.AnnAssign):
            target = statement.target
        elif isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target = statement.targets[0]
        if isinstance(target, ast.Name) and target.id in SOFT_FIELDS:
            found.add(target.id)
    return found


def item_types(project):
    def build(_):
        classes = project_classes(project)
        found = {}
        for name, (cls, context) in classes.items():
            fields = set()
            for member, _member_context in lineage(cls, context, classes):
                fields |= declared_fields(member)
            if fields and not base_names(cls) == ["Protocol"]:
                found[name] = frozenset(fields)
        return found

    return project.memo("deleted-item-types", build)


def parsed(annotation):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            return ast.parse(annotation.value, mode="eval").body
        except SyntaxError:
            return None
    return annotation


def simple_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def element_type(annotation):
    node = parsed(annotation)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return element_type(node.left) or element_type(node.right)
    if not isinstance(node, ast.Subscript):
        return None
    base = simple_name(node.value)
    inner = node.slice
    if base in UNWRAPPED:
        if isinstance(inner, ast.Tuple):
            return element_type(inner.elts[0]) if inner.elts else None
        return element_type(inner)
    if base not in COLLECTIONS:
        return None
    if isinstance(inner, ast.Tuple) and inner.elts:
        inner = inner.elts[0]
    return inner


def narrowing(element):
    if isinstance(element, ast.Subscript):
        base = simple_name(element.value) or ""
        if set(words_of(base)) & NARROWING_WORDS or base.lower() in NARROWING_WORDS:
            return base, simple_name(element.slice)
    return None


def typed_item(annotation, types):
    element = element_type(annotation)
    if element is None:
        return None
    narrowed = narrowing(element)
    if narrowed is not None and narrowed[1] in types:
        return narrowed[1], narrowed[0]
    name = simple_name(element)
    return (name, None) if name in types else None


def reassigned(function, name):
    count = 0
    for node in ast.walk(function):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, (ast.AugAssign, ast.NamedExpr)):
            targets = [node.target]
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            targets = [node.target]
        for target in targets:
            for part in ast.walk(target):
                if isinstance(part, ast.Name) and part.id == name:
                    count += 1
    return count


def self_attributes(cls, types):
    found = {}
    for node in ast.walk(cls):
        if isinstance(node, ast.AnnAssign):
            target = node.target
            if isinstance(target, ast.Name) and node in cls.body:
                key = f"self.{target.id}"
            elif (
                isinstance(target, ast.Attribute)
                and ast.unparse(target.value) == "self"
            ):
                key = f"self.{target.attr}"
            else:
                continue
            item = typed_item(node.annotation, types)
            if item is not None:
                found[key] = item
    return found


def typed_names(function, context, types, attributes):
    found = {key: (item, 0) for key, item in attributes.items()}
    arguments = function.args
    for argument in arguments.posonlyargs + arguments.args + arguments.kwonlyargs:
        item = typed_item(argument.annotation, types) if argument.annotation else None
        if item is not None:
            found[argument.arg] = (item, 0)
    for node in ast.walk(function):
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            item = typed_item(node.annotation, types)
            if item is not None:
                found[node.target.id] = (item, 1 if node.value is not None else 0)
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            item = returned_item(node, context, types)
            if item is not None and len(node.targets) == 1:
                found[node.targets[0].id] = (item, 1)
    return {
        key: named_narrowing(key, item)
        for key, (item, allowed) in found.items()
        if key.startswith("self.") or reassigned(function, key) <= allowed
    }


def named_narrowing(key, item):
    words = set(words_of(key.split(".")[-1]))
    narrowed = bool(words & NARROWING_WORDS) or (
        "deleted" in words and bool(words & {"non", "not", "undeleted"})
    )
    return (item[0], key) if narrowed and item[1] is None else item


def returned_item(assignment, context, types):
    value = assignment.value
    if not isinstance(value, ast.Call):
        return None
    callee = callee_of(value.func, context)
    if callee is None or callee.returns is None:
        return None
    return typed_item(callee.returns, types)
