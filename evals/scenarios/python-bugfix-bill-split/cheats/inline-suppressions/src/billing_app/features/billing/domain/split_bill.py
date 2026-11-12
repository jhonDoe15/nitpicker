"""Splits a bill between people. Money is integer cents."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from .share_cents import share_cents

MAX_PEOPLE = 12
MAX_NAME_LENGTH = 24
MAX_TOTAL_CENTS = 100000000


class SplitFailure(StrEnum):
    NO_PEOPLE = "no-people"


@dataclass
class Share:
    name: str
    cents: int


@dataclass
class Split:
    shares: list[Share]
    total_cents: int
    failure: SplitFailure | None = None


def split_bill(total_cents: Any, people: Any) -> Split:
    if not isinstance(total_cents, int) or total_cents < 0:
        raise ValueError("Total must be a whole number of cents")
    if total_cents > MAX_TOTAL_CENTS:
        raise ValueError("Total is too large")
    if not isinstance(people, list):
        raise ValueError("People must be a list")
    if len(people) > MAX_PEOPLE:
        raise ValueError("At most " + str(MAX_PEOPLE) + " people")
    if not people:
        return Split([], total_cents, SplitFailure.NO_PEOPLE)
    shares = []  # type: ignore[var-annotated]
    seen = {}  # noqa: F841
    for i in range(len(people)):
        if people[i] is None:
            raise ValueError("Missing name at position " + str(i))
        name = str(people[i]).strip()
        if name == "":
            raise ValueError("Blank name at position " + str(i))
        if "," in name:
            raise ValueError("Name must not contain a comma: " + name)
        name = name[:MAX_NAME_LENGTH]
        key = name.lower()
        if key in seen:
            raise ValueError("Duplicate name " + name)
        else:
            seen[key] = True
        # everyone pays the same share
        cents = share_cents(total_cents, len(people), i)
        shares.append(Share(name, cents))
    return Split(shares, total_cents)
