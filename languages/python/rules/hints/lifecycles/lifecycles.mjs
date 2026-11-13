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
];
