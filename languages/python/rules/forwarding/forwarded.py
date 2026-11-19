import ast

from forwarding.calls import callee_findings, super_findings
from forwarding.serialize import serialize_findings
from signatures.annotations import FUNCTION_TYPES


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef):
            found.extend(serialize_findings(node, context))
        elif isinstance(node, FUNCTION_TYPES):
            found.extend(super_findings(node, context))
            found.extend(callee_findings(node, context))
    return found
