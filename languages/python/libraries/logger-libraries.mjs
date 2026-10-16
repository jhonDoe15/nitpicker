export const STDLIB_LOGGER = {
  id: 'logging',
  packages: [],
  setup: 'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.',
  caught:
    'Keep the traceback: `logger.exception("message")` or `logger.error("message", exc_info=True)`; the exception as an argument drops it. Re-raising after the log also passes.',
};

export const LOGGER_LIBRARIES = [
  {
    id: 'structlog',
    packages: ['structlog'],
    setup:
      'Use `structlog`: `logger = structlog.get_logger()`, then `logger.info("event", key=value)`.',
    caught:
      'Keep the traceback: `logger.exception("event")` or `logger.error("event", exc_info=True)`; the exception as a field drops it. Re-raising after the log also passes.',
  },
  {
    id: 'loguru',
    packages: ['loguru'],
    setup: 'Use `loguru`: `from loguru import logger`, then `logger.info(...)`.',
    caught:
      'Keep the traceback: `logger.exception("message")` or `logger.opt(exception=True).error("message")`; the exception as an argument drops it. Re-raising after the log also passes.',
  },
];
