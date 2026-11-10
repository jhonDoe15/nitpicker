# Tests

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Every branch you add needs a test: changed-branch coverage and mutation testing run on your
  change. Test each outcome of each union.
- Keep an assertion unless another test covers the same behaviour.
- A test run that prints new `console.error` or `console.warn` output fails
  (`test-console-output`): cancel the timer or subscription in the cleanup.
- Test features through their `index.ts` with fakes: plain functions returning
  `Promise.resolve(x)` / `Promise.reject(error)`; a non-Error rejection is
  `vi.fn().mockRejectedValue(42)`, a non-Error throw is `const value: unknown = 7; throw value;`.
  Read a fake's calls through a helper that throws when the call is missing, not `calls[n]?.`. Spy on `process.stdout` only to test composition-root wiring,
  and give it a real temp file (`mkdtemp`) rather than `vi.mock` of `node:` modules. The gate
  restores spies; restore fake timers with `vi.useRealTimers()` in `afterEach`.
- Do not write `process.env.X = ...` or override `Date.now`, `Math.random` or `globalThis.fetch` in a test
  (`nitpicker/fake-timers-require-restore`): use `vi.stubEnv`, `vi.stubGlobal`, `vi.spyOn` or fake timers and
  restore them in `afterEach`, or put the old value back in `afterEach` or `finally`.
- Assert whole outputs with `toEqual`/`toBe`, not `toContain`, `toMatchObject` or `expect.any`.
  Write `expect` in the test body; asserting helpers don't count. Do not assert inside a loop,
  `forEach` or `map` callback: an empty collection passes without asserting, so assert the whole
  collection (`expect(orders).toEqual([...])`) and put cases in `it.each`
  (`nitpicker/no-assertion-in-loop`). The rules of the other pages (`for...of` only, no `.then()`, no `as`) apply
  to tests too.
- Assert the value, not that something is there (`nitpicker/no-weak-assertion`): no `not.toBe(null)`,
  `expect(x.length).toBeGreaterThan(0)`, `assert.ok(x.length)` or `toHaveBeenCalledWith(expect.anything())`
  as the whole check; assert the exact value, contents or length and the call's arguments. `assert(x != null)`
  is fine when the test then uses `x`.
- Tests assert exact values and are deterministic and fast; each finding names the allowed form.
- A shared helper (stdout capture) lives once, in a non-test file such as `test/support/stdout.ts`, or in a `test-support/` folder beside the code when the tests sit next to it.
  When an existing test defines the same helper, make it import the shared one.
- Test roots are `test/`, `tests/`, `__tests__/` and `e2e/` at the repo root. A Playwright or Cypress
  spec in `e2e/` imports no production code and is not mutated; a Jest `__tests__/` goes in `exclude`.
- A surviving mutant no input can kill means the code is redundant: delete or restructure it.
  Don't pin call order or messages just to kill it. If an input can kill it, add that test; never
  delete a schema rule to silence it.
- No per-test git repos, child processes, servers, fixed sleeps, raised timeouts, or test retries
  (`retry`/`retries` options, `jest.retryTimes`, `this.retries(n)`); fix the flaky cause.
- A test uses an imported constant by name (`MAX_LENGTH + 1`), never a copy of its value
  (`nitpicker/no-copied-constant`); pin a contract value as `expect(MAX_LENGTH).toBe(64)`.
- Wait for every callback that asserts: `await once(emitter, 'ready')`, await a promise the
  callback resolves, or advance fake timers in the test. An assertion in a timer, listener or
  error-first callback the test does not wait for runs after it ends and its failure is lost.
- Give synchronous `child_process` calls in integration tests and shared test helpers a positive
  subprocess `timeout`, such as `{ timeout: 10_000 }`. The runner's test timeout cannot interrupt
  `spawnSync`, `execSync` or `execFileSync` while they block the event loop.
- Plan tests to be fast (`slow-test`): a test you add or edit that takes over 5 s fails, over 30 s
  for an integration test (under an `integration`, `e2e` or `functional` folder, or named
  `*.integration.test.ts`, folders counted under the test roots). Use fake timers instead of waits
  and fakes instead of network or disk. A test over budget is run again alone without coverage and
  fails only if it is still over. A slow test you did not touch stays baselined.
