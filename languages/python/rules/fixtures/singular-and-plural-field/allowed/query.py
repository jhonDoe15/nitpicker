from dataclasses import dataclass


@dataclass(frozen=True)
class Query:
    tags: tuple[str, ...] = ()
