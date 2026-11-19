from typing import Literal, Optional, TypeVar

T = TypeVar("T")


def event_id_line(event_id: Optional[str]) -> str:
    return f"id: {event_id}" if event_id else ""


def label(title: str | None) -> str:
    if title:
        return title.strip()
    return "untitled"


def secure(suffix: str | None, default: str) -> str:
    chosen: str | None = suffix
    return chosen or default


def present(values: list[str | Literal[""] | None]) -> list[str | None]:
    return list(filter(None, values))


def banner(prefix: str | None) -> str:
    return prefix.strip() if prefix else ""


banner("")
event_id_line("")
label("")
secure("", "x")


def compact(items: list[T]) -> list[T]:
    return [item for item in items if item]


def mode_line(mode: Literal["", "auto"] | None) -> str:
    return mode.upper() if mode else ""
