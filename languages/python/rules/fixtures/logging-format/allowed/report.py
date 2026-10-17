import logging

logger = logging.getLogger(__name__)


def report(name: str, count: int) -> None:
    logger.info("Loaded %s items for %s", count, name)
