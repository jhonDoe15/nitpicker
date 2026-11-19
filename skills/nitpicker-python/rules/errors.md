# Errors and cancellation

Part of the [nitpicker-python](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Errors: catch the specific exception and handle it, or re-raise it with its cause:
  `raise ParseError(text) from err`. No bare `except:` or `except Exception:`, and no `raise Exception(...)`.
- An `except` around `json.loads` or `request.json()` catches the base `ValueError`, not `JSONDecodeError`
  alone; one around `timedelta(**value)` built from input lists `OverflowError` too
  (`except-misses-raised-exception`).
- Timeouts: `asyncio.wait(tasks, timeout=...)` (or `return_when=FIRST_COMPLETED`) leaves its
  pending tasks running. Cancel them (`for task in pending: task.cancel()`) or hand them to an owner;
  prefer `asyncio.wait_for`, `asyncio.timeout` or a `TaskGroup`, which cancel. A shielded `wait_for` needs the task cancelled or awaited after the
  timeout (`timeout-abandons-operation`).
- Shared state across `await`: do not update `self.x`, a `global` name or a module container from a
  value read before the `await` (`self.total += await fetch()`), also through a local that holds the
  read. Await into a local first (`delta = await fetch()`, then `self.total += delta`), or hold one
  `asyncio.Lock` built once in `__init__` or at module or class level around the whole
  read-modify-write; a lock built in the method or a semaphore of more than one slot is not proof
  (`atomic-update-across-await`).
- Cancellation: after cleanup in an explicit asyncio, Trio or AnyIO cancellation handler, use
  a bare `raise` or re-raise the unchanged caught exception. Returning a failure result or raising
  a different error consumes cancellation (`cancellation-not-propagated`). Keep intentional
  cancellation boundaries in the backend's timeout or cancellation scope. Awaiting a task you
  cancelled yourself (`task.cancel()` then `await task`) is the one handler that may stay quiet.
- A project exception a FastAPI route can raise maps to a status: derive it from `HTTPException`
  or register `@app.exception_handler(OrderNotFound)` (`unmapped-exception`).
- A `try` inside a loop is flagged (PERF203): move it out, or extract the loop body into a function.
- Messages are formatted before they are raised or logged: `raise ValueError(f"path {path} not found")`, never
  `"path {path} ..."` without the `f` (`unformatted-message-placeholder`) or
  `ValueError("path %s not found", path)`, which keeps a tuple (`exception-format-arguments`).
- Translate first, format second, with the names the text has: `_("Visit {location}").format(location=place)`;
  never `_("...".format(...))` or `_(f"...")` (ruff `INT001`-`INT003`), and no `format_map` or keyword that
  the placeholder does not have (`gettext-format-mismatch`).
- Text from a search or filter field (a FastAPI `str` parameter, `request.args`, `request.GET`) is stripped before
  it reaches a lookup: `name = name.strip()`, or a pydantic request model whose base sets
  `ConfigDict(str_strip_whitespace=True)`; a padded `" Davis"` finds nothing (`untrimmed-request-text`).
- `min(xs)`, `max(xs)` and `xs[0]` or `xs[-1]` on a list that a filtered comprehension, `filter(...)`, a
  queryset or a query function produced raise on an empty sequence: pass `default=`, check `if xs:` first, or
  use `next(iter(xs), None)` or `qs.first()` (`empty-sequence-access`).
- A duration is `(now - start).total_seconds()`; `.seconds` is only the 0 to 86399 part of a `timedelta` and
  ignores its days (`timedelta-seconds-as-total`).
- A one-element tuple has a comma: `args=(pk,)`, `cursor.execute(sql, (value,))`, `(Cls, (self.message,))` in
  `__reduce__`; `(pk)` is the bare value (`parenthesised-tuple-argument`). Pass a log or exception message as
  the format and its values (`logger.info("Processing %s", item)`), never as one tuple
  (`message-tuple-argument`).
