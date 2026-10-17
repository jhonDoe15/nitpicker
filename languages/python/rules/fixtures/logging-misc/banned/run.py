import logging

logger = logging.getLogger(__name__)


def run(task):
    logger.warn("slow")
    logger.info("started", extra={"name": task})
    try:
        task()
    except ValueError:
        logger.error("failed", exc_info=True)
        logger.exception("failed", exc_info=True)
        raise
