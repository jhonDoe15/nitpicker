from collections.abc import Mapping
from dataclasses import dataclass, replace

from .parse_settings import parse_settings
from .resolution import (
    EmptyInclude,
    Failure,
    IncludeCycle,
    MissingSource,
    Resolution,
    Resolved,
)


@dataclass(frozen=True)
class Walk:
    sources: Mapping[str, str]
    chain: tuple[str, ...]


def include_name(line: str) -> str | None:
    key, separator, value = line.partition("=")
    return value.strip() if separator and key.strip() == "include" else None


def join(parts: list[list[str] | Failure]) -> list[str] | Failure:
    lines: list[str] = []
    for part in parts:
        if not isinstance(part, list):
            return part
        lines.extend(part)
    return lines


def expand_line(line: str, walk: Walk) -> list[str] | Failure:
    name = include_name(line)
    if name is None:
        return [line]
    if name == "":
        return EmptyInclude(walk.chain[-1])
    if name in walk.chain:
        return IncludeCycle((*walk.chain, name))
    return expand(name, walk)


def expand(name: str, walk: Walk) -> list[str] | Failure:
    text = walk.sources.get(name)
    if text is None:
        return MissingSource(name)
    inner = replace(walk, chain=(*walk.chain, name))
    return join([expand_line(line, inner) for line in text.split("\n")])


def resolve_settings(entry: str, sources: Mapping[str, str]) -> Resolution:
    expanded = expand(entry, Walk(sources, ()))
    if isinstance(expanded, list):
        return Resolved(parse_settings("\n".join(expanded)))
    return expanded
