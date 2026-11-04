import functools

counter = 0
__all__ = [functools]


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
    value = counter
    global counter
    return value


def first():
    return [1, 2][5]


def outside():
    raise


async def relay(source):
    yield from source


class Dispatch:
    @functools.singledispatch
    def handle(self, value):
        return value


SPACED = "a​b"
