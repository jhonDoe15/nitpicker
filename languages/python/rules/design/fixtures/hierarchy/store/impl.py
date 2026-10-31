from collections import OrderedDict

from store import base
from store.base import Box, Closer, Store


class File(Closer, Store):
    def open(self):
        return self

    def close(self):
        return None

    def put(self, item):
        return item


class Logged(File, OrderedDict):
    def close(self):
        return None


class Boxes(Box[int], base.Store, Store):
    def put(self, item):
        return item


class Outer:
    class Inner(File):
        pass


def leak(target: Logged):
    target.open()
    target.close()


def safe(target: Logged):
    target.open()
    try:
        target.put(1)
    finally:
        target.close()
