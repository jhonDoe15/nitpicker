import ast
import re

from checks.common import last_name
from persistence.memory.models import located_class
from persistence.relationships import RELATIONSHIP, SQLMODEL, call_kind, call_options

SCALAR, COLLECTION = "scalar", "collection"
COLLECTION_TYPES = {
    "list",
    "List",
    "set",
    "Set",
    "frozenset",
    "FrozenSet",
    "AbstractSet",
    "MutableSet",
    "Sequence",
    "MutableSequence",
    "Collection",
    "dict",
    "Dict",
    "Mapping",
    "MutableMapping",
}
WRAPPERS = {"Mapped", "Optional"}
COLLECTION_WRAPPERS = {"WriteOnlyMapped", "DynamicMapped"}
UNION = "Union"
TABLE_NAME = "__tablename__"
FOREIGN_KEY = "ForeignKey"
FOREIGN_KEY_OPTION = "foreign_key"
BASE_DEPTH = 4
CAMEL_BREAK = re.compile(r"(?<!^)(?=[A-Z])")


class Mapped:
    def __init__(self, kind, target):
        self.kind = kind
        self.target = target


def parsed(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        try:
            return ast.parse(node.value, mode="eval").body
        except SyntaxError:
            return None
    return node


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def one_side(nodes):
    sides = [side for side in nodes if not is_none(side)]
    return annotation_of(sides[0]) if len(sides) == 1 else (None, None)


def annotation_of(node):
    node = parsed(node)
    if isinstance(node, ast.Subscript):
        head = last_name(node.value)
        if head in WRAPPERS:
            return annotation_of(node.slice)
        if head in COLLECTION_WRAPPERS:
            return COLLECTION, class_name(node.slice)
        if head == UNION and isinstance(node.slice, ast.Tuple):
            return one_side(node.slice.elts)
        inner = node.slice.elts[-1] if isinstance(node.slice, ast.Tuple) else node.slice
        return (COLLECTION, class_name(inner)) if head in COLLECTION_TYPES else (None, None)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return one_side([node.left, node.right])
    name = class_name(node)
    return (SCALAR, name) if name else (None, None)


def class_name(node):
    node = parsed(node)
    if isinstance(node, ast.Lambda):
        node = node.body
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.rsplit(".", 1)[-1]
    return last_name(node)


def table_names(cls):
    for item in cls.body:
        if isinstance(item, (ast.Assign, ast.AnnAssign)):
            targets = item.targets if isinstance(item, ast.Assign) else [item.target]
            named = any(isinstance(target, ast.Name) and target.id == TABLE_NAME for target in targets)
            value = item.value
            if named and isinstance(value, ast.Constant) and isinstance(value.value, str):
                return {value.value}
    return {cls.name.lower(), CAMEL_BREAK.sub("_", cls.name).lower()}


def referenced_table(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.split(".")[0]
    if isinstance(node, ast.Attribute):
        return ("class", last_name(node.value))
    return None


def foreign_tables(cls):
    found = set()
    for node in ast.walk(cls):
        if isinstance(node, ast.Call) and last_name(node.func) == FOREIGN_KEY and node.args:
            found.add(referenced_table(node.args[0]))
        if isinstance(node, ast.Call):
            for keyword in node.keywords:
                if keyword.arg == FOREIGN_KEY_OPTION:
                    found.add(referenced_table(keyword.value))
    return found - {None}


def references(cls, other):
    tables = foreign_tables(cls)
    return bool(tables & table_names(other)) or ("class", other.name) in tables


def class_index(project):
    def build(_):
        index = {}
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef):
                    index.setdefault(node.name, []).append((node, context))
        return index

    return project.memo(("orm-class-index",), build)


def find_class(context, name):
    if name is None:
        return None, None
    found, owner = located_class(context, name)
    if found is not None:
        return found, owner
    matches = class_index(context.project).get(name, [])
    return matches[0] if len(matches) == 1 else (None, None)


def direction(cls, target, options):
    if target is None:
        return None
    if target is cls:
        return SCALAR if "remote_side" in options else COLLECTION
    if references(cls, target):
        return SCALAR
    return COLLECTION if references(target, cls) else None


def relation_value(item, name, context):
    if isinstance(item, ast.Assign):
        named = any(isinstance(target, ast.Name) and target.id == name for target in item.targets)
        annotation = None
    elif isinstance(item, ast.AnnAssign):
        named = isinstance(item.target, ast.Name) and item.target.id == name
        annotation = item.annotation
    else:
        return None
    value = item.value
    if not named or not isinstance(value, ast.Call):
        return None
    kind = call_kind(value, context)
    return (value, kind, annotation) if kind in (RELATIONSHIP, SQLMODEL) else None


def mapped_kind(found, cls, owner):
    call, kind, annotation = found
    options = call_options(call, kind)
    declared, declared_target = annotation_of(annotation) if annotation is not None else (None, None)
    target_name = class_name(call.args[0]) if call.args else class_name(options.get("argument"))
    target_name = target_name or declared_target
    uselist = options.get("uselist")
    if isinstance(uselist, ast.Constant) and isinstance(uselist.value, bool):
        return Mapped(COLLECTION if uselist.value else SCALAR, target_name)
    if options.get("secondary") is not None or options.get("link_model") is not None:
        return Mapped(COLLECTION, target_name)
    if declared is not None:
        return Mapped(declared, target_name)
    target, _ = find_class(owner, target_name)
    return Mapped(direction(cls, target, options), target_name)


def relation_in(context, owner_name, name, depth=0):
    cls, owner = find_class(context, owner_name)
    if cls is None or depth > BASE_DEPTH:
        return None, None
    for item in cls.body:
        found = relation_value(item, name, owner)
        if found is not None:
            return mapped_kind(found, cls, owner), owner
    for base in cls.bases:
        inherited, place = relation_in(owner, last_name(base), name, depth + 1)
        if inherited is not None:
            return inherited, place
    return None, None
