import ast

from checks.common import finding, last_name, walk_statements
from kinds.names import call_text
from stale_retries.scopes import commit_calls, imports_sqlalchemy, retry_scopes

GUARDED = True
RULE = "stale-retry"
PLAIN_CALLS = {"commit", "flush", "rollback", "close", "sleep"}


def rereads(statements):
    return any(
        isinstance(node, ast.Call) and last_name(node.func) not in PLAIN_CALLS
        for node in walk_statements(statements)
    )


def check(context):
    if context.tests or not imports_sqlalchemy(context):
        return []
    found = []
    for retry in retry_scopes(context):
        commits = commit_calls(retry.statements)
        if commits and not rereads(retry.statements):
            subject = f"{call_text(commits[0])}|{retry.label}"
            found.append(finding(context.path, RULE, subject, commits[0]))
    return found
