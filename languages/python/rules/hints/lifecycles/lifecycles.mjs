import { RULES_TOOL } from '../tool.mjs';

export const LIFECYCLE_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['cleanup-skipped-on-failure'],
    describe: (subject) =>
      subject.includes('gather over releases')
        ? `\`${subject}\` rejects at the first failure and leaves the other releases unobserved, so their errors are lost`
        : `\`${subject}\`: when the first release raises, the later steps never run, so a connection stays open and the state is not reset`,
    allowed:
      'Register every release on `contextlib.ExitStack` or `AsyncExitStack` (`stack.callback(x.close)`, `await stack.enter_async_context(...)`), or `await asyncio.gather(..., return_exceptions=True)` and raise the first failure, or `try:` with the reset in `finally:`. An exception fits only when a failed release should abort the remaining ones.',
  },
  {
    tool: RULES_TOOL,
    rules: ['pending-unsettled-on-close'],
    describe: (subject) =>
      `\`${subject}()\` clears the futures kept for pending requests without failing them, so every caller still awaiting one waits forever`,
    allowed:
      'In the close method, fail every pending future and then clear the dict: `for future in self._pending.values(): future.set_exception(ConnectionError("closed"))` (or `future.cancel()`), or hand the dict to a helper that does. An exception fits only when the futures are failed elsewhere before the object closes.',
  },
  {
    tool: RULES_TOOL,
    rules: ['handle-unreleased-on-close'],
    describe: (subject) =>
      `\`${subject}\` registers a timer, callback or signal handler that the close method never cancels, so it fires after close and registrations pile up on each start`,
    allowed:
      'Keep the handle (`self._handle = loop.call_later(...)`) and call `self._handle.cancel()` in the close method, remove a signal handler with `loop.remove_signal_handler(...)` there, or stop a `threading.Timer` with `cancel()`. An exception fits only when the timer or handler dies with this object.',
  },
  {
    tool: RULES_TOOL,
    rules: ['cached-rejection'],
    describe: (subject) =>
      subject.includes('functools cache')
        ? `\`${subject}\`: the cache stores the coroutine object, so the second call awaits an already awaited coroutine and raises`
        : `\`${subject}\`: a cached task or future keeps its failure, so every later call replays it instead of trying again`,
    allowed:
      'Store the task, then clear the attribute in an `except` only while it still holds this attempt: `attempt = asyncio.ensure_future(self._open()); self._connection = attempt; try: return await attempt; except Exception: if self._connection is attempt: self._connection = None; raise`. Cache an async result by awaiting first (`self._value = await load()`), not with `functools.cache`. An exception fits only when keeping the first failure is intended (a startup-only cache).',
  },
  {
    tool: RULES_TOOL,
    rules: ['unbounded-collection'],
    describe: (subject) =>
      `\`${subject}()\` adds to a long-lived collection that nothing removes from or bounds, so memory grows for the life of the process`,
    allowed:
      'Remove the entry when its request, session or run ends (`self._sessions.pop(session_id, None)` in a `finally` or the close method), bound the collection (`if len(self._cache) >= limit: ...` before the add, `collections.deque(maxlen=...)` or an LRU cache), or key a `weakref.WeakKeyDictionary` by the object. A registry filled at startup (literal keys, or an `__init__`, `init` or `register` method) is skipped. An exception fits only when the keys are a fixed finite set.',
  },
];
