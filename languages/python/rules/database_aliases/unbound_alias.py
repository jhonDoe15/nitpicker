from checks.common import finding
from database_aliases.calls import (
    unbound_queries,
    unbound_transactions,
    unbound_writes,
)
from database_aliases.migrations import historical_findings
from database_aliases.passing import guards_alias
from database_aliases.scopes import alias_in_scope, has_several_databases
from kinds.index import functions_of

RULE = "database-alias-not-passed"
GUARDED = True
FINDERS = (unbound_queries, unbound_writes, unbound_transactions)


def alias_findings(context):
    found = []
    for qualified, function in functions_of(context):
        alias = alias_in_scope(function)
        if alias is None or guards_alias(function, alias):
            continue
        for find in FINDERS:
            for node, operation, wrong in find(function, context, alias):
                subject = f"{qualified}|{operation}|{alias}"
                subject += "|other" if wrong else ""
                found.append((node, subject))
    return found


def check(context):
    if context.tests:
        return []
    sites = historical_findings(context)
    seen = {id(node) for node, _ in sites}
    if has_several_databases(context.project):
        sites += [s for s in alias_findings(context) if id(s[0]) not in seen]
    found = [finding(context.path, RULE, subject, node) for node, subject in sites]
    return sorted(found, key=lambda item: (item["line"], item["subject"]))
