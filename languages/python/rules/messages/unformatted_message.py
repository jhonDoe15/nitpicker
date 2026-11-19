import ast

from checks.common import finding, is_log_call, dotted_name, shown
from messages.exceptions import is_plain_exception_call
from messages.placeholders import (
    BUILTINS,
    brace_fields,
    expression_of,
    literal_text,
    names_in,
)
from messages.scope_names import bound_names

RULE = "unformatted-message-placeholder"
GUARDED = True
WARN_CALLS = {"warnings.warn"}


def message_of(node, context):
    if isinstance(node, ast.Assert):
        return node.msg
    if not isinstance(node, ast.Call) or not node.args:
        return None
    if len(node.args) == 1 and is_plain_exception_call(node, context):
        return node.args[0]
    if is_log_call(node, context.aliases) and len(node.args) == 1:
        return node.args[0]
    if dotted_name(node.func, context.aliases) in WARN_CALLS:
        return node.args[0]
    return None


def unfilled_field(text, node, context):
    fields = brace_fields(text)
    if not fields:
        return None
    supplied = {item.arg for item in getattr(node, "keywords", [])}
    if None in supplied:
        return None
    bound = bound_names(node, context)
    for field in fields:
        expression = expression_of(field)
        names = names_in(expression) if expression is not None else set()
        if (
            names
            and names <= bound | BUILTINS
            and names & bound
            and not names & supplied
        ):
            return field.strip()
    return None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        message = message_of(node, context)
        text = literal_text(message) if message is not None else None
        field = unfilled_field(text, node, context) if text else None
        if field is not None:
            found.append(finding(context.path, RULE, shown("{" + field + "}"), message))
    return found
