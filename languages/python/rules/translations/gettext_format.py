import ast

from checks.common import finding
from translations.fields import parsed_fields, positional_slots
from translations.functions import gettext_literals, literal_indexes

RULE = "gettext-format-mismatch"
GUARDED = True
FORMATS = {"format", "format_map"}


def literal_keys(node):
    if not isinstance(node, ast.Dict) or None in node.keys:
        return None
    keys = [key.value for key in node.keys if isinstance(key, ast.Constant)]
    return set(keys) if len(keys) == len(node.keys) else None


def format_problems(call, texts):
    if any(isinstance(arg, ast.Starred) for arg in call.args):
        return []
    if any(keyword.arg is None for keyword in call.keywords):
        return []
    fields = [parsed_fields(text) for text in texts]
    if None in fields:
        return []
    given = {keyword.arg for keyword in call.keywords}
    slots = set().union(
        *(positional_slots(auto, indexes) for auto, indexes, _ in fields)
    )
    names = set().union(*(item[2] for item in fields))
    problems = [f"missing:{name}" for name in sorted(names - given)]
    problems += [
        f"missing:{slot}"
        for field in fields
        for slot in sorted(positional_slots(field[0], field[1]))
        if slot >= len(call.args)
    ]
    problems += [f"unused:{name}" for name in sorted(given - names)]
    problems += [
        f"unused:{slot}" for slot in range(len(call.args)) if slot not in slots
    ]
    return sorted(set(problems))


def map_problems(call, texts):
    keys = (
        literal_keys(call.args[0])
        if len(call.args) == 1 and not call.keywords
        else None
    )
    if keys is None:
        return []
    fields = [parsed_fields(text) for text in texts]
    if None in fields:
        return []
    names = set().union(*(item[2] for item in fields))
    problems = [f"missing:{name}" for name in sorted(names - keys)]
    positional = any(positional_slots(auto, indexes) for auto, indexes, _ in fields)
    return problems + (["missing:positional"] if positional else [])


def after_findings(node, context):
    texts = gettext_literals(node.func.value, context)
    if texts is None:
        return None
    check = format_problems if node.func.attr == "format" else map_problems
    problems = check(node, texts)
    return f"{node.func.attr}|" + "|".join(problems) if problems else None


def before_subject(node, context):
    indexes = literal_indexes(node, context)
    for argument in [node.args[i] for i in indexes or () if i < len(node.args)]:
        if isinstance(argument, ast.Call) and isinstance(argument.func, ast.Attribute):
            if argument.func.attr == "format_map":
                return "format_map|before"
    return None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        subject = before_subject(node, context)
        if isinstance(node.func, ast.Attribute) and node.func.attr in FORMATS:
            subject = subject or after_findings(node, context)
        if subject is not None:
            found.append(finding(context.path, RULE, subject, node))
    return found
