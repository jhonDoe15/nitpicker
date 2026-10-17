from typing_extensions import deprecated


@deprecated("use new_total")
def old_total() -> int:
    return 1


def total() -> int:
    return old_total()
