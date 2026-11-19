import ast

from checks.common import finding, last_name
from messages.exceptions import is_plain_exception_call
from messages.placeholders import brace_fields, literal_text, printf_fields

RULE = "exception-format-arguments"
GUARDED = True
DETAILED = {
    "SyntaxError",
    "IndentationError",
    "TabError",
    "UnicodeDecodeError",
    "UnicodeEncodeError",
    "UnicodeTranslateError",
}


def style_of(text):
    if printf_fields(text):
        return "percent"
    return "braces" if brace_fields(text) else None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call) or len(node.args) < 2:
            continue
        text = literal_text(node.args[0])
        if text is None or any(isinstance(arg, ast.Starred) for arg in node.args):
            continue
        if last_name(node.func) in DETAILED and isinstance(node.args[1], ast.Tuple):
            continue
        style = style_of(text)
        if style is not None and is_plain_exception_call(node, context):
            subject = f"{last_name(node.func)}|{style}"
            found.append(finding(context.path, RULE, subject, node))
    return found
