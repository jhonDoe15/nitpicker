import json
from typing import Protocol


class Row(Protocol):
    due: bool


def collect_due(rows: list[Row], *, active: bool) -> list[Row]:
    if not active:
        return []
    return [row for row in rows if row.due]


def checked_result(rows: list[Row]) -> list[Row]:
    due = [row for row in rows if row.due]
    if not due:
        return []
    return due


def cheap_length(rows: list[int], *, active: bool) -> int:
    total = len(rows)
    if not active:
        return 0
    return total


def parse_then_guard(text: str, *, active: bool) -> object:
    parsed = json.loads(text)
    if not active:
        return []
    return parsed


def guarded_branch(rows: list[int], key: int | None) -> int | None:
    found = None if key is None else next((row for row in rows if row == key), None)
    if key is None:
        return 0
    return found
