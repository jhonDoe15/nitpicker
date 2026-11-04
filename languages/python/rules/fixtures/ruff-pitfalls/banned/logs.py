import logging

logger = logging.Logger(__name__)
named = logging.getLogger(__file__)
LEVEL = logging.WARN


def report(run):
    logger.exception("No active exception")
    logger.error("Failed", exc_info=True)
    logging.warning("Root logger")
    logger.info("%s %s", "only one")
    try:
        run()
    except ValueError:
        logger.exception("Failed", exc_info=False)
        raise
