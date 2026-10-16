import logging

logger = logging.getLogger(__name__)


class OrderNotFoundError(Exception):
    pass


def load(value):
    if not isinstance(value, int):
        raise TypeError("expected an int")
    try:
        return int(value)
    except ValueError:
        logger.exception("Could not load")
        raise


def fail():
    raise OrderNotFoundError("failed")
