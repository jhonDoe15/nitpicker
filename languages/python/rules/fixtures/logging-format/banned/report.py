import logging

logger = logging.getLogger(__name__)


def report(name, count):
    logger.info("Loaded {}".format(count))
    logger.info("Loaded %s" % count)
    logger.info("Loaded " + name)
    logger.info(f"Loaded {count}")
