import logging

logger = logging.getLogger(__name__)


def load(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError as error:
        logger.error("cannot read %s", path, exc_info=error)
        raise
