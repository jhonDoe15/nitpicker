# Cancellation propagation

Part of the [Python preset guide](../python-preset.md).

`python-rules/cancellation-not-propagated` rejects an explicit cancellation handler with a modeled
path that returns, breaks, continues, falls through, or raises a different error. Cleanup and
logging do not replace propagation: use a bare `raise`, or re-raise the unchanged caught exception
(`raise error`, including `error.with_traceback(...)`). Returning a failure result containing the
error or chaining a different exception still consumes the cancellation signal.

The owned AST check recognizes imported `asyncio.CancelledError` (including
`asyncio.exceptions.CancelledError`), `trio.Cancelled` and `anyio.get_cancelled_exc_class()` in
handler types, including import aliases, tuples, and names bound once by a plain assignment
(`E = asyncio.CancelledError`, `cancelled = anyio.get_cancelled_exc_class()`). Shadowed imports and
local modules with those names are not assumed to be backend APIs. `concurrent.futures.CancelledError`
is a different class from `asyncio.CancelledError` (since Python 3.8) and is not matched. Only
handlers lexically inside an `async def` are checked: a plain function or a done-callback
(`def done(fut): try: fut.result() except CancelledError: return`) keeps the `swallowed-exception`
behavior it had before, and so does a handler in an `except*` block. Source files, tests and entry
points use the same rule; generated/excluded files follow the existing source policy. A matching
handler receives this finding instead of a duplicate `swallowed-exception` or
`catch-log-without-exception` finding. Ordinary errors retain their existing handling policy. The
same rule applies to `contextlib.suppress(...)` with a cancellation class in `async def`, which
consumes the cancellation exactly like an empty handler (subject `suppress(asyncio.CancelledError)`).

Backend boundaries remain explicit. Raising a fresh asyncio `CancelledError` preserves its
cancellation signal and is allowed; this does not establish preservation of its payload. Trio and
AnyIO handlers should re-raise the original cancellation. Normal exits from `move_on_after`,
`CancelScope` or `asyncio.timeout` are intentional scoped boundaries and are not handlers targeted
by this rule. Deliberate asyncio suppression with `Task.uncancel()` is not inferred from a method
name: review that boundary with a `python.exceptions` entry for `cancellation-not-propagated`,
paths and a reason. No inline suppression is added.

The path model covers straight-line handlers, `if` branches (including literal constant branches),
`for`, `async for` and `while` loops (with `break`, `continue` and `else`), `match` statements and
`try/finally` completion overrides. A loop that can end without running a `raise` leaves a falling
path, and a `break` or `continue` that leaves the handler itself consumes the cancellation. A
`match` without a catch-all case, a nested `try/except`, `except*` and a `with` around a `raise`
(a context manager can suppress it) may or may not fall through: the statements after them are
still analysed, so a later `return` or `raise ValueError()` is reported, while a handler that ends
there is not reported on that evidence alone and a later `raise` is accepted. The check does not
resolve arbitrary helper implementations, `NoReturn` annotations, runtime monkey patches, broad
`BaseException` handlers or exception groups. It is a focused source guard, not a proof of
cancellation safety. Ordinary calls are assumed able to return; helper-based propagation should
re-raise explicitly in the handler or use a reviewed exception. A handler that deliberately
translates a cancellation it started itself (a hand-written timeout, or a deferred re-raise after
a loop) also needs that reviewed exception.

Awaiting a task this function cancelled is the documented way to wait for a child to stop, and the
`CancelledError` it raises belongs to the child. A `try` (or a `with contextlib.suppress(...)`)
whose body only awaits tasks, each cancelled earlier by a statement that always runs before it in
the same function, is therefore accepted when every caught type is an asyncio cancellation and the
handler body is quiet (`pass`, `...`, a bare `return` or a log call). The awaited task is a name or
attribute chain (`await task`, `result = await self._task`), or `asyncio.gather(...)` of such
names or of `*tasks` after `for t in tasks: t.cancel()`; the cancel is `name.cancel()` as a
statement of an enclosing block, not inside an `if`, and the name must not be rebound in between.
Such a handler is skipped entirely, so no `swallowed-exception`, `catch-log-without-exception` or
other handler check applies to it. A handler that does more (`return 5`, `raise RuntimeError()`),
a mixed tuple such as `(asyncio.CancelledError, Exception)`, or an await of anything else is still
reported. This asyncio-only allowance cannot tell the child's cancellation from one aimed at the
current task; Trio and AnyIO handlers have no such allowance.

Ruff **0.16.8** (pinned for the Python end-to-end suite in `.github/python-e2e-constraints.txt`;
0.16.9 was checked as well) has no ASYNC102, ASYNC103, ASYNC104 or ASYNC111; its `ASYNC` family
contains only the codes listed in `ruff rule --all`, none of which checks cancellation propagation,
so nothing is duplicated by the Ruff `ASYNC` selection. Two other Ruff rules can fire on the same
handler for a different reason and keep their own identity: `TRY203` (a handler that only
re-raises is pointless) and `B904` (`raise ValueError()` inside an `except` without `from`). The
documented flake8-async ASYNC103/104 behaviors motivated this narrower owned check; no flake8-async
dependency or source implementation is used. Existing AST parsing, findings, line-independent
identities, configuration hashing and path exceptions supply the integration. Regression fixtures
execute actual asyncio task cancellation and statically exercise the explicit Trio/AnyIO forms;
they do not establish measured precision over a real-project corpus or execute those third-party
backends.
