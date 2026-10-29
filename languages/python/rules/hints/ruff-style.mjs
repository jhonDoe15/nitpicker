const LOGGING_ADVICE = {
  logging: 'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.',
  structlog:
    'Use structlog: `log = structlog.get_logger()`, then `log.info("event_name", key=value)`.',
  loguru: 'Use loguru: `from loguru import logger`, then `logger.info(...)`.',
};
const LAZY_LOG_ADVICE = {
  logging:
    'Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.',
  structlog:
    'Keep the message constant and pass the data as key-value pairs: `log.info("items_loaded", count=count)`.',
  loguru:
    'Pass the values as arguments, not a formatted string: `logger.info("Loaded {} items", count)`.',
};
const REMOVE_ARGUMENT =
  'Remove the unused argument and update the callers. One that a signature requires (a callback, a hook) starts with an underscore, `_context`; a method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.';

function logging(advice) {
  return (_subject, libraries) => advice[libraries?.logging ?? 'logging'];
}

const PROGRAM_OUTPUT_ADVICE =
  'For program output, take a `TextIO` parameter and write with `out.write(...)` or `print(..., file=out)`; the entry point passes `sys.stdout`.';

function printAdvice(advice) {
  const diagnostics = logging(advice);
  return (subject, libraries) => `${diagnostics(subject, libraries)} ${PROGRAM_OUTPUT_ADVICE}`;
}

const NAMING_HINTS = [
  [['N801'], 'Name the class in `CapWords` (`OrderLine`), not `snake_case`.'],
  [
    ['N802', 'N803', 'N806', 'N807'],
    'Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.',
  ],
  [
    ['N804', 'N805'],
    'Name the first parameter `self` (`cls` in a classmethod, with `@classmethod`); SQLAlchemy `@declared_attr` and pydantic validators are already treated as class methods. Keep snake_case for the rest.',
  ],
  [
    ['N811', 'N812', 'N813', 'N814', 'N817'],
    'Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.',
  ],
  [
    ['N815', 'N816'],
    'Use snake_case for the name; in a pydantic model keep the Python name in snake_case and set the external name with `Field(alias="orderId")`.',
  ],
  [
    'N818',
    'Give an exception class the suffix `Error`: `OrderFailedError`; the rest of the name is `CapWords`, not snake_case.',
  ],
  ['N999', 'Name the module in lowercase snake_case, with no dashes or capitals.'],
].map(([rules, allowed]) => ({ tool: 'ruff', rules, allowed }));

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
  { tool: 'ruff', rules: ['T201', 'T203'], allowed: printAdvice(LOGGING_ADVICE) },
  {
    tool: 'ruff',
    rules: ['PERF203'],
    allowed: 'Move the `try` out of the loop, or handle each item in a helper function.',
  },
  {
    tool: 'ruff',
    rules: ['G001', 'G002', 'G003', 'G004'],
    allowed: logging(LAZY_LOG_ADVICE),
  },
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
  ...NAMING_HINTS,
  {
    tool: 'ruff',
    rules: ['PLR2004'],
    allowed:
      'Name the value as a constant: `MAX_RETRIES = 3`, then compare with `MAX_RETRIES`; compare an HTTP status with a member of `http.HTTPStatus` (`HTTPStatus.NOT_FOUND`). -1, 0, 1, 2, 10, 100 and 1000 are allowed.',
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
    allowed:
      'Delete the commented-out code; version control keeps the history. A comment that explains something is written as prose (`Raises: ValueError` and `e.g.` lines are allowed).',
  },
  {
    tool: 'ruff',
    rules: ['ARG001', 'ARG002', 'ARG003', 'ARG004', 'ARG005'],
    allowed: REMOVE_ARGUMENT,
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
    allowed:
      'Inside an `except` block call `logger.exception(...)`, which logs the traceback, or `logger.warning(...)` for an error the code expects and handles.',
  },
  {
    tool: 'ruff',
    rules: ['TRY401'],
    allowed:
      'Leave the exception out of the message; `logger.exception("Could not load %s", name)` already logs it.',
  },
];
