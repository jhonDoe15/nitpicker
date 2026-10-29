from enum import Enum


class Status(Enum):
    OPEN = "open"
    PAID = "paid"
    VOID = "void"


class Session:
    def begin(self) -> None:
        pass

    def close(self) -> None:
        pass


class Order:
    def __init__(self, status: Status) -> None:
        self.status = status
        self.total = 0
        self._lines: list[int] = []

    def lines(self) -> list[int]:
        return self._lines
