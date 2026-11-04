import atexit
import functools
import threading
import unittest
from contextlib import contextmanager
from json import JSONEncoder

from app.base import Handler
from app.registry import register, route


@route("/orders")
def orders_view(request):
    return request


@functools.lru_cache(maxsize=None)
def cached_total(items):
    return len(items)


@contextmanager
def scoped():
    yield 1


def plain_helper(value):
    return value


def on_exit():
    return None


def main():
    return plain_helper(1)


def called_from_main_block():
    return 1


def tick():
    return 1


def worker_target():
    return 2


def not_registered():
    return 3


atexit.register(on_exit)
register("tick", tick)
threading.Thread(target=worker_target)
sorted([3, 1], key=plain_helper)


class OrderHandler(Handler):
    def handle(self, event):
        return event

    def describe(self):
        return "orders"

    def helper(self):
        return 1


class Encoder(JSONEncoder):
    def default(self, o):
        return str(o)

    def other(self, o):
        return o


class Cases(unittest.TestCase):
    def setUp(self):
        self.value = 1

    def test_value(self):
        self.assertEqual(self.value, 1)

    def helper(self):
        return 2


class Machine:
    def __init__(self):
        self.state = 0

    def __call__(self, value):
        return value

    def __len__(self):
        return 1

    @property
    def size(self):
        return 1

    @staticmethod
    def make():
        return Machine()

    @classmethod
    def build(cls):
        return cls()

    @route("/machine")
    def endpoint(self):
        return 1

    def regular(self):
        return 2


if __name__ == "__main__":
    called_from_main_block()
