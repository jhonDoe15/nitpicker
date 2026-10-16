import logging

logger = logging.getLogger(__name__)


def is_number(text: str) -> bool:
    try:
        int(text)
    except ValueError as error:
        logger.debug("not a number: %s", error)
        return False
    return True
