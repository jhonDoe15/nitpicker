from collections import Counter

from checks.common import finding
from deleted_items.iterations import iterations_of

GUARD_THRESHOLD = 0.8
MINIMUM = 5
RULE = "deleted-item-filter-missing"
GUARDED = True


def item_majorities(project):
    def build(_):
        tally = {}
        for context in project.contexts.values():
            if not context.tests:
                for item in iterations_of(context):
                    tally.setdefault(item.item, []).append(item)
        found = {}
        for name, items in tally.items():
            guarded = [item for item in items if item.guarded]
            share = len(guarded) / len(items)
            if len(items) >= MINIMUM and GUARD_THRESHOLD <= share < 1:
                via = Counter(item.via for item in guarded).most_common(1)[0][0]
                found[name] = (via, len(guarded), len(items))
        return found

    return project.memo("deleted-item-majorities", build)


def check(context):
    if context.tests:
        return []
    majorities = item_majorities(context.project)
    found = []
    for item in iterations_of(context):
        if item.guarded or item.item not in majorities:
            continue
        via, guarded, total = majorities[item.item]
        subject = f"{item.function}|{item.item}|{item.field}|{via}|{guarded} of {total}"
        found.append(finding(context.path, RULE, subject, item.node))
    return found
