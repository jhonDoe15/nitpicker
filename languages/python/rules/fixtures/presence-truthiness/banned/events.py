from typing import Optional


def event_id_line(event_id: Optional[str]) -> str:
    return f"id: {event_id}" if event_id else ""


def label(title: str | None) -> str:
    if title:
        return title.strip()
    return "untitled"


def secure(suffix: str | None, default: str) -> str:
    chosen: str | None = suffix
    return chosen or default


def present(values: list[str | None]) -> list[str | None]:
    return list(filter(None, values))
