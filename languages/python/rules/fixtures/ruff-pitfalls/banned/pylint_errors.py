import functools
import os

counter = 0
__all__ = [os]


class Point:
    __slots__ = ("x",)

    def __init__(self):
        self.y = 1


class Builder:
    def __init__(self):
        return 1


class Twice(Point, Point):
    pass


class Size:
    def __eq__(self):
        return True

    def __len__(self):
        return -1


def bump():
    print(counter)
    global counter


def first():
    return [1, 2][5]


def outside():
    raise


def keywords():
    return dict(a=1, **{"a": 2})


async def relay(source):
    yield from source


def describe(count):
    return "%y" % count


def trim(name: str):
    return name.lstrip("hello")


def home():
    return os.getenv(1)


class Dispatch:
    @functools.singledispatch
    def handle(self, value):
        return value


SPACED = "a​b"
