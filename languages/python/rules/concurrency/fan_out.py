import ast

from checks.common import finding
from concurrency.bounds import fixed_size, sized_collection
from concurrency.elements import sites_of
from concurrency.functions import (
    DEFINITIONS,
    Caller,
    bindings_of,
    enclosing,
    label_of,
    reach,
    resolve_callee,
)
from concurrency.remote import remote_of, text_of

RULE = "unbounded-fan-out"
SEPARATOR = "\x1f"
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
    caller = Caller(None, context, enclosing(site.anchor, context.parents, DEFINITIONS), {})
    found = reach(target[1], target[0], bindings_of(call, target[1], caller))
    return (label_of(call), found[1], found[0]) if found else None


def collection_text(node, scope):
    text = text_of(sized_collection(node, scope) or node)
    return text if len(text) <= MAX_COLLECTION_TEXT else "the collection"


def covered_nodes(site, context):
    holder = context.parents.get(id(site.collection))
    mapped = isinstance(holder, ast.Call) and getattr(holder.func, "id", "") == "map"
    return [id(site.work)] + ([id(holder)] if mapped else [])


def reported_sites(context):
    found, seen, work_ids = [], set(), set()
    scope = remote_of(context)
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        for site in sites_of(node, context):
            if fixed_size(site.collection, scope, context):
                continue
            work = work_of(site, context)
            if work is None:
                continue
            operation, via, kind = work
            collection = collection_text(site.collection, scope)
            parts = [site.combinator, collection, operation]
            subject = SEPARATOR.join(parts + [via, kind])
            work_ids.update(covered_nodes(site, context))
            if (site.anchor.lineno, subject) not in seen:
                seen.add((site.anchor.lineno, subject))
                found.append((site, subject))
    return found, work_ids


def sites_reported(context):
    return context.project.memo(
        ("fan-out", context.path), lambda _: reported_sites(context)
    )


def reported_work(context):
    return sites_reported(context)[1]


def check(context):
    if context.tests:
        return []
    return [
        finding(context.path, RULE, subject, site.anchor)
        for site, subject in sites_reported(context)[0]
    ]
