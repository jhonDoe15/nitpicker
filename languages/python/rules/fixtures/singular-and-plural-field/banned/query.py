from dataclasses import dataclass


@dataclass(frozen=True)
class Query:
    tag: str | None = None
    tags: list[str] | None = None
