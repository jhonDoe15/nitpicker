import ast

from checks.common import dotted_name
from review.common import last_segment, parsed_annotation, parts_of
from review.project.index import attribute_chain

DATACLASSES = {"dataclasses.dataclass", "dataclass", "pydantic.dataclasses.dataclass"}
ATTRS = {
    f"{module}.{name}"
    for module in ("attr", "attrs")
    for name in ("s", "attrs", "define", "frozen", "mutable", "dataclass")
}
DATACLASS_FIELDS = {
    "dataclasses.field",
    "field",
    "pydantic.Field",
    "pydantic.fields.Field",
}
ATTRS_FIELDS = {
    f"{module}.{name}"
    for module in ("attr", "attrs")
    for name in ("ib", "attrib", "field")
}
NOT_FIELDS = {"ClassVar", "InitVar"}
SINGLE_WRAPPERS = {"Optional", "Union", "Final", "Required", "NotRequired", "ReadOnly"}
ANNOTATED = "Annotated"
CALLABLES = {"Callable"}


def decorator_call(decorator, aliases):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    return dotted_name(target, aliases), decorator


def keyword_false(call, names):
    if not isinstance(call, ast.Call):
        return False
    return any(
        keyword.arg in names
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is False
        for keyword in call.keywords
    )


def generated_eq(node, aliases):
    for decorator in node.decorator_list:
        name, call = decorator_call(decorator, aliases)
        if name in DATACLASSES:
            return "dataclass" if not keyword_false(call, {"eq"}) else None
        if name in ATTRS:
            return "attrs" if not keyword_false(call, {"eq", "cmp"}) else None
    return None


def compared(statement, kind, aliases):
    value = statement.value
    if not isinstance(value, ast.Call):
        return True
    name = dotted_name(value.func, aliases)
    if kind == "dataclass" and name in DATACLASS_FIELDS:
        return not keyword_false(value, {"compare"})
    if kind == "attrs" and name in ATTRS_FIELDS:
        return not keyword_false(value, {"eq", "cmp"})
    return True


def compared_fields(node, kind, aliases):
    for statement in node.body:
        if not isinstance(statement, ast.AnnAssign) or not isinstance(
            statement.target, ast.Name
        ):
            continue
        annotation = parsed_annotation(statement.annotation)
        top = annotation.value if isinstance(annotation, ast.Subscript) else annotation
        if last_segment(top) in NOT_FIELDS:
            continue
        if compared(statement, kind, aliases):
            yield statement.target.id, annotation, statement.lineno


def references(annotation, many=False):
    annotation = parsed_annotation(annotation)
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        yield from references(annotation.left, many)
        yield from references(annotation.right, many)
    elif isinstance(annotation, ast.Subscript):
        base = last_segment(annotation.value)
        parts = parts_of(annotation)
        if base in CALLABLES:
            return
        if base == ANNOTATED:
            yield from references(parts[0], many)
            return
        yield from references(annotation.value, many)
        for part in parts:
            yield from references(part, many or base not in SINGLE_WRAPPERS)
    elif isinstance(annotation, (ast.List, ast.Tuple)):
        for element in annotation.elts:
            yield from references(element, many)
    elif attribute_chain(annotation) is not None:
        yield annotation, many


def nested_class(node, names):
    for name in names:
        node = next(
            (
                child
                for child in node.body
                if isinstance(child, ast.ClassDef) and child.name == name
            ),
            None,
        )
        if node is None:
            return None
    return node


def class_definition(found):
    classes = [node for node in found if isinstance(node, ast.ClassDef)]
    return classes[0] if len(classes) == 1 else None


def resolve_class(index, path, node):
    found = index.resolve(path, node)
    if found is not None:
        return found[0], class_definition(found[2])
    chain = attribute_chain(node)
    outer = class_definition(index.definitions[path].get(chain[0], []))
    if outer is None or len(chain) < 2:
        return path, None
    return path, nested_class(outer, chain[1:])
