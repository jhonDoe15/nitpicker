DEFAULT_LIMIT = 10


def page(limit: int | None = None, label: str = None) -> tuple[int, str]:
    size = limit or DEFAULT_LIMIT
    return size, label if label else "all"
