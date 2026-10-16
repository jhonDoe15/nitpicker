const LOGGING = 'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.';
const LAZY_LOG_ARGUMENTS =
  'Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.';
const REMOVE_ARGUMENT =
  'Remove the unused argument, or prefix its name with an underscore when a framework or base class fixes the signature.';

export const STYLE_HINTS = [
  {
    tool: 'ruff',
    rules: ['PTH'],
    prefix: true,
    allowed: 'Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.',
  },
  {
    tool: 'ruff',
    rules: ['UP031', 'UP032', 'FLY002'],
    allowed: 'Use an f-string: `f"Hello, {name}"`.',
  },
  {
    tool: 'ruff',
    rules: ['B006'],
    allowed:
      'Default to `None` and create the value inside the function, or use an immutable default such as a tuple.',
  },
  {
    tool: 'ruff',
    rules: ['F403'],
    allowed: 'Import the names you use: `from module import name`.',
  },
  { tool: 'ruff', rules: ['T201', 'T203'], allowed: LOGGING },
  {
    tool: 'ruff',
    rules: ['PERF203'],
    allowed: 'Move the `try` out of the loop, or handle each item in a helper function.',
  },
  { tool: 'ruff', rules: ['G001', 'G002', 'G003', 'G004'], allowed: LAZY_LOG_ARGUMENTS },
  {
    tool: 'ruff',
    rules: ['G010'],
    allowed: 'Call `logger.warning(...)`; `logger.warn` is deprecated.',
  },
  {
    tool: 'ruff',
    rules: ['G101'],
    allowed:
      'Rename the key in `extra` so it does not clash with a log record attribute: `extra={"user_name": name}`.',
  },
  {
    tool: 'ruff',
    rules: ['G201'],
    allowed: 'Inside an `except` block call `logger.exception(...)`, which logs the traceback.',
  },
  {
    tool: 'ruff',
    rules: ['G202'],
    allowed: 'Drop `exc_info=True`; `logger.exception(...)` already logs the traceback.',
  },
  {
    tool: 'ruff',
    rules: ['N'],
    prefix: true,
    allowed:
      'Follow PEP 8 naming: `CapWords` for classes, `snake_case` for functions, arguments, variables and modules, `UPPER_SNAKE_CASE` for constants, and an `Error` suffix for exceptions.',
  },
  {
    tool: 'ruff',
    rules: ['PLR2004'],
    allowed:
      'Name the value as a constant: `MAX_RETRIES = 3`, then compare with `MAX_RETRIES`. -1, 0, 1, 2, 10, 100 and 1000 are allowed.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0602'],
    allowed: 'Remove the `global` statement; a function reads a module name without declaring it.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0603'],
    allowed:
      'Do not rebind a module name: pass the state in and return the new value, hold it in an object created in the composition root, or use `functools.cache` for a value created on first use.',
  },
  {
    tool: 'ruff',
    rules: ['ERA001'],
    allowed: 'Delete the commented-out code; version control keeps the history.',
  },
  {
    tool: 'ruff',
    rules: ['ARG001', 'ARG002', 'ARG003', 'ARG004', 'ARG005'],
    allowed: REMOVE_ARGUMENT,
  },
  {
    tool: 'ruff',
    rules: ['FBT001', 'FBT002'],
    allowed:
      'Make the flag keyword-only, `def send(message, *, urgent=False)`, or split the function into two named for each behavior.',
  },
  {
    tool: 'ruff',
    rules: ['TRY002'],
    allowed:
      'Raise a specific exception: a built-in such as `ValueError`, or a subclass named for the failure (`class OrderNotFoundError(Exception)`).',
  },
  {
    tool: 'ruff',
    rules: ['TRY004'],
    allowed: 'Raise `TypeError` when the check is about the type of a value.',
  },
  {
    tool: 'ruff',
    rules: ['TRY201'],
    allowed: 'Re-raise with a bare `raise`, which keeps the traceback.',
  },
  {
    tool: 'ruff',
    rules: ['TRY203'],
    allowed: 'Remove the `try`; a handler that only re-raises changes nothing.',
  },
  {
    tool: 'ruff',
    rules: ['TRY400'],
    allowed: 'Inside an `except` block call `logger.exception(...)`, which logs the traceback.',
  },
  {
    tool: 'ruff',
    rules: ['TRY401'],
    allowed:
      'Leave the exception out of the message; `logger.exception("Could not load %s", name)` already logs it.',
  },
];
