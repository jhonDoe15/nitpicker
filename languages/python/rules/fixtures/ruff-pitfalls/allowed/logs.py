import logging

logger = logging.getLogger(__name__)
LEVEL = logging.WARNING


def report(run):
    logger.error("No active exception")
    logger.warning("%s %s", "one", "two")
    try:
        run()
    except ValueError:
        logger.exception("Failed")
        raise
