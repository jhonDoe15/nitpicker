import { RULES_TOOL } from '../tool.mjs';

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
];
