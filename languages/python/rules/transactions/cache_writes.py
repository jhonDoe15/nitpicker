import ast

from checks.common import finding, walk_statements
from kinds.index import io_scope
from transactions.cache_clients import cache_label
from transactions.local_caches import names_in, stored_entries, written_names
from transactions.scopes import held_scopes

RULE = "cache-write-in-transaction"
GUARDED = True
LOCAL = "local"


def scope_findings(held, scope, context, seen):
    found = []
    for node in walk_statements(held.body):
        if not isinstance(node, ast.Call) or id(node) in seen:
            continue
        label = cache_label(node, context)
        if label is not None:
            seen.add(id(node))
            owner = ast.unparse(node.func.value)
            subject = f"{owner}.{label}()|{held.label}"
            found.append(finding(context.path, RULE, subject, node))
    written = written_names(held.body, scope)
    for node, key in stored_entries(held.body, context):
        if id(node) not in seen and names_in(node.value) & written:
            seen.add(id(node))
            found.append(
                finding(context.path, RULE, f"{key}[]|{held.label}|{LOCAL}", node)
            )
    return found


def check(context):
    if context.tests:
        return []
    scope = io_scope(context)
    found, seen = [], set()
    for held in held_scopes(context, scope):
        if held.kind == "transaction":
            found.extend(scope_findings(held, scope, context, seen))
    return found
