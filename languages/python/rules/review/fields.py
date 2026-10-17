import ast

from review.common import (
    FUNCTION_TYPES,
    decorator_name,
    defaulted_parameters,
    finding,
    last_segment,
    parsed_annotation,
    parts_of,
    same_node,
    scoped_definitions,
    unwrapped,
)

RECORD_DECORATORS = {"dataclass", "define"}
RECORD_BASES = {"BaseModel", "BaseSettings", "TypedDict", "NamedTuple"}
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
    return plurals


def singular_and_plural(inputs):
    pairs = []
    for singular, annotation in inputs.items():
        for plural in plurals_of(singular):
            element = element_of(inputs[plural]) if plural in inputs else None
            if element is not None and same_node(element, unwrapped(annotation)):
                pairs.append((singular, plural))
    return pairs


def is_record(node, aliases):
    bases = {last_segment(base) for base in node.bases}
    decorators = {decorator_name(decorator, aliases) for decorator in node.decorator_list}
    return bool(bases & RECORD_BASES or decorators & RECORD_DECORATORS)


def is_total_false(node):
    return any(
        keyword.arg == "total"
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is False
        for keyword in node.keywords
    )


def optional_fields(node):
    typed_dict = any(last_segment(base) == "TypedDict" for base in node.bases)
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
            else statement.value is not None
        )
        if optional:
            fields[statement.target.id] = annotation
    return fields


def optional_parameters(fn):
    return {p.arg: p.annotation for p, _ in defaulted_parameters(fn) if p.annotation is not None}


def field_findings(path, scoped, aliases):
    found = []
    for node, scope in scoped:
        if isinstance(node, ast.ClassDef) and is_record(node, aliases):
            inputs, kind = optional_fields(node), "fields"
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
    return field_findings(context.path, scoped_definitions(context.tree), context.aliases)
