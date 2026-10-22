import functools

__all__ = ["Point", "describe"]


class Point:
    __slots__ = ("x",)

    def __init__(self, x):
        self.x = x

    def __eq__(self, other):
        return isinstance(other, Point) and other.x == self.x

    def __hash__(self):
        return hash(self.x)

    def __len__(self):
        return 0

    @classmethod
    def origin(cls):
        return cls(0)


def describe(count):
    return f"{count:d}"


def trim(name: str):
    return name.removeprefix("hello")


async def relay(source):
    async for item in source:
        yield item


class Dispatch:
    @functools.singledispatchmethod
    def handle(self, value):
        return value


ESCAPED = "a\u200bb"
