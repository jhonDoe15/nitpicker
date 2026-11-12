import ast

from checks.common import call_name, dotted_name
from honesty.mocks.targets import resolve
from honesty.subjects.targets import FUNCTIONS

UNWRAPPED = {"Optional", "Union", "Annotated", "Final", "ReadOnly"}
FIRST_ONLY = {"Annotated", "Final", "ReadOnly"}
STATIC = "staticmethod"
SELF_TYPE = "Self"


def parameters(function, bound):
    arguments = function.args
    positional = arguments.posonlyargs + arguments.args
    positional = positional[1:] if bound else positional
    keywords = {item.arg: item.annotation for item in positional + arguments.kwonlyargs}
    return [item.annotation for item in positional], keywords


def is_static(function):
    return any(
        isinstance(item, ast.Name) and item.id == STATIC
        for item in function.decorator_list
    )


def class_fields(node):
    fields = [
        item
        for item in node.body
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name)
    ]
    keywords = {item.target.id: item.annotation for item in fields}
    return [item.annotation for item in fields], keywords


def class_parameters(node):
    for item in node.body:
        if isinstance(item, FUNCTIONS) and item.name == "__init__":
            return parameters(item, True)
    positional, keywords = class_fields(node)
    return ([] if node.bases else positional), keywords


def signature(found):
    if isinstance(found.node, ast.ClassDef):
        return class_parameters(found.node)
    bound = "." in found.name and not is_static(found.node)
    return parameters(found.node, bound)


def slot_annotation(found, slot):
    positional, keywords = signature(found)
    kind, value = slot
    if kind == "keyword":
        return keywords.get(value)
    return positional[value] if value < len(positional) else None


def annotation_names(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        try:
            return annotation_names(ast.parse(node.value, mode="eval").body)
        except SyntaxError:
            return []
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return annotation_names(node.left) + annotation_names(node.right)
    if isinstance(node, ast.Subscript) and last(node.value) in UNWRAPPED:
        inner = node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
        inner = inner[:1] if last(node.value) in FIRST_ONLY else inner
        return [name for item in inner for name in annotation_names(item)]
    return [node] if isinstance(node, (ast.Name, ast.Attribute)) else []


def last(node):
    if isinstance(node, ast.Name):
        return node.id
    return node.attr if isinstance(node, ast.Attribute) else None


def annotated_class(project, found, annotation):
    context = project.contexts[found.path]
    for node in annotation_names(annotation):
        if last(node) == SELF_TYPE:
            continue
        dotted = dotted_name(node, context.aliases)
        if dotted and "." not in dotted:
            dotted = f"{found.module}.{dotted}"
        target = resolve(project, dotted) if dotted else None
        if target is not None and isinstance(target.node, ast.ClassDef):
            return target
    return None


def expected_class(context, call, slot):
    project = context.project
    found = resolve(project, call_name(call, context.aliases))
    if found is None:
        return None
    annotation = slot_annotation(found, slot)
    return annotated_class(project, found, annotation) if annotation else None
