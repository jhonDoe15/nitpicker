from dataclasses import dataclass

from .parse_settings import Settings


@dataclass(frozen=True)
class Resolved:
    settings: Settings


@dataclass(frozen=True)
class MissingSource:
    name: str


@dataclass(frozen=True)
class IncludeCycle:
    chain: tuple[str, ...]


@dataclass(frozen=True)
class EmptyInclude:
    source: str


Failure = MissingSource | IncludeCycle | EmptyInclude
Resolution = Resolved | Failure
