from overrides.records import project_overrides

MINIMUM_OVERRIDES = 5
MAJORITY_PERCENT = 80


def contract_label(item):
    return item.seed or item.hook


def groups_of(entries):
    groups = {}
    for name, item in entries:
        if item.context.tests:
            continue
        for anchor in item.anchors:
            groups.setdefault((name, anchor.key), (anchor, []))[1].append(item)
    return groups


def is_majority(items):
    kept = sum(1 for item in items if item.calls)
    return len(items) >= MINIMUM_OVERRIDES and kept * 100 >= MAJORITY_PERCENT * len(
        items
    )


def decide(project):
    entries = project_overrides(project)
    chosen = {}
    for name, item in entries:
        if not item.calls and contract_label(item):
            chosen[id(item.method)] = (item, name, contract_label(item))
    for (name, _), (anchor, items) in groups_of(entries).items():
        if anchor.inert or not is_majority(items):
            continue
        for item in items:
            if not item.calls:
                chosen.setdefault(id(item.method), (item, name, anchor.label))
    return chosen
