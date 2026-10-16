export const STDLIB_LOGGER = {
  id: 'logging',
  packages: [],
  setup: 'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.',
  caught:
    'Pass the caught exception to the logger: `logger.exception("message")`, or `logger.error("message", exc_info=True)`.',
};

export const LOGGER_LIBRARIES = [
  {
    id: 'structlog',
    packages: ['structlog'],
    setup:
      'Use `structlog`: `logger = structlog.get_logger()`, then `logger.info("event", key=value)`.',
    caught:
      'Pass the caught exception to the logger: `logger.exception("event")`, or `logger.error("event", exc_info=True)`.',
  },
  {
    id: 'loguru',
    packages: ['loguru'],
    setup: 'Use `loguru`: `from loguru import logger`, then `logger.info(...)`.',
    caught:
      'Pass the caught exception to the logger: `logger.exception("message")`, or `logger.opt(exception=error).error("message")`.',
  },
];
