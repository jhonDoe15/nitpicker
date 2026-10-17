from dataclasses import dataclass


@dataclass(frozen=True)
class Rejected:
    reason: str


def parse(text: str) -> int | Rejected:
    try:
        return int(text)
    except ValueError as error:
        return Rejected(str(error))
