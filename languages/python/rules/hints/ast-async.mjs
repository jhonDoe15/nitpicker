import { RULES_TOOL } from './tool.mjs';

const TASK_HANDLE = /passed to (asyncio\.)?(create_task|ensure_future)\b/u;
const SHIELDED_WAIT = 'asyncio.wait_for(';
const RETURN_WHEN = /return_when=(\w+)/u;

function waitReturn(subject) {
  const first = RETURN_WHEN.exec(subject)?.[1];
  const finished = first === 'FIRST_EXCEPTION' ? 'a task raises' : 'the first task finishes';
  if (!subject.includes('timeout=')) {
    return `as soon as ${finished}`;
  }
  return first === undefined ? 'when its timeout passes' : `when its timeout passes or ${finished}`;
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
    rules: ['timeout-abandons-operation'],
    describe: (subject) =>
      subject.startsWith(SHIELDED_WAIT)
        ? `\`${subject}\` gives up after the timeout, but the shield keeps the task running and nothing cancels or awaits it afterwards`
        : `\`${subject}\` returns ${waitReturn(subject)}, but the tasks still pending keep running: nothing cancels, awaits or hands them on`,
    allowed: (subject = '') =>
      subject.startsWith(SHIELDED_WAIT)
        ? 'Cancel or await the task in the timeout path (`except asyncio.TimeoutError: task.cancel(); raise`), or drop the shield so `asyncio.wait_for` (or `async with asyncio.timeout(seconds):`) cancels the work on timeout.'
        : 'Cancel what is still pending (`for task in pending: task.cancel()`, then `await asyncio.gather(*pending, return_exceptions=True)`) or hand the set to an owner that does; or bound the work with `asyncio.wait_for(task, timeout)`, `async with asyncio.timeout(seconds):` or a `TaskGroup`, which cancel it.',
  },
];
