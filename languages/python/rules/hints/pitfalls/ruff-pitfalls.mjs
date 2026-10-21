export const PITFALL_HINTS = [
  {
    tool: 'ruff',
    rules: ['ASYNC'],
    prefix: true,
    allowed:
      'Use your async backend’s awaited APIs and caller-owned timeout scopes containing a checkpoint. Coordinate work with its Event primitive, use its checkpoint API for a yield, and sleep_forever for an indefinite wait; move blocking work to a worker thread.',
  },
  {
    tool: 'ruff',
    rules: ['DTZ'],
    prefix: true,
    allowed:
      'Use an aware datetime: `datetime.now(tz=timezone.utc)` or `datetime.fromtimestamp(value, tz=timezone.utc)`; derive a date from it with `.date()`. Parse an offset with `%z`, or attach the known source timezone before converting.',
  },
  {
    tool: 'ruff',
    rules: ['LOG'],
    prefix: true,
    allowed:
      'Create a named logger with `logging.getLogger(__name__)` and use `logger.warning(...)`. Use `logger.exception(...)` inside an active exception handler with its traceback enabled; outside a handler log without `exc_info`.',
  },
  {
    tool: 'ruff',
    rules: ['T100'],
    allowed: 'Remove the debugger import or breakpoint before committing; use the project logger.',
  },
  {
    tool: 'ruff',
    rules: ['PLE1205', 'PLE1206'],
    allowed:
      'Match each logging placeholder with one value: `logger.info("Loaded %s items", count)`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW1510'],
    allowed:
      'Pass `check=True` to raise on process failure, or explicitly pass `check=False` and handle the returned exit status.',
  },
];
