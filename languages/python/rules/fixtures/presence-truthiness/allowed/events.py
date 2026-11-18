from typing import Optional


def event_id_line(event_id: Optional[str]) -> str:
    return f"id: {event_id}" if event_id is not None else ""


def label(title: str | None, name: str) -> str:
    if title is not None:
        return title.strip()
    if name:
        return name
    return "untitled"


def secure(suffix: str | None, default: str) -> str:
    chosen: str | None = suffix
    return default if chosen is None else chosen


def present(values: list[str | None]) -> list[str | None]:
    return [value for value in values if value is not None]
