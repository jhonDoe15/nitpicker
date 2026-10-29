import { RULES_TOOL } from './tool.mjs';

const SEPARATOR = ': ';

function parts(subject = '') {
  const index = subject.indexOf(SEPARATOR);
  return index === -1
    ? { scope: subject, call: '' }
    : { scope: subject.slice(0, index), call: subject.slice(index + SEPARATOR.length) };
}

export const CHECKPOINT_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['timeout-scope-path-without-checkpoint'],
    describe: (subject) => {
      const { scope, call } = parts(subject);
      return `\`${scope}\` has a path that runs \`${call}\` without reaching a checkpoint (an \`await\` that suspends, \`async with\` or \`async for\`), so its timeout or cancellation cannot interrupt that path`;
    },
    allowed:
      'Reach a checkpoint on every path through the scope: await the slow work (`await asyncio.to_thread(work)`, `await trio.to_thread.run_sync(work)`, `await anyio.to_thread.run_sync(work)`), or add an explicit checkpoint before it (`await asyncio.sleep(0)`, `await trio.lowlevel.checkpoint()`, `await anyio.lowlevel.checkpoint()`), or move the checkpoint-free path out of the scope. A scope with no checkpoint at all is reported by Ruff ASYNC100.',
  },
];
