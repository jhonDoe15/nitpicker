import sys
from collections.abc import Mapping

from .features.settings import (
    Failure,
    IncludeCycle,
    MissingSource,
    Resolved,
    print_settings,
    resolve_settings,
    write_settings,
)


def main(text: str) -> None:
    print_settings(text, sys.stdout)


def describe_failure(failure: Failure) -> str:
    if isinstance(failure, MissingSource):
        return f"Missing source {failure.name}"
    if isinstance(failure, IncludeCycle):
        return f"Include cycle: {' -> '.join(failure.chain)}"
    return f"Empty include in {failure.source}"


def main_includes(entry: str, sources: Mapping[str, str]) -> None:
    resolution = resolve_settings(entry, sources)
    if isinstance(resolution, Resolved):
        write_settings(resolution.settings, sys.stdout)
        return
    sys.stdout.write(describe_failure(resolution) + "\n")
