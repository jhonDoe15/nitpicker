import enum


class Status(enum.Enum):
    NEW = "new"
    PAID = "paid"
    SHIPPED = "shipped"


def is_open(status: Status) -> bool:
    return status == Status.NEW or status == Status.PAID
