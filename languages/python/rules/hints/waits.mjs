import { RULES_TOOL } from './tool.mjs';

export const WAIT_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['timeout-abandons-operation'],
    describe: (subject) =>
      subject.startsWith('asyncio.wait_for(')
        ? `\`${subject}\` gives up after the timeout, but the shielded task keeps running and nothing cancels or awaits it`
        : `\`${subject}\` returns when its timeout passes, but the \`pending\` tasks keep running: the set is neither cancelled, awaited nor handed to an owner`,
    allowed:
      'Cancel what is pending (`for task in pending: task.cancel()`, then `await asyncio.gather(*pending, return_exceptions=True)`), or hand the set to an owner that does. Prefer `asyncio.wait_for(task, timeout)` or `async with asyncio.timeout(seconds):`, which cancel on timeout, or a `TaskGroup`; after a shielded wait, cancel or await the task in the timeout path. Trio and AnyIO cancel scopes already cancel.',
  },
];
