import logging

logger = logging.getLogger(__name__)


def run(task):
    logger.warning("slow")
    logger.info("started", extra={"task_name": task})
    try:
        task()
    except ValueError:
        logger.exception("failed")
        raise
