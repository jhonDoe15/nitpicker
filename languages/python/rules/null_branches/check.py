import ast

from checks.common import finding
from null_branches.branch import branch_facts
from null_branches.later_use import first_use, use_text
from null_branches.targets import is_shared, null_target, raising_names

GUARDED = True
RULE = "null-branch-fall-through"
BODY_FIELDS = ("body", "orelse", "finalbody")


def following_statements(node, context):
    parent = context.parents.get(id(node))
    for field in BODY_FIELDS:
        statements = getattr(parent, field, None)
        if isinstance(statements, list) and node in statements:
            return statements[statements.index(node) + 1 :]
    return []


def branch_use(node, context, raisers):
    key = null_target(node.test) if not node.orelse else None
    if key is None:
        return None, None
    facts = branch_facts(node.body, key, raisers)
    quiet = facts["initialises"] and is_shared(key, node, context.parents)
    if not facts["acts"] or facts["leaves"] or quiet:
        return None, None
    scan = {"key": key, "callees": facts["callees"], "parents": context.parents}
    return key, first_use(following_statements(node, context), scan)


def check(context):
    if context.tests:
        return []
    found = []
    raisers = raising_names(context.tree)
    for node in ast.walk(context.tree):
        if isinstance(node, ast.If):
            key, use = branch_use(node, context, raisers)
            if use is not None:
                found.append(
                    finding(
                        context.path,
                        RULE,
                        f"{key}|{use_text(use, context.parents)}",
                        node,
                    )
                )
    return found
