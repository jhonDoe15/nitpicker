import logging

logger = logging.getLogger(__name__)


def parse(text: str) -> None:
    try:
        int(text)
    except ValueError:
        logger.exception("not a number")
