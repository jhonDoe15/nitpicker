import enum

from typing_extensions import assert_never


class Status(enum.Enum):
    NEW = "new"
    PAID = "paid"
    SHIPPED = "shipped"


def is_open(status: Status) -> bool:
    match status:
        case Status.NEW | Status.PAID:
            return True
        case Status.SHIPPED:
            return False
        case _:
            assert_never(status)
