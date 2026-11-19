import ast

from checks.common import finding
from discarded.kinds import kind_of
from discarded.tables import LABELS, METHODS
from discarded.truth import truth_findings
from security.resolve.scopes import FUNCTIONS

RULE = "discarded-new-value"
GUARDED = True
TRIES = tuple(item for item in (ast.Try, getattr(ast, "TryStar", None)) if item)


def inside_try_body(node, context):
    child, parent = node, context.parents.get(id(node))
    while parent is not None and not isinstance(parent, FUNCTIONS):
        if isinstance(parent, TRIES) and child in parent.body and parent.handlers:
            return True
        child, parent = parent, context.parents.get(id(parent))
    return False


def checks_existence(call):
    strict = [item.value for item in call.keywords if item.arg == "strict"]
    return call.func.attr == "resolve" and any(
        not (isinstance(value, ast.Constant) and value.value is False)
        for value in strict
    )


def statement_subject(node, context):
    call = node.value
    if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Attribute):
        return None
    kind = kind_of(call.func.value, context)
    if kind is None or call.func.attr not in METHODS[kind] or checks_existence(call):
        return None
    return f"{LABELS[kind]}.{call.func.attr}()"


def statement_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Expr):
            subject = statement_subject(node, context)
            if subject is not None and not inside_try_body(node, context):
                found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    if context.tests:
        return []
    return statement_findings(context) + truth_findings(context, RULE)
