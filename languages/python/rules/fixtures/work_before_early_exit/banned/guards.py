from typing import Protocol


class Row(Protocol):
    due: bool


class Options(Protocol):
    enabled: bool


def collect_due(rows: list[Row], *, active: bool) -> list[Row]:
    due = [row for row in rows if row.due]
    if not active:
        raise ValueError("inactive")
    return due


def build_index(source: dict[str, int], options: Options) -> dict[str, int] | None:
    index = dict(source.items())
    if not options.enabled:
        return None
    return index


def intersect_rows(rows: list[int], other: list[int], *, active: bool) -> list[int]:
    seen = set(other)
    if not active:
        return []
    return [row for row in rows if row in seen]
