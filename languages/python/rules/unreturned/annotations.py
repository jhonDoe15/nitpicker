import ast

from checks.common import dotted_name

PLAIN = {
    "None",
    "int",
    "str",
    "bool",
    "float",
    "bytes",
    "bytearray",
    "complex",
    "object",
    "list",
    "dict",
    "set",
    "frozenset",
    "tuple",
    "type",
    "Any",
    "Self",
    "NoReturn",
    "Never",
    "typing.Any",
    "typing.Self",
    "typing.NoReturn",
    "typing.Never",
    "typing_extensions.Self",
}
UNIONS = {"Optional", "Union", "typing.Optional", "typing.Union"}


def parsed(annotation):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            return ast.parse(annotation.value, mode="eval").body
        except (SyntaxError, ValueError):
            return None
    return annotation


def members(annotation, aliases):
    annotation = parsed(annotation)
    if isinstance(annotation, ast.Constant) and annotation.value is None:
        return []
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        left = members(annotation.left, aliases)
        right = members(annotation.right, aliases)
        return None if left is None or right is None else left + right
    if isinstance(annotation, ast.Subscript):
        head = dotted_name(annotation.value, aliases)
        if head not in UNIONS:
            return None
        inner = annotation.slice
        parts = inner.elts if isinstance(inner, ast.Tuple) else [inner]
        found = [members(part, aliases) for part in parts]
        return None if any(item is None for item in found) else sum(found, [])
    if not isinstance(annotation, (ast.Name, ast.Attribute)):
        return None
    name = dotted_name(annotation, aliases)
    return [name] if name else None


def result_names(annotation, aliases):
    if annotation is None:
        return None
    found = members(annotation, aliases)
    if not found or any(
        name.rsplit(".", 1)[-1] in PLAIN or name in PLAIN for name in found
    ):
        return None
    return frozenset(name.rsplit(".", 1)[-1] for name in found)
