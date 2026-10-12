import logging

logger = logging.getLogger(__name__)


def report(total: int) -> None:
    logger.info("total: %s", total)
