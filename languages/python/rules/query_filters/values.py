import ast

from checks.common import dotted_name
from regexes.patterns import (
    MAX_DEPTH,
    NUMBER_CALLS,
    RECEIVERS,
    bound_values,
    is_non_text,
    parameters,
)

ESCAPE_WORDS = ("escape", "quote", "sanitize", "filter_format")
ESCAPE_CALLS = {"json.dumps"}
QUOTED_CHARS = "\"\\()*"


def is_quoting_replace(node):
    func = node.func
    if not (isinstance(func, ast.Attribute) and func.attr == "replace"):
        return False
    first = node.args[0] if node.args else None
    is_text = isinstance(first, ast.Constant) and isinstance(first.value, str)
    return is_text and any(char in first.value for char in QUOTED_CHARS)


def is_escape_call(node, aliases):
    if not isinstance(node, ast.Call):
        return False
    if is_quoting_replace(node):
        return True
    name = dotted_name(node.func, aliases) or ""
    last = name.rsplit(".", 1)[-1].lower()
    return name in ESCAPE_CALLS or (
        last != "unescape" and any(word in last for word in ESCAPE_WORDS)
    )


def loaded_names(node, aliases):
    pending, names = [node], []
    while pending:
        current = pending.pop()
        if is_escape_call(current, aliases):
            continue
        if isinstance(current, ast.Call):
            if (dotted_name(current.func, aliases) or "") in NUMBER_CALLS:
                continue
        if isinstance(current, ast.Name) and isinstance(current.ctx, ast.Load):
            names.append(current.id)
        pending.extend(ast.iter_child_nodes(current))
    return names


def depends_on_input(node, function, aliases, depth=0, rebound=None):
    if depth > MAX_DEPTH:
        return False
    own = parameters(function)
    for name in loaded_names(node, aliases):
        argument = own.get(name)
        if name in RECEIVERS:
            continue
        if name == rebound and argument is not None:
            return not is_non_text(argument)
        values = bound_values(function, name)
        if argument is not None and not values:
            if not is_non_text(argument):
                return True
            continue
        if any(
            depends_on_input(v, function, aliases, depth + 1, name) for v in values
        ):
            return True
    return False
