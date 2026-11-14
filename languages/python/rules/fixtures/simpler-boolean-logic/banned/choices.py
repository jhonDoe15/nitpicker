def label(*, ready: bool) -> str:
    if not ready:
        return "waiting"
    else:
        return "ready"


def pick(first: str, second: str, *, ready: bool) -> str:
    return first if not ready else second


def neither(*, first: bool, second: bool) -> bool:
    return not first and not second


def ship(*, paid: bool, packed: bool) -> list[str]:
    if paid:
        if packed:
            return ["ship"]
    return []


def flag(count: int) -> bool:
    return True if count > 0 else False
