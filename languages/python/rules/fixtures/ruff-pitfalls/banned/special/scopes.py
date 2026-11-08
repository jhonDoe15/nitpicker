import functools
import logging

logger = logging.getLogger(__name__)
total = 0
__all__ = "scopes"


def both():
    nonlocal total
    global total


def unbound():
    nonlocal missing


def add(value):
    global total
    total += value


def wait(task):
    await task


def report(count):
    logger.info("%s", count, "extra")


@functools.singledispatchmethod
def handle(value):
    return value
