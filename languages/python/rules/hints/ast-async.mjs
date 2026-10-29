import { RULES_TOOL } from './tool.mjs';

const TASK_HANDLE = /passed to (asyncio\.)?(create_task|ensure_future)\b/u;

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
    rules: ['timeout-abandons-operation'],
    describe: (subject) =>
      subject.startsWith('asyncio.wait_for(')
        ? `\`${subject}\` gives up after the timeout, but the shielded task keeps running and nothing cancels or awaits it`
        : `\`${subject}\` returns when its timeout passes, but the \`pending\` tasks keep running: the set is neither cancelled, awaited nor handed to an owner`,
    allowed:
      'Cancel what is pending (`for task in pending: task.cancel()`, then `await asyncio.gather(*pending, return_exceptions=True)`), or hand the set to an owner that does. Prefer `asyncio.wait_for(task, timeout)` or `async with asyncio.timeout(seconds):`, which cancel on timeout, or a `TaskGroup`; after a shielded wait, cancel or await the task in the timeout path. Trio and AnyIO cancel scopes already cancel.',
  },
];
