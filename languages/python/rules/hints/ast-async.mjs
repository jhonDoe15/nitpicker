import { RULES_TOOL } from './tool.mjs';

const TASK_HANDLE = /passed to (asyncio\.)?(create_task|ensure_future)\b/u;
const SEPARATOR = ': ';

function parts(subject = '') {
  const index = subject.indexOf(SEPARATOR);
  return index === -1
    ? { scope: subject, call: '' }
    : { scope: subject.slice(0, index), call: subject.slice(index + SEPARATOR.length) };
}

export const ASYNC_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['task-outlives-resource'],
    describe: (subject) =>
      `\`${subject}\`: the resource closes when its \`with\` block ends, while the child task can still use it`,
    allowed: (subject = '') =>
      TASK_HANDLE.test(subject)
        ? 'Open the resource around the whole task group, or inside the child task, or await the task before the block ends.'
        : 'Open the resource around the whole task group, or inside the child task.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unshielded-cleanup-await'],
    describe: (subject) =>
      `\`${subject}\` can be cancelled before the cleanup finishes, so the resource may stay open`,
    allowed:
      'Run the cleanup in a shielded scope with a deadline: `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True): await resource.aclose()` (`anyio.CancelScope(deadline=anyio.current_time() + 5, shield=True)` in AnyIO; `move_on_after(5, shield=True)` needs Trio 0.27 or later). A shield without a deadline can hang shutdown.',
  },
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
