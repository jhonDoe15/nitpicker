# Tests

Part of the [nitpicker-javascript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Tests are files in `test/` run by the runner the project uses, found from its `test` script, a
  runner config file or a dependency (Vitest, Jest, `node:test` or Mocha; the examples below are
  Vitest). Name them the way that runner finds them (see the naming below). In a Vitest
  project a test file must `import` from `'vitest'`: `require('vitest')` fails, so a test is ESM
  even when the code it tests is CommonJS:
  `import { initials } from '../src/main/features/greeting/domain/initials.cjs';`.
- Every branch you add needs a test: changed-branch coverage and mutation testing run on your
  change. Test each outcome of each union.
- Keep an assertion unless another test covers the same behaviour.
- A test run that prints new `console.error` or `console.warn` output fails
  (`test-console-output`): cancel the timer or subscription in the cleanup.
- Test features through their `index.js` with fakes: plain functions returning
  `Promise.resolve(x)` / `Promise.reject(error)`; a non-Error rejection is
  `vi.fn().mockRejectedValue(42)` (`jest.fn()` under Jest, `mock.fn(async () => { throw 42; })`
  under `node:test`, `sinon.stub().rejects(42)` under Mocha with sinon). Read a fake's calls
  through a helper that throws when the call is missing, not `calls[n]?.`. Spy on `process.stdout` only to test composition-root wiring, and give it a real temp
  file (`mkdtemp`) rather than `vi.mock` of `node:` modules (`jest.mock`, `mock.module`,
  `proxyquire`, `esmock` and the other runners' module mocks count too). After each test the gate
  restores spies and stubs: Vitest's and Jest's mocks, and, under `node:test` and Mocha, the
  doubles the test and its `beforeEach` hooks made with the shared `node:test` `mock` or with
  sinon; a double a `before` hook made stays until your
  `after` hook restores it (`mock.restoreAll()`, `sinon.restore()`). Restore fake timers
  yourself in `afterEach`: `vi.useRealTimers()` (`jest.useRealTimers()`, `mock.timers.reset()`,
  `clock.restore()`).
- Do not write `process.env.X = ...` or override `Date.now`, `Math.random` or `globalThis.fetch` in a test
  (`nitpicker/fake-timers-require-restore`): use `vi.stubEnv`, `vi.stubGlobal`, `vi.spyOn` or fake timers and
  restore them in `afterEach`, or put the old value back in `afterEach` or `finally`.
- Test data typed from a literal widens (`status: string`): write the array as
  `/** @type {const} */ ([...])`, or annotate the `const` with the typedef.
- Assert whole outputs with `toEqual`/`toBe` (`assert.deepStrictEqual`/`assert.equal`, chai's
  `expect(x).to.deep.equal`), not `toContain`, `toMatchObject` or `expect.any` (nor
  `assert.ok(text.includes('x'))`, `assert.partialDeepStrictEqual` or chai's `include` and
  `containSubset`). Write the assertion (`expect`, or `assert` under `node:test` and Mocha) in the
  test body; asserting helpers don't count. Do not assert inside a loop, `forEach` or `map`
  callback: an empty collection passes without asserting, so assert the whole collection
  (`expect(orders).toEqual([...])`) and put cases in `it.each`; `node:test` and Mocha have no
  `it.each`, so there write `for (const testCase of cases) { it(testCase.name, () => { ... }); }`
  (`nitpicker/no-assertion-in-loop`). Shared setup goes in `beforeAll` (`before` under `node:test`
  and Mocha). The rules of the other pages (`for...of` only, no `.then()`, no casts) apply to tests
  too.
- Assert the value, not that something is there (`nitpicker/no-weak-assertion`): no `not.toBe(null)`,
  `expect(x.length).toBeGreaterThan(0)`, `assert.ok(x.length)` or `toHaveBeenCalledWith(expect.anything())`
  as the whole check; assert the exact value, contents or length and the call's arguments. `assert(x != null)`
  is fine when the test then uses `x`.
- Tests assert exact values and are deterministic and fast; each finding names the allowed form.
- A shared helper (stdout capture) lives once, in a file the runner does not run as a test, such as
  `test/support/lines.js` or a `test-support/` folder beside the code when the tests sit next to it (under `node:test` with Node's default patterns every file in `test/` is
  a test: put the helper in `tests/support/`, or name the tests in the script, such as
  `node --test 'test/**/*.test.js'`). When an existing test defines the same helper, make it import
  the shared one.
- Name test files the way the runner finds them; the gate reads the same patterns. Vitest:
  `*.test.{ext}` or `*.spec.{ext}` (plus the config's `test.include`). Jest: `*.test.{ext}`,
  `*.spec.{ext}` or any file under `__tests__/`, or the config's `testMatch`/`testRegex`, read through
  the test script (`react-scripts`, `craco`, `react-app-rewired` and `rescripts test` included),
  under each project's `roots`, leaving out projects whose `runner` lints or type-checks instead of
  running tests. `node:test`: the patterns the
  `node --test` script names, else Node's defaults (`*.test.*`, `*-test.*`, `*_test.*`, `test-*.*`,
  `test.*` and every file under a `test/` folder). Mocha: its spec (`test/*.{js,cjs,mjs}` by default,
  or the spec in `.mocharc.*` or the script). A file that matches is a test wherever it sits, even in
  `domain/`, and gets the test rules, not the production ones.
- A test that never touches the DOM runs without one. Under Vitest and Jest give it
  `/** @vitest-environment node */` (`@jest-environment node`) when the project default is jsdom or
  happy-dom. Mocha and `node:test` read no such comment: when the setup registers `global-jsdom`,
  `jsdom-global` or `@happy-dom/global-registrator` for every file (`require` in `.mocharc.*`,
  `node --test --import`), move the registration into the test files that use the DOM
  (`import 'global-jsdom/register';` at the top) or into a separate run, and don't import a
  registrar in a test that doesn't use the DOM. Production code of a project tested in a DOM may use
  `document` and `window`; write `window.name` (not a bare `name`) for the confusing globals.
- A surviving mutant no input can kill means the code is redundant: delete or restructure it.
  Don't pin call order or messages just to kill it. If an input can kill it, add that test (a
  padded value for a `.trim()`, two bad fields for a `join`); never delete a schema rule to silence it.
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
  `*.integration.test.js`, folders counted under the test roots). Use fake timers instead of waits
  and fakes instead of network or disk. A test over budget is run again alone without coverage and
  fails only if it is still over. A slow test you did not touch stays baselined.
- Test each exported inverse pair on its own output (`nitpicker/untested-round-trip`): for
  `encodeToken`/`decodeToken` or `Order.toJson`/`Order.fromJson`, one test calls both,
  `expect(decodeToken(encodeToken(value))).toEqual(value)`.
