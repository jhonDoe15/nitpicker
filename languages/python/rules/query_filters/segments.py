import ast
import re

from regexes.patterns import concatenation, is_text

FIELD = re.compile(r"\{([^{}]*)\}|%\(([^)]*)\)s|%[sdr]")


def field_value(match, values, names, position):
    key = match.group(1) if match.group(1) is not None else match.group(2)
    key = (key or "").split("!")[0].split(":")[0]
    if key.isdigit():
        index = int(key)
    elif key:
        return names.get(key), position
    else:
        index = position
        position += 1
    return (values[index] if index < len(values) else None), position


def format_segments(text, values, names):
    segments, position, end = [], 0, 0
    for match in FIELD.finditer(text):
        segments.append(text[end : match.start()])
        value, position = field_value(match, values, names, position)
        segments.append(value)
        end = match.end()
    segments.append(text[end:])
    return segments


def joined_segments(node):
    return [part.value for part in node.values]


def is_percent_format(node):
    return (
        isinstance(node, ast.BinOp)
        and isinstance(node.op, ast.Mod)
        and is_text(node.left)
    )


def is_format_call(node):
    func = node.func if isinstance(node, ast.Call) else None
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "format"
        and is_text(func.value)
    )


def segments_of(node):
    if isinstance(node, ast.JoinedStr):
        return joined_segments(node)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        parts = concatenation(node)
        if not any(map(is_text, parts)):
            return None
        return [p.value if is_text(p) else p for p in parts]
    if is_percent_format(node):
        right = node.right
        values = list(right.elts) if isinstance(right, ast.Tuple) else [right]
        return format_segments(node.left.value, values, {})
    if is_format_call(node):
        func = node.func
        names = {keyword.arg: keyword.value for keyword in node.keywords if keyword.arg}
        return format_segments(func.value.value, list(node.args), names)
    return None


def rendered(segments):
    return "".join(part if isinstance(part, str) else "X" for part in segments)


def interpolations(segments):
    previous = ""
    for part in segments:
        if isinstance(part, str):
            previous = part
        elif part is not None:
            yield previous, part
            previous = ""
