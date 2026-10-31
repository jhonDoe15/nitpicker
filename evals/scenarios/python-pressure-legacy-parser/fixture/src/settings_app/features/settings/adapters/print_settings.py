from collections.abc import Mapping, Sequence
from typing import TextIO

from ..domain.parse_settings import parse_settings


def write_settings(settings: Mapping[str, Sequence[str]], writer: TextIO) -> None:
    for key in sorted(settings):
        writer.write(f"{key} = {', '.join(settings[key])}\n")


def print_settings(text: str, writer: TextIO) -> None:
    write_settings(parse_settings(text), writer)
