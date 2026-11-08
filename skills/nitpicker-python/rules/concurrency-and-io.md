# Async code, logging, time, processes and secrets

Part of the [nitpicker-python](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Fan-out: bound concurrent remote or message calls. Hold an `asyncio.Semaphore` (or `anyio.CapacityLimiter`) around each call, or `gather` fixed-size chunks. Never `asyncio.gather(*(fetch(u) for u in urls))` over a runtime collection.
- Trio, AnyIO and `asyncio.TaskGroup`: open a resource around the whole task group or inside the
  child task, never in a `with` inside the group that hands it to `start_soon`/`create_task`
  (`task-outlives-resource`). In Trio and AnyIO, an `await` in `finally:` or a cancellation handler
  needs `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True):` around it (`unshielded-cleanup-await`).
- Async: inside `async def`, `await asyncio.sleep(...)`, an async client (`httpx.AsyncClient`),
  `asyncio.create_subprocess_exec`, and `await asyncio.to_thread(...)` for other blocking calls. No
  `timeout` parameter: the caller wraps the call in `async with asyncio.timeout(...)`, and the scope
  holds an `await`. Wait on an `asyncio.Event`, not a sleep loop.
- Output: the project's logger (`logging.getLogger(__name__)`, structlog or loguru) for diagnostics,
  never bare `print`; a `domain` package returns a result instead and leaves logging to `adapters/`.
  A program's own output (what a command prints) goes through a `TextIO` parameter: `out.write(...)`
  or `print(..., file=out)`. Only the entry point (`main.py`, `cli.py`, a `[project.scripts]` target
  or the `if __name__ == "__main__":` block) names `sys.stdout` / `sys.stderr` and passes it in
  (`process-stream-access`). A log in an `except` keeps the traceback (`logger.exception(...)` or
  `exc_info=True`); passing the error as an argument or `str(error)` drops it. Logging alone is not
  handling: also re-raise the error or return a failure that carries it.
- Loggers: `logging.getLogger(__name__)`, never `logging.Logger(...)` or the root `logging.info(...)`;
  `logger.exception(...)` only inside an `except`, `logging.WARNING` rather than `WARN`.
- Time: aware datetimes only: `datetime(2026, 1, 1, tzinfo=timezone.utc)`,
  `datetime.now(tz=timezone.utc)`, `datetime.fromtimestamp(value, tz=timezone.utc)`. Parse with
  `%z`, `.replace(tzinfo=...)` for a known zone, or `date.fromisoformat(text)` for a date-only
  string. A date is `datetime.now(tz=zone).date()` in the zone it is meant in, not `date.today()`.
  Domain code takes the clock as a parameter; tests pass a fixed aware datetime or freeze the time.
- Debugging and processes: remove debugger imports and breakpoints before committing. Pass
  `check=True` to `subprocess.run`, or `check=False` and handle `returncode`.
- A future that a callback completes also gets a failure path: `register(reply.set_result, reply.set_exception)`,
  or an `except` in the callback that calls `set_exception`; better, await `loop.run_in_executor(...)` or
  `asyncio.to_thread(...)`, which raise by themselves (`future-without-exception`).
- Child processes: give every wait a deadline: `subprocess.run(args, timeout=30, check=True)`,
  `process.communicate(timeout=30)`, and asyncio process waits inside `async with asyncio.timeout(30):`
  (`subprocess-without-timeout`; a build wrapper that only runs a child to completion takes an exception).
- Secrets: never put a secret in code (`password`, `token`, `api_key`, ... assigned a literal, also as the
  fallback of `os.getenv`); read it from the environment in the composition root. Never log, print,
  warn or raise with it: log that it is set (`token is not None`) or a masked tail.
