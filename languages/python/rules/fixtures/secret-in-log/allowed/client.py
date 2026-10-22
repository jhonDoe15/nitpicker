import logging

logger = logging.getLogger(__name__)


def connect(token: str | None) -> None:
    logger.info("connecting, token set: %s", token is not None)
