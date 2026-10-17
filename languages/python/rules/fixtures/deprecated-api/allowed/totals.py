from typing_extensions import deprecated


@deprecated("use new_total")
def old_total() -> int:
    return 1


def new_total() -> int:
    return 2


def total() -> int:
    return new_total()
