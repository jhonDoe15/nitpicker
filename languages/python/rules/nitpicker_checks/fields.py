import ast

from nitpicker_checks.common import FUNCTION_TYPES, decorator_name, finding, last_segment, same_node

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
WRAPPERS = {"NotRequired", "Required", "Annotated", "Final"}
OPTIONAL_NAMES = {"Optional"}


def parts_of(subscript):
    inner = subscript.slice
    index_type = getattr(ast, "Index", None)
    if index_type is not None and isinstance(inner, index_type):
        inner = inner.value
    return inner.elts if isinstance(inner, ast.Tuple) else [inner]


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def unwrapped(annotation):
    while isinstance(annotation, ast.Subscript) and last_segment(annotation.value) in WRAPPERS:
        annotation = parts_of(annotation)[0]
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        kept = [side for side in (annotation.left, annotation.right) if not is_none(side)]
        return kept[0] if len(kept) == 1 else annotation
    if isinstance(annotation, ast.Subscript) and last_segment(annotation.value) in OPTIONAL_NAMES:
        return parts_of(annotation)[0]
    return annotation


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
    return parts[0] if len(parts) == 1 or is_variadic_tuple else None


def plurals_of(name):
    plurals = [name + "s", name + "es"]
    if len(name) > 1 and name.endswith("y") and name[-2] not in "aeiou":
        plurals.append(name[:-1] + "ies")
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
        wrapper = last_segment(annotation.value) if isinstance(annotation, ast.Subscript) else None
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
    arguments = fn.args
    parameters = list(getattr(arguments, "posonlyargs", [])) + list(arguments.args)
    defaulted = parameters[len(parameters) - len(arguments.defaults) :]
    keyword_only = [
        p for p, default in zip(arguments.kwonlyargs, arguments.kw_defaults) if default is not None
    ]
    return {p.arg: p.annotation for p in defaulted + keyword_only if p.annotation is not None}


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
