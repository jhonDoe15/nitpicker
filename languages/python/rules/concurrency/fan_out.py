import ast

from checks.common import finding
from concurrency.bounds import fixed_size
from concurrency.elements import sites_of
from concurrency.functions import label_of, reach, resolve_callee
from concurrency.remote import remote_of, text_of

RULE = "unbounded-fan-out"
MAX_COLLECTION_TEXT = 40


def work_of(site, context):
    call = site.work
    scope = remote_of(context)
    kind = scope.kind(call)
    if kind:
        return label_of(call), "", kind
    target = resolve_callee(call, site.anchor, context)
    if target is None or not isinstance(target[1], ast.AsyncFunctionDef):
        return None
    found = reach(target[1], target[0])
    return (label_of(call), found[1], found[0]) if found else None


def collection_text(node):
    text = text_of(node)
    return text if len(text) <= MAX_COLLECTION_TEXT else "the collection"


def check(context):
    if context.tests:
        return []
    found, seen = [], set()
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        for site in sites_of(node, context):
            work = work_of(site, context)
            scope = remote_of(context)
            if work is None or fixed_size(site.collection, scope, context.parents):
                continue
            operation, via, kind = work
            subject = "|".join(
                [
                    site.combinator,
                    collection_text(site.collection),
                    operation,
                    via,
                    kind,
                ]
            )
            if (site.anchor.lineno, subject) not in seen:
                seen.add((site.anchor.lineno, subject))
                found.append(finding(context.path, RULE, subject, site.anchor))
    return found
