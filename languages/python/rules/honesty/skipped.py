import ast

from checks.common import dotted_name, finding

MARKS = {"skip", "xfail", "skipif"}
CALLS = {"pytest.skip", "pytest.xfail"}
RULE = "skipped-test-without-reason"


def mark_name(node, aliases):
    target = node.func if isinstance(node, ast.Call) else node
    parts = (dotted_name(target, aliases) or "").split(".")
    if (
        parts[0] == "pytest"
        and len(parts) >= 3
        and parts[-2] == "mark"
        and parts[-1] in MARKS
    ):
        return parts[-1]
    return None


def has_reason(call, name):
    if any(keyword.arg == "reason" for keyword in call.keywords):
        return True
    return name == "skip" and bool(call.args)


def reasonless_mark(node, aliases):
    name = mark_name(node, aliases)
    if name is None or (isinstance(node, ast.Call) and has_reason(node, name)):
        return None
    return f"pytest.mark.{name}"


def reasonless_call(node, aliases):
    name = dotted_name(node.func, aliases)
    if (
        name not in CALLS
        or node.args
        or any(k.arg in {"reason", "msg"} for k in node.keywords)
    ):
        return None
    return f"{name}()"


def decorated_marks(node):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return node.decorator_list
    if isinstance(node, ast.Assign) and any(
        isinstance(target, ast.Name) and target.id == "pytestmark"
        for target in node.targets
    ):
        value = node.value
        return value.elts if isinstance(value, (ast.List, ast.Tuple)) else [value]
    return []


def check(context):
    if not context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        for mark in decorated_marks(node):
            subject = reasonless_mark(mark, context.aliases)
            if subject:
                found.append(finding(context.path, RULE, subject, mark))
        if isinstance(node, ast.Call):
            subject = reasonless_call(node, context.aliases)
            if subject:
                found.append(finding(context.path, RULE, subject, node))
    return found
