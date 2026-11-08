import logging

LOGGER = logging.getLogger(__name__)


def total(prices: list[int]) -> int:
    LOGGER.info("Totalling %s prices", len(prices))
    return sum(prices)
