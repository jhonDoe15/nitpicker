from inventory import Inventory


def direct(inv: Inventory):
    inv.lines().append(1)


def aliased(inv: Inventory):
    lines = inv.lines()
    print(lines)
    lines.extend([1])
    lines.clear()


def first_change_wins(inv: Inventory):
    lines = inv.lines()
    lines.sort()
    lines.append(2)


def subscript_assignment(inv: Inventory):
    index = inv.index()
    index["a"] = 1


def attribute_assignment(inv: Inventory):
    inv.lines().first = 3


def reassigned(inv: Inventory):
    lines = inv.lines()
    lines = []
    lines.append(1)


def copied(inv: Inventory):
    lines = list(inv.lines())
    lines.append(1)


def read_only(inv: Inventory):
    lines = inv.lines()
    return len(lines)


def property_mutation(inv: Inventory):
    inv.view.append(1)


def project_method(inv: Inventory):
    inv.add(1)
    return inv.text()


async def awaited(inv: Inventory):
    rows = await inv.fetch()
    rows.append(1)


async def not_awaited(inv: Inventory):
    rows = inv.fetch()
    rows.append(1)


import cache  # noqa: E402
from registry import Registry  # noqa: E402


def augmented(inv: Inventory):
    lines = inv.lines()
    lines += [1]


def walrus(inv: Inventory):
    (lines := inv.lines()).append(1)


def defaulted(inv: Inventory):
    lines = inv.lines() or []
    lines.append(1)


def class_state(registry: Registry):
    registry.known().append(1)


def module_state():
    cache.cache().append(1)
    cache.peek().append(2)
