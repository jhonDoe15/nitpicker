def label(*, ready: bool) -> str:
    if ready:
        return "ready"
    return "waiting"


def pick(first: str, second: str, *, ready: bool) -> str:
    return second if ready else first


def neither(*, first: bool, second: bool) -> bool:
    return not (first or second)


def ship(*, paid: bool, packed: bool) -> list[str]:
    if paid and packed:
        return ["ship"]
    return []


def flag(count: int) -> bool:
    return count > 0
