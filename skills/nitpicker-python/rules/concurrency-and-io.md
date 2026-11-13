# Async code, logging, time, processes and secrets

Part of the [nitpicker-python](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Fan-out: bound concurrent remote or message calls. Hold an `asyncio.Semaphore` (or `anyio.CapacityLimiter`) around each call, or `gather` fixed-size chunks. Never `asyncio.gather(*(fetch(u) for u in urls))` over a runtime collection.
- Build a pydantic `TypeAdapter`, a jinja2 `Environment` or a `fastjsonschema.compile` validator once, at module level or in `__init__`, not inside a function that runs per call (`reusable-object-per-call`).
- Trio, AnyIO and `asyncio.TaskGroup`: open a resource around the whole task group or inside the
  child task, never in a `with` inside the group that hands it to `start_soon`/`create_task`
  (`task-outlives-resource`). In Trio and AnyIO, an `await` in `finally:` or a cancellation handler
  needs `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True):` around it (`unshielded-cleanup-await`).
- A `close`, `aclose`, `__exit__`, `__aexit__` or fixture teardown that releases several resources registers them on
  `contextlib.ExitStack` / `AsyncExitStack` (or `gather(..., return_exceptions=True)`, or `try`/`finally`), never
  `await a.aclose()` then `await b.aclose()` (`cleanup-skipped-on-failure`).
- Timeouts: every path through a `trio.fail_after`, `move_on_after`, `anyio.fail_after`,
  `asyncio.timeout` or `CancelScope(deadline=...)` block must reach a checkpoint. A branch that runs
  blocking or CPU work without an `await` cannot be interrupted: `await asyncio.to_thread(work)`
  (`trio.to_thread.run_sync`) or add `await asyncio.sleep(0)` first
  (`timeout-scope-path-without-checkpoint`).
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
- Let the database count, filter, sort and aggregate: `.count()`/`.exists()` instead of `len()` or a
  truth test on a queryset or `.all()` list, `.filter()`/`.where()` instead of a comprehension with an
  `if`, `any()` or `next()`, `.order_by()` instead of `sorted()`, and `.aggregate()`/`func.sum` instead
  of `sum()`, `max()` or `Counter` over the rows (`in-memory-query`).
- Index every foreign key in the migration that adds it (Alembic `op.create_index`, or `index=True` on
  the column), with an index or primary key that starts with the column. PostgreSQL does not create one
  (`foreign-key-index`).
- Join at most one collection into a query: `joinedload(Order.lines)` next to to-one relations, and
  `selectinload(Order.payments)` for the other collections (`multiple-collection-joins`).
- Index every foreign key: `index=True` on a SQLAlchemy `mapped_column(ForeignKey(...))` or SQLModel
  `Field(foreign_key=...)`, or an `Index` that starts with the column; never `db_index=False` on a Django
  `ForeignKey` without a `Meta.indexes` entry that starts with it (`unindexed-foreign-key`).
- Debugging and processes: remove debugger imports and breakpoints before committing. Pass
  `check=True` to `subprocess.run`, or `check=False` and handle `returncode`.
- A future that a callback completes also gets a failure path: `register(reply.set_result, reply.set_exception)`,
  or an `except` in the callback that calls `set_exception`; better, await `loop.run_in_executor(...)` or
  `asyncio.to_thread(...)`, which raise by themselves (`future-without-exception`).
- Child processes: give every wait a deadline: `subprocess.run(args, timeout=30, check=True)`,
  `process.communicate(timeout=30)`, and asyncio process waits inside `async with asyncio.timeout(30):`
  (`subprocess-without-timeout`; a build wrapper that only runs a child to completion takes an exception).
- Pages of rows: a query that takes a page (`limit`, `offset`, a queryset slice, SQL `LIMIT`) or builds an
  `array_agg`/`json_agg` list orders on a unique key: `select(User).order_by(User.created.desc(), User.id).limit(20)`,
  `Order.objects.order_by("-created", "id")[:20]`, `func.array_agg(aggregate_order_by(...))` (`unordered-query`).
- A list in `in_(...)` or `insert(...).values(rows)` has an empty check first and goes in fixed-size chunks
  (`for part in itertools.batched(ids, 1000):`), or goes as one array parameter; insert many rows with
  `session.execute(insert(User), rows)` (`unbounded-query-array`).
- Time units: name a time value with its unit (`timeout_ms`, `ttl_seconds`) and let it meet only the same
  unit: convert once where it enters (`ttl_seconds * 1000`, `time.time()` for JWT `exp`), pass seconds to
  `time.sleep` and `datetime.fromtimestamp`, and keep epoch times in an `int` or a `datetime`, never a
  32-bit `numpy.int32` (`time-unit-mismatch`).
- PostgreSQL connections get a statement timeout once, where they are made:
  `psycopg.connect(dsn, options="-c statement_timeout=30000")`, `asyncpg.create_pool(dsn, command_timeout=30)`,
  `create_engine(url, connect_args={"options": "-c statement_timeout=30000"})`, Django
  `"OPTIONS": {"options": "-c statement_timeout=30000"}` (`client-without-timeout`).
- Test an environment variable for a value, not for `None`: `if not os.environ.get("API_URL"):` and
  `os.environ.get("PORT") or "8000"`, never `is not None`, `in os.environ` or a `getenv` default; `API_URL=`
  gives `""`, which those count as set (`env-none-only-check`).
- Secrets: never put a secret in code (`password`, `token`, `api_key`, ... assigned a literal, also as the
  fallback of `os.getenv`); read it from the environment in the composition root. Never log, print,
  warn or raise with it: log that it is set (`token is not None`) or a masked tail.
