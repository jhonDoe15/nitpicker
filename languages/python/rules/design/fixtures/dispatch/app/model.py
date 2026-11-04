from abc import ABCMeta
from enum import Enum
from typing import Literal


class Color(Enum):
    RED = "red"
    BLUE = "blue"


class Handler:
    def __call__(self, value: int) -> int:
        return value


class Factory:
    @classmethod
    def build(cls) -> "Factory":
        return cls()

    @classmethod
    def twice(cls) -> "Factory":
        cls.build()
        return cls.build()


class Shape(metaclass=ABCMeta):
    def area(self) -> int:
        return 0


def paint(color: Literal[Color.RED, -1], broken: "list[", other: "Factory") -> None:
    return None
