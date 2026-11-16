from dataclasses import dataclass


@dataclass(frozen=True)
class LineItem:
    sku: str
    is_deleted: bool = False


def priced(items: list[LineItem]):
    return [i for i in items if not i.is_deleted]


def first_priced(items: list[LineItem]):
    for item in items:
        if item.is_deleted:
            continue
        return item
    return None


def has_sku(items: list[LineItem], sku):
    return any(i.sku == sku and not i.is_deleted for i in items)


def find_sku(items: list[LineItem], sku):
    return next((i for i in items if i.sku == sku and not i.is_deleted), None)


def sku_list(items: list[LineItem]):
    return [i.sku for i in items if not i.is_deleted]


def count_sku(items: list[LineItem], sku):
    return len([i for i in items if i.sku == sku and not i.is_deleted])


def restore_all(items: list[LineItem]):
    return [i.sku for i in items]


def render(visible_items: list[LineItem]):
    return [i.sku for i in visible_items]


def ordered(items: list[LineItem]):
    return sorted(items, key=lambda i: i.sku)


def index(items: list[LineItem]):
    return {i.sku: i for i in items}
