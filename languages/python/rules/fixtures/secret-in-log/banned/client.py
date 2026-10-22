import logging

logger = logging.getLogger(__name__)


def connect(token):
    logger.info("connecting with %s", token)
