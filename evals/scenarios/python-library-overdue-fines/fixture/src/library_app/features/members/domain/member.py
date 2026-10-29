from dataclasses import dataclass
from enum import StrEnum


class Tier(StrEnum):
    STANDARD = "standard"
    STUDENT = "student"


@dataclass(frozen=True)
class Member:
    id: str
    name: str
    tier: Tier
