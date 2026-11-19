import ast

from checks.common import finding, functions_of, shown
from missing_keys.guards import UPDATED, inside_guarded_try, pair, stored_pairs, tested_pairs
from missing_keys.mappings import kind_of, local_kinds, subscripts_of

RULE = "missing-key-subscript"
GUARDED = True


def subject_of(node, kind):
    return f"{kind}|{shown(ast.unparse(node), 60)}"


def function_findings(function, context):
    local = local_kinds(function, context)
    tested = tested_pairs(function) | stored_pairs(function)
    found = []
    for node in subscripts_of(function):
        kind = kind_of(node.value, local, context)
        updated = (ast.unparse(node.value), UPDATED) in tested
        if kind is None or updated or pair(node.value, node.slice) in tested:
            continue
        if not inside_guarded_try(node, context):
            found.append(finding(context.path, RULE, subject_of(node, kind), node))
    return found


def check(context):
    if context.tests:
        return []
    found, seen = [], set()
    for function in functions_of(context.tree):
        for item in function_findings(function, context):
            key = (item["line"], item["subject"])
            if key not in seen:
                seen.add(key)
                found.append(item)
    return found
