import logging

logger = logging.getLogger(__name__)


def load(value):
    if not isinstance(value, int):
        raise ValueError("expected an int")
    try:
        return int(value)
    except ValueError as error:
        logger.error("Could not load")
        raise error


def check(value):
    try:
        return int(value)
    except ValueError:
        raise


def fail():
    raise Exception("failed")


def report(value):
    try:
        return int(value)
    except ValueError as error:
        logger.exception("Could not load %s", error)
        raise ValueError(value) from error
