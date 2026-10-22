import ast

from checks.common import dotted_name
from review.common import (
    FUNCTION_TYPES,
    defaulted_parameters,
    finding,
    last_segment,
    parsed_annotation,
    parts_of,
    same_node,
    scoped_definitions,
    unwrapped,
)

ATTRS_DECORATORS = ("define", "frozen", "mutable")
RECORD_DECORATORS = {
    "dataclass",
    "dataclasses.dataclass",
    "pydantic.dataclasses.dataclass",
    *(f"{module}.{name}" for module in ("attr", "attrs") for name in ATTRS_DECORATORS),
    "attr.s",
    "attr.attrs",
    "attr.dataclass",
}
RECORD_BASES = {"BaseModel", "BaseSettings", "NamedTuple"}
TYPED_DICT = "TypedDict"
FIELD_FACTORIES = {"field", "Field", "ib", "attrib"}
FACTORY_KEYWORDS = {"default_factory", "factory"}
MAX_BASE_DEPTH = 10
COLLECTIONS = {
    "list",
    "List",
    "Sequence",
    "MutableSequence",
    "Iterable",
    "Collection",
    "set",
    "Set",
    "frozenset",
    "FrozenSet",
    "AbstractSet",
    "tuple",
    "Tuple",
}
IRREGULAR_PLURALS = {
    "analysis": ("analyses",),
    "axis": ("axes",),
    "child": ("children",),
    "criterion": ("criteria",),
    "foot": ("feet",),
    "index": ("indices", "indexes"),
    "leaf": ("leaves",),
    "life": ("lives",),
    "man": ("men",),
    "matrix": ("matrices",),
    "mouse": ("mice",),
    "person": ("people",),
    "tooth": ("teeth",),
    "vertex": ("vertices",),
    "woman": ("women",),
}


def element_of(annotation):
    annotation = unwrapped(annotation)
    if (
        not isinstance(annotation, ast.Subscript)
        or last_segment(annotation.value) not in COLLECTIONS
    ):
        return None
    parts = parts_of(annotation)
    is_variadic_tuple = (
        len(parts) == 2 and isinstance(parts[1], ast.Constant) and parts[1].value is ...
    )
    element = parts[0] if len(parts) == 1 or is_variadic_tuple else None
    return None if element is None else unwrapped(element)


def plurals_of(name):
    head, _, last = name.rpartition("_")
    prefix = f"{head}_" if head else ""
    plurals = [name + "s", name + "es"]
    if len(last) > 1 and last.endswith("y") and last[-2] not in "aeiou":
        plurals.append(name[:-1] + "ies")
    plurals.extend(prefix + plural for plural in IRREGULAR_PLURALS.get(last, ()))
    return list(dict.fromkeys(plurals))


def singular_and_plural(inputs):
    pairs = []
    for singular, annotation in inputs.items():
        for plural in plurals_of(singular):
            element = element_of(inputs[plural]) if plural in inputs else None
            if element is not None and same_node(element, unwrapped(annotation)):
                pairs.append((singular, plural))
    return pairs


def project_classes(project):
    classes = {}
    for path, context in project.contexts.items():
        module = project.module_name(path)
        for statement in context.tree.body:
            if isinstance(statement, ast.ClassDef):
                classes[f"{module}.{statement.name}"] = (context, statement)
    return classes


def base_class(context, base):
    classes = context.project.memo("review-fields-classes", project_classes)
    name = dotted_name(base, context.aliases)
    if name is None:
        return None
    module = context.project.module_name(context.path)
    return classes.get(name) or classes.get(f"{module}.{name}")


def decorator_target(decorator, aliases):
    return dotted_name(decorator.func if isinstance(decorator, ast.Call) else decorator, aliases)


def record_kind(context, node, depth=0):
    bases = {last_segment(base) for base in node.bases}
    if TYPED_DICT in bases:
        return TYPED_DICT
    decorators = {decorator_target(decorator, context.aliases) for decorator in node.decorator_list}
    if bases & RECORD_BASES or decorators & RECORD_DECORATORS:
        return "record"
    if depth >= MAX_BASE_DEPTH:
        return None
    for base in node.bases:
        found = base_class(context, base)
        kind = None if found is None else record_kind(found[0], found[1], depth + 1)
        if kind is not None:
            return kind
    return None


def is_total_false(node):
    return any(
        keyword.arg == "total"
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is False
        for keyword in node.keywords
    )


def has_default(value):
    if not isinstance(value, ast.Call) or last_segment(value.func) not in FIELD_FACTORIES:
        return not (isinstance(value, ast.Constant) and value.value is Ellipsis)
    keywords = {keyword.arg: keyword.value for keyword in value.keywords}
    if keywords.keys() & FACTORY_KEYWORDS:
        return True
    default = keywords.get("default", value.args[0] if value.args else None)
    return default is not None and not (
        isinstance(default, ast.Constant) and default.value is Ellipsis
    )


def optional_fields(node, kind):
    typed_dict = kind == TYPED_DICT
    total_false = is_total_false(node)
    fields = {}
    for statement in node.body:
        if not isinstance(statement, ast.AnnAssign) or not isinstance(statement.target, ast.Name):
            continue
        annotation = statement.annotation
        parsed = parsed_annotation(annotation)
        wrapper = last_segment(parsed.value) if isinstance(parsed, ast.Subscript) else None
        if wrapper == "ClassVar":
            continue
        optional = (
            (total_false and wrapper != "Required") or wrapper == "NotRequired"
            if typed_dict
            else statement.value is not None and has_default(statement.value)
        )
        if optional:
            fields[statement.target.id] = annotation
    return fields


def optional_parameters(fn):
    return {p.arg: p.annotation for p, _ in defaulted_parameters(fn) if p.annotation is not None}


def field_findings(context, scoped):
    found = []
    path = context.path
    for node, scope in scoped:
        record = record_kind(context, node) if isinstance(node, ast.ClassDef) else None
        if record is not None:
            inputs, kind = optional_fields(node, record), "fields"
        elif isinstance(node, FUNCTION_TYPES):
            inputs, kind = optional_parameters(node), "parameters"
        else:
            continue
        for singular, plural in singular_and_plural(inputs):
            subject = ".".join(scope + (plural,))
            data = {"singular": singular, "plural": plural, "kind": kind}
            found.append(finding("singular-and-plural-field", path, subject, node.lineno, data))
    return found


def check(context):
    if context.tests:
        return []
    return field_findings(context, scoped_definitions(context.tree))
