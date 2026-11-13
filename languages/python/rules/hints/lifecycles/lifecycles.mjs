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
];
