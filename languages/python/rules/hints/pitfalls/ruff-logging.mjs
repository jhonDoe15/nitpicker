export const LOGGING_HINTS = [
  {
    tool: 'ruff',
    rules: ['LOG001'],
    allowed: 'Create the logger with `logging.getLogger(__name__)`.',
  },
  {
    tool: 'ruff',
    rules: ['LOG002'],
    allowed:
      'Name the logger after the module: `logging.getLogger(__name__)`, not `__file__` or `__cached__`.',
  },
  {
    tool: 'ruff',
    rules: ['LOG004', 'LOG014'],
    allowed:
      'Log a traceback only inside an `except` handler (`logger.exception(...)`); outside one, call `logger.error(...)` without `exc_info`.',
  },
  {
    tool: 'ruff',
    rules: ['LOG007'],
    allowed:
      'Drop `exc_info=False` from `logger.exception(...)`, or call `logger.error(...)` when the traceback is not wanted.',
  },
  {
    tool: 'ruff',
    rules: ['LOG009'],
    allowed: 'Use `logging.WARNING`; `logging.WARN` is an undocumented alias.',
  },
  {
    tool: 'ruff',
    rules: ['LOG015'],
    allowed:
      'Log through a module logger: `logger = logging.getLogger(__name__)`, then `logger.info(...)` (`logger.warning(...)` in place of `warn`).',
  },
];
