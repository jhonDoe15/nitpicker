DEFAULT_LIMIT = 10


def page(limit: int | None = None, label: str | None = None) -> tuple[int, str]:
    size = limit if limit is not None else DEFAULT_LIMIT
    if label is None:
        label = "all"
    return size, label


def either(first: int | None, second: int | None) -> bool:
    if first is not None or second is not None:
        return True
    return False
