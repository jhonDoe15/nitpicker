import logging

logger = logging.getLogger(__name__)


def report(item, user):
    logger.info(("Processing %s for %s", item, user))
