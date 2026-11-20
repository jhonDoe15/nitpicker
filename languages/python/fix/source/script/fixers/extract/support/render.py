import ast
import re

from source_text import refuse

STEMS = {"str": "text", "int": "number", "float": "number", "bool": "flag"}
LINE_END = re.compile(r"\r\n|\r|\n")
NAME = re.compile(r"[^0-9A-Za-z_]+")


def helper_name(label, taken):
    stem = NAME.sub("_", label).strip("_") or "body"
    name = f"_shared_{stem}"
    if name in taken:
        refuse("the name of the shared function would collide")
    return name


def hole_names(holes, taken):
    names, used = [], set(taken)
    for hole in holes:
        base = STEMS[hole.kind]
        options = [base, f"{base}_value"] + [f"{base}_value_{n}" for n in range(2, 100)]
        name = next((option for option in options if option not in used), None)
        if name is None:
            refuse("the name of a new parameter would collide")
        used.add(name)
        names.append(name)
    return names


def line_end(source, offset):
    found = LINE_END.search(source.text, offset)
    return found.start() if found else len(source.text)


def indentation(source, node):
    start, _ = source.span(node)
    line_start = source.text.rfind("\n", 0, start) + 1
    prefix = source.text[line_start:start]
    if prefix.strip():
        refuse("a statement shares its line with another one")
    return prefix


def segment(source, node):
    return source.source_of(node)


def replaced_body(source, statements, holes, names):
    start, _ = source.span(statements[0])
    _, end = source.span(statements[-1])
    pieces = []
    for hole, name in zip(holes, names):
        for left, _ in hole.occurrences:
            low, high = source.span(left)
            pieces.append((low - start, high - start, name))
    text = source.text[start:end]
    for low, high, name in sorted(pieces, reverse=True):
        text = text[:low] + name + text[high:]
    return text


def hole_argument(source, hole, side):
    return segment(source, hole.occurrences[0][side])


def has_value_return(statements):
    return any(
        isinstance(node, ast.Return) and node.value is not None
        for root in statements
        for node in ast.walk(root)
    )


def call_text(callee, arguments, mode):
    call = f"{callee}({', '.join(arguments)})"
    awaited = f"await {call}" if mode["async"] else call
    return f"return {awaited}" if mode["returns"] else awaited


def newline_of(source):
    return "\r\n" if "\r\n" in source.text else "\n"


def insertion(source, anchor, text, method):
    gap = "\n\n" if method else "\n\n\n"
    _, end = source.span(anchor)
    at = line_end(source, end)
    return (at, at, gap.replace("\n", newline_of(source)) + text)
