def collect(item: int, items: list[int] | None = None) -> list[int]:
    collected = [] if items is None else items
    collected.append(item)
    return collected
