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

    def __bool__(self):
        return True

    def __index__(self):
        return self.x

    def __str__(self):
        return f"{self.x:d}"

    def __bytes__(self):
        return str(self).encode()

    @classmethod
    def origin(cls):
        return cls(0)


def describe(count):
    return f"{count:d}"


def counter():
    count = 0

    def bump():
        nonlocal count
        count += 1
        return count

    return bump


async def relay(source):
    async for item in source:
        yield item


class Dispatch:
    @functools.singledispatchmethod
    def handle(self, value):
        return value


ESCAPED = ["\b", "\x1a", "\x1b", "\0", "\u200b"]
