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
    rules: ['lock-order-inversion'],
    describe: (subject) =>
      `${subject}: two threads or tasks that run both can each hold one lock and wait forever for the other, a deadlock that no test reliably shows`,
    allowed:
      'Take nested locks in one order everywhere in the class (if any path takes `self.a` and then `self.b`, no path takes `self.b` and then `self.a`), or guard the state with one lock. Only locks held in attributes of the class or the module (`self.lock`, `Registry.LOCK`) and built there from `threading.Lock`, `threading.RLock`, `threading.Condition`, a one-slot `threading.Semaphore` or an `asyncio`, AnyIO or Trio lock are compared; a lock passed in, held in a local or taken in a called method is not followed.',
  },
  {
    tool: RULES_TOOL,
    rules: ['inconsistent-attribute-locking'],
    describe: (subject) =>
      `${subject}: a thread or task that writes here races with the locked writer, so an update is lost or another reader sees a stale value`,
    allowed:
      'Hold the same lock for every write of the attribute (`with self.lock:` or `async with self.lock:`), or keep the state where only the lock holder changes it (a method that takes the lock and returns the new value). `__init__`, `__new__`, `__post_init__`, a write in a nested function or lambda, and a method the class calls while it holds a lock are not reported.',
  },
];
