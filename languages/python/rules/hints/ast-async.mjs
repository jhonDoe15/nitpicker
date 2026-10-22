import { RULES_TOOL } from './tool.mjs';

export const ASYNC_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['task-outlives-resource'],
    describe: (subject) =>
      `\`${subject}\`: the resource closes when its \`with\` block ends, while the child task can still use it`,
    allowed:
      'Put the `with` that opens the resource around the whole task group (`async with trio.open_nursery()` or `asyncio.TaskGroup()` inside it), or open the resource inside the child task, or await the task before the block ends. A value derived from the resource (`resource.name`, `stack.pop_all()`) is not reported.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unshielded-cleanup-await'],
    describe: (subject) =>
      `\`${subject}\` can be cancelled before the cleanup finishes, so the resource may stay open`,
    allowed:
      'Run the cleanup in a shielded scope with a deadline: `with trio.move_on_after(5, shield=True): await resource.aclose()` (`anyio.move_on_after(5, shield=True)` in AnyIO), or `await trio.aclose_forcefully(resource)` when graceful close is not needed. A shield without a deadline can hang shutdown.',
  },
];
