# Inside tests

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

These rules cover every file of the test layout area (`<testRoot>/**`, `*.test.*` and `*.spec.*`
next to sources, and `__tests__/`). They ban forms that make a suite slow or non-hermetic. Each one
came from nitpicker's own suite, where it cost CI minutes. "Per test" means code that runs in an
`it`/`test` callback or in `beforeEach`. That includes same-file functions those callbacks call, but
not functions imported from other modules.

The `duplicates` check scans test files too, but between two test files it reports only a clone
that defines a named function (a copied helper: keep one in a non-test file such as
`test/support/` and import it). Repeated expected values and assertions between tests are left
alone.

The `duplicates` check also runs jscpd over a copy of the sources where every name, string, number and
comment is the same token, with at least 100 tokens and 5 lines, so a copy-pasted function whose
locals and literals were renamed fails too (`duplicate-clone`, identity starting `renamed:`).
Imports and re-exports, `interface`, `type` and `enum` declarations, literal-only objects and
arrays, field declarations and JSX markup (tags, attributes, text and plain `{name}` holders) are
left out of that copy, and so are generated files, so test tables, import lists and components that
only share markup structure are not clones, and neither is code that only repeats one or two
statements (constructor mappers, enum `switch` tables); handlers and conditions inside the markup count. The
message names the same route as for any clone: add either file of the pair to `exclude`. Between two test files it points at a helper or a table-driven test.

Every runnable test imports production code at runtime
(`nitpicker/test-must-use-production-runtime`), directly or through a relative test helper that
does, such as a `renderWithProviders` in `test/support/` that imports the app. The rule follows one
hop, and type-only imports do not count.

- `nitpicker/no-git-repository-per-test`: no `git init` or `git clone` per test. This covers direct
  `child_process`/`execa` calls and same-file wrappers such as `git(root, ['init'])` or
  `run('git', ['init'])`. Build a template repository once in `beforeAll` and `cpSync` it per test.
- `nitpicker/hermetic-git-in-tests`: every git process a test-area file starts passes an `env`
  object, written in that file, that sets `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM`. Same-file
  `const` objects and spreads count. An imported env object does not, because the rule cannot see
  it. Keep the git helper in one fixture file so the env is written once.
- `nitpicker/no-node-process-per-test`: no Node process per test. That covers `process.execPath`,
  `node`, `npx`/`npm`/`pnpm`/`yarn`/`bunx`/`tsx`/`ts-node`, a `node_modules/.bin` path, and `fork`.
  Import the function instead. Start the application as a process only through the `AppProcess`
  harness in `<testRoot>/fixtures/app-process.ts`, the subprocess bridge that the `test-runtime`
  analyzer recognizes. Spawning once in `beforeAll` is allowed.
- `nitpicker/no-server-or-worker-per-test`: no `createServer`/`createSecureServer`/`new Server`
  from `node:http`, `https`, `http2`, `net` or `tls`, and no `new Worker` from
  `node:worker_threads`, per test. Start them once in `beforeAll` and reset state between tests, or
  test the logic against an in-memory implementation.
- `nitpicker/no-fixed-sleep-synchronization` (existing, extended): besides `await sleep()` and
  `await new Promise((resolve) => setTimeout(resolve, n))`, it also flags
  `setTimeout(() => resolve(), n)`, `await setTimeout(n)` from `node:timers/promises` and
  `scheduler.wait(n)`. Wait on a condition with `vi.waitFor` or `expect.poll`. It also flags waits
  on wall-clock time. A timeout-based negative assertion, `expect(waitFor(...)).rejects`,
  `expect(vi.waitFor(...)).rejects` or `expect(screen.findByRole(...)).rejects` (a `findBy*` or
  `findAllBy*` call on `screen`, on a `within(...)` result or on a render result, or a bare
  `waitFor`; awaited or not, also through a `const`; a data-layer `repo.findByEmail(...)` is not),
  passes only after the full wait times out, so it is slow and depends on the delay: advance fake
  timers past the delay (`vi.advanceTimersByTime`) and assert absence at once
  (`expect(screen.queryByRole('tooltip')).toBeNull()`). Playwright `<anything>.waitForTimeout(n)`
  and Cypress `cy.wait(500)` (a number literal, or a `const` bound to a number; `cy.wait('@alias')`
  is fine, and so is `cy.wait(0)`) are flagged too: wait on a condition (`await expect(locator).toBeVisible()`,
  `cy.wait('@request')`). The rule covers every test-area file: the test roots (e2e folders under
  them included), `*.test.*`/`*.spec.*` next to sources, and `__tests__` directories (their
  fixtures are skipped). A wait that cannot be avoided gets an exception for the rule.
- `nitpicker/no-raised-test-timeout`: no test, suite or hook timeout above 10 000 ms. That is the
  test timeout nitpicker runs a project's tests with (`languages/typescript/preset/defaults/vitest.quality.config.ts`, which
  Stryker also uses, and the timeout it passes to Vitest, Jest, `node:test` and Mocha; a test keeps them in step; the
  coverage run adds the larger slow-test budget to it, see [Slow tests](slow-tests.md)).
  The rule covers the third argument of `it`/`test`, `{ timeout }` options, hook timeouts and
  `vi.setConfig`. A timeout that is not a constant written in the file is also reported. There is
  no e2e exemption; a genuinely long suite needs an exception in the config file.
- `nitpicker/no-test-retry`: no retry in test code, so a flaky test cannot pass on a later attempt.
  It reports a `retry`/`retries` option on `it`/`test`/`describe`/`suite` (any argument position,
  so Vitest, Cypress and Playwright), `vi.setConfig({ retry })`, `jest.retryTimes(n)`, Mocha
  `this.retries(n)` and Playwright `test.describe.configure({ retries })`. Aliased imports, `const`
  options, spreads of them and `as`/`satisfies` wrappers are followed; `0`, `false`, `null` and
  `undefined` are allowed. Options from an import or a call result, `const { retryTimes } = jest`
  and `test.extend` results are not followed. It checks Cypress and Playwright files under a test
  root too. Config-level retries (Vitest `test.retry`, Mocha `retries`) are pinned to 0 by
  nitpicker's runs and are not this rule's job.
- `nitpicker/no-copied-constant`: a test literal must not copy the value of a production constant
  the test can import. It reports a string or number literal in a test-area file that equals an
  `UPPER_SNAKE` constant with one literal value (`export const MAX_ITEMS = 50`, also through
  `export { NAME }`, `export { NAME } from` and `export * from`) of a project module the file
  imports with an `import` declaration (`require()` and `import()` are not followed). When the
  constant changes, such a test keeps checking the old value, or a boundary test stops testing the
  boundary: use the name (`MAX_LENGTH + 1`). Not reported: the numbers -1 to 2,
  strings shorter than 3 characters, a literal whose statement names the constant
  (`expect(MAX_ITEMS).toBe(50)` pins a value that is a contract, which is the allowed form), test
  names, property keys, types, module paths, and constants of the files the layout counts as tests,
  test helpers, fixtures or generated code (the test roots, `*.test.*`/`*.spec.*`, `__tests__/`,
  `test-support/`, `fixtures/`).
- `nitpicker/require-test-process-timeout`: synchronous `spawnSync`, `execSync` and `execFileSync`
  calls from `node:child_process` or `child_process` in test-area files need a positive subprocess
  timeout, for example `spawnSync(program, args, { timeout: 10_000 })`. A runner's timeout cannot
  interrupt a synchronous call that blocks Node's event loop. Named import aliases, namespace and
  default imports, CommonJS bindings, local constant options and object spreads count. A missing,
  zero or negative timeout is reported; a timeout or options supplied dynamically is left to the
  caller's contract. The rule sets no maximum: the process budget depends on the operation.
  It covers integration tests and test helpers as well as unit tests, including `test-support/`
  folders under the source roots, and works in the TypeScript,
  JavaScript and React presets. If a process must wait without a deadline, add a reviewed exception
  for the rule in `nitpicker.config.json`. A child that ignores its termination signal can still
  outlive Node's subprocess timeout; this rule checks the configured deadline, not OS containment.
- `nitpicker/no-first-test-charged-setup`: no lazily memoized shared setup that tests reach. It
  reports a call whose value is stored in a module-level `let`/`var` only while that variable is
  empty (`x ??= expensive()`, `x ||= call()`, `x = x ?? call()`, `if (!x) x = call()`,
  `if (x === undefined) { x = call() }`, or `if (x) return x; x = call()`), when an `it`/`test`
  body or `beforeEach` runs it, directly or through same-file helpers. The first test to run pays
  for the setup, reports show that test as slow, and test order matters. Compute it in
  `beforeAll`. Constants, `new` expressions and calls on `path`, `Math`, `Object`, `JSON` and
  similar built-ins are not reported. A deliberate memo needs an exception in the config file.
- `nitpicker/no-unused-dom-environment` (not strict: a finding counts only when new in the diff): a
  runnable test file (`*.test.*`, `*.spec.*`) that runs in `jsdom` or `happy-dom` must use the DOM.
  Keep `node` as the project's environment and put `/** @vitest-environment jsdom */` only on the
  files that render. It reports once per file, on the directive when the file has one.
  - Environment: the file's own `@vitest-environment` or `@jest-environment` directive (found in
    the file text, as Vitest finds it), else the project's. nitpicker loads the project's
    `vitest.config.*` or `vite.config.*` once per snapshot in a short-lived child process, with the
    project's own `vite`, and reads `test.environment` (default `node`), inline `test.projects`
    (`include`, `exclude`, `root`/`dir`, `environment`, `extends: true`) and the `resolve.alias` /
    `test.alias` entries. A file in several projects counts as DOM if any of them is. When the
    config cannot be read, sets `test.browser.enabled`, `test.environmentMatchGlobs` or
    `test.workspace`, or a project is named by path, those files have no known default and only
    directives are checked. An unreadable config is also reported as one report-only finding on
    the config file.
  - Uses the DOM, so nothing is reported: the file, or any project module it reaches through
    imports, re-exports, `require`, dynamic `import()`, `vi.mock`/`vi.importActual`/`vi.doMock`,
    `tsconfig`/`jsconfig` `paths`, Vite aliases, workspace packages linked into `node_modules` and
    barrels: imports a DOM testing package (`@testing-library/*`, `@*/testing-library`,
    `react-dom`, `enzyme`, `@vue/test-utils`, `@storybook/test`, `jest-axe` and similar) or a
    Storybook `composeStories`; imports a `.tsx`, `.jsx`, `.vue` or `.svelte` module; or reads a
    browser-only global (names from the `globals` package's `browser` set that Node does not have;
    `navigator` only beyond `userAgent`, `language(s)`, `platform` and `hardwareConcurrency`).
    Type-only imports and type annotations do not count, nor do `react-test-renderer`,
    `react-dom/server` or `jsdom` imported as a library. When the imports reach deeper than 8
    modules or more than 200 files, or a reached module loads a computed path (`import(name)`,
    `require(name)`), the file is not reported.
  - Setup files: when the project's environment is DOM and one of its `test.setupFiles` (or a
    project module it imports) reads a browser-only global, every file in that project counts as
    using the DOM. Importing a DOM testing package such as `@testing-library/jest-dom` in a setup
    file does not count, since it also loads under `node`.
  - Not seen: DOM use that only shows at run time, or behind a module nitpicker cannot resolve.
    Adding `@vitest-environment jsdom` to such a file does not clear the finding; the only way out
    is an exception for the rule in the config file.
- `nitpicker/no-uninjectable-delay` (production code, not tests): `setTimeout`/`setInterval`
  (global, `globalThis`, or from `node:timers`/`node:timers/promises`) whose delay is a module-level
  `const` of 500 ms or more, inside an exported top-level function that has no parameter which
  could carry the delay. A destructured, defaulted or rest parameter, or one named like
  `options`/`config`/`delayMs`/`timeoutMs`, counts as able to carry it. Inline numbers, delays set
  inside a non-exported helper and class methods are not reported. Tests cannot shorten such a
  delay without fake timers, so accept it as an option with the constant as its default.
- `nitpicker/test-tsconfig-pins-lib-and-types`: a tsconfig object a test serializes with
  `JSON.stringify` must set `compilerOptions.types` and `compilerOptions.lib` (or `noLib`), so a
  fixture `tsc` run does not load every `@types` package and the full default lib. If
  `compilerOptions` spreads an object the rule cannot resolve, it is not checked.
- `nitpicker/no-process-globals-outside-main-guard`: test helper and fixture scripts (test-area
  files that are not `*.test.*`/`*.spec.*`) use `process.argv`, `process.exit` and
  `process.exitCode` only inside a main guard: an `if` whose condition uses `import.meta` (such as
  `import.meta.main`) or `require.main`. Export a function that takes the arguments and returns the
  exit code, so tests can import it instead of spawning it.
- `nitpicker/no-partial-output-assertion` (not strict: a finding counts only when new in the diff, not
  on every touched line): no positive `expect(x).toContain('text')`, ``toContain(`template`)`` or
  `toContainEqual(...)`, also through `.resolves`/`.rejects` and `expect.soft`. A fragment passes
  even when the rest of the output is wrong. Assert the whole output with `toEqual` or `toBe`. A
  negated assertion (`.not.toContain`) is allowed, and so is `toContain` with a non-text argument.
  The same holds for `toMatchObject` and for `toEqual`/`toStrictEqual` given `expect.objectContaining`,
  `expect.stringContaining` or `expect.arrayContaining`, even nested inside an object or array
  literal: pass the whole expected value, using `expect.any(Type)` for a field that varies. Asymmetric
  matchers inside `toHaveBeenCalledWith` are not reported. Output too large or unordered to pin
  needs an exception in the config file.
- `no-restricted-syntax` bans the same constructs as in production code, with the same messages:
  `for(;;)`, `for...in`, `while` and `do...while` (use `for...of`, or `it.each` for one test per
  case), `forEach`, `as` (except `as const`) and
  `<Type>value`; `.then()`/`.catch()`/`.finally()` chains are `nitpicker/no-promise-chain`. `any`
  and non-null `!` are already reported in test files by
  typescript-eslint's `no-explicit-any` and `no-non-null-assertion`. Like the other bans, these are
  strict rules: a finding on a line a change edits, or in a new test file, fails the run. An exception for
  `no-restricted-syntax` lifts all the syntax bans for those paths.
- Weak assertions pass whatever the code returns, so `vitest/no-restricted-matchers` bans
  `toBeDefined`, `toBeTruthy`, `toBeFalsy`, `not.toBeNull` and `not.toBeUndefined` (also after
  `.resolves`/`.rejects`): assert the value with `toBe` or `toEqual`. `vitest/prefer-called-with`
  rejects a bare `toHaveBeenCalled()` (pass the arguments), `vitest/require-to-throw-message`
  rejects `toThrow()` without a message or class, and `no-restricted-syntax` rejects a literal
  subject (`expect(true)`). `nitpicker/no-partial-output-assertion` also rejects `toMatch` with a
  string or a pattern that is not anchored `^...$`; an anchored pattern pins the whole value.
- `nitpicker/no-weak-assertion` (not strict) rejects the other spellings of a weak check, in test
  files of the TypeScript and JavaScript presets alike:
  - presence: `.not.toBe`, `.not.toEqual` or `.not.toStrictEqual` given `null` or `undefined` (also
    after `.resolves`/`.rejects`), and node:assert `assert.notEqual(x, null)`,
    `assert.notStrictEqual(x, undefined)`, `assert(x != null)` and `assert.ok(x !== undefined)`;
  - non-empty only: `expect(x.length)` or `expect(x.size)` with `toBeGreaterThan(0)`,
    `toBeGreaterThanOrEqual(1)` or `.not.toBe(0)`/`.not.toEqual(0)`/`.not.toStrictEqual(0)`,
    `.not.toHaveLength(0)`, `.not.toEqual([])`, `.not.toEqual('')`, `expect(x.length > 0).toBe(true)`,
    and `assert.ok(x.length > 0)`, `assert(x.size >= 1)`, `assert.ok(x.length)`,
    `assert.notEqual(x.length, 0)`; `expect(spy.mock.calls.length).toBeGreaterThan(0)` is one of them;
  - wildcard-only calls: `toHaveBeenCalledWith`, `toHaveBeenLastCalledWith`,
    `toHaveBeenNthCalledWith` (after the index), `toHaveBeenCalledExactlyOnceWith` and their
    aliases, when every argument is `expect.anything()` or `expect.any(Type)`.
    Assert the exact value, contents or length (`expect(rows).toEqual([...])`,
    `expect(rows).toHaveLength(3)`, `assert.deepStrictEqual(...)`) and the call's arguments
    (`expect(spy).toHaveBeenCalledWith(orderId)`). `assert` is matched by name, with no import
    tracking. `assert(x != null)` and `assert.ok(x !== undefined)` narrow the type in TypeScript, so
    they are allowed when the same expression (`x`, `order.id`) appears later in the same
    function; `assert.notEqual(x, null)` and `assert.notStrictEqual(x, undefined)` do not narrow and
    are always reported. A negated call check (`.not.toHaveBeenCalledWith`) and a call that pins at least one
    argument are allowed. The matchers `toBeDefined`, `toBeTruthy`, `toBeFalsy`, `not.toBeNull` and
    `not.toBeUndefined` stay with `vitest/no-restricted-matchers`, and `assert.ok(x)` on a value
    that is not a `.length` or `.size` is not reported.
- `nitpicker/no-shared-test-state`: no `let` with a value at module level or directly in a `describe`
  callback. Keep the state in the test, or declare it without a value and set it in `beforeEach`.
- `nitpicker/no-copy-pasted-tests`: three `it`/`test` calls in one block whose callbacks are the same
  once literals are ignored are reported from the third on. Write one `it.each` table.
- `nitpicker/fake-timers-require-restore`: a file that calls `vi.useFakeTimers()` needs
  `vi.useRealTimers()` in `afterEach`/`afterAll` (`afterEach(vi.useRealTimers)` counts), in an
  `onTestFinished` callback or in a `finally`. Otherwise the fake clock leaks into the next tests,
  which then time out. With `@testing-library/user-event`, create the user with
  `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`. In a `*.test.*`/`*.spec.*` file the
  rule does the same for `vi.stubGlobal` (restore with `vi.unstubAllGlobals()`) and `vi.stubEnv`
  (`vi.unstubAllEnvs()`); a setup file may stub a global for every test, as jsdom setups do. A
  project whose Vitest config sets `unstubGlobals: true` or `unstubEnvs: true` restores that kind of
  stub itself, so it is not checked there: the flag is read as a literal from the root config, from
  an inline `test.projects` entry (for the files under its `root`) and from the config of a path or
  glob `test.projects` entry (for the files under that package).
  The rule also reports a direct write in a function of a test file that the file never puts back:
  an assignment to `process.env.X`, `process.env[name]` or `process.env`, `delete process.env.X`,
  `Object.assign(process.env, ...)`, `Reflect.set`/`Reflect.deleteProperty` on `process.env`, and an
  override of a member of `globalThis`, `global`, `window`, `self`, `Date`, `Math`, `Intl` or
  `console` (`Date.now = ...`, `globalThis.fetch = ...`, also through `Object.defineProperty` or
  `Reflect.set` with a literal name). A write of the same target (any `process.env` write for the
  environment) in `afterEach`, `afterAll`, `onTestFinished` or a `finally`, or in a function that
  one of those calls, restores it. Top-level code and the callbacks of a top-level `beforeAll`,
  `beforeEach`, `vi.hoisted`, `vi.mock` or `vi.doMock` are not checked: they set the same state for
  every test in the file.
  The allowed forms are `vi.stubEnv`, `vi.stubGlobal`, `vi.spyOn` and fake timers, restored as above.
- `nitpicker/no-switched-off-tests`: no `it.todo`/`test.todo`/`describe.todo` (`vitest/no-disabled-tests`
  already reports `skip`; neither is a way to switch a test off) and no `skipIf(true)`/`runIf(false)`.
  A real condition such as `skipIf(process.platform === 'win32')` is allowed, and so is `it.fails`,
  which runs and documents a known bug: it starts failing once the bug is fixed.
- `nitpicker/no-float-equality-in-tests`: no exact equality assertion against a non-integral float
  literal (`0.1`, `-2.5`, `1e-3`, `.5`, also as `0.1 as number`), because the sum or product it checks
  rarely equals the decimal literal bit for bit. It reports `toBe`, `toEqual` and `toStrictEqual`
  (also after `.not`, `.resolves`, `.rejects` and on `expect.soft`/`expect.poll`), the `node:assert`
  forms `equal`, `strictEqual`, `deepEqual`, `deepStrictEqual` and their `not` forms (also from
  `assert/strict`, as a default, namespace or named import, and on a `node:test` `t.assert`) with the
  literal in either of the first two arguments, and chai `equal`/`eq`/`eql` (`expect(x).to.equal(0.1)`,
  `assert.equal` from chai). `toEqual`, `toStrictEqual`, `deepEqual`, `deepStrictEqual`, `eql` and
  `.deep.equal` also look inside array and object literals. An `===`, `==`, `!==` or `!=` comparison
  with such a literal inside `assert(...)`, `assert.ok`, chai `isTrue`/`isFalse` or `expect(...)` is
  reported too (`expect(total === 0.1).toBe(true)`), also inside a call or an arrow-function
  callback in that condition (`assert.ok(values.every((value) => value === 0.5))`). Use
  `toBeCloseTo(0.1)`,
  `expect.closeTo(0.1)` inside the expected value, chai `closeTo`, or
  `assert.ok(Math.abs(actual - 0.1) < tolerance)`. Integral literals such as `1.0` or `2e3`, `BigInt`,
  `NaN`, infinities and ordering comparisons are allowed. A value that is exact by construction needs
  an exception in the config file.
- `nitpicker/no-unowned-async-assertion`: an assertion inside a callback the test hands off must
  run before the test ends, or its failure is lost or blamed on another test. The callbacks it
  follows, written inline or passed by the name of a local function, anywhere in the test body
  (also inside helpers, nested callbacks and immediately called functions the test defines).
  A bare `setTimeout`, `setImmediate`, `queueMicrotask` and the like count only when they are the
  global: a function or variable of that name declared in scope is not a timer, and a bare
  `nextTick` counts only when imported from `node:process` (Vue's `nextTick` is not a timer):
  - timers: `setTimeout`, `setImmediate`, `requestAnimationFrame`, `requestIdleCallback`, also on
    `globalThis`/`window` and imported from `node:timers` under any name. Awaiting an unrelated
    promise only drains microtasks, so `await Promise.resolve()` or `await load()` does not own a
    timer. The test owns one when a later step awaits or returns a timer wait at least as long as
    the timer's literal delay (`sleep(n)`, `delay(n)`, `wait(n)`, `page.waitForTimeout(n)`,
    `setTimeout(n)` from `node:timers/promises`, `new Promise((r) => setTimeout(r, n))`), awaits a
    polling wait (`waitFor`, `vi.waitFor`, `waitUntil`, `expect.poll`, Testing Library `findBy*`),
    or advances a fake clock (`vi.advanceTimersByTime`,
    `jest.runAllTimers`, `clock.tick`, `clock.next`, `jasmine.clock().tick`, `cy.tick`,
    `t.mock.timers.tick`, `page.clock.runFor`, ..., also inside a local helper the test calls, a
    function passed to another call such as `act(() => vi.advanceTimersByTime(10))`, or after
    `const { advanceTimersByTime } = vi`). A clock method on another object (`game.tick()`) does
    not count.
  - microtasks: `queueMicrotask` and `process.nextTick`. A later `await` owns them, and so does
    `jest.runAllTicks()`; advancing fake timers does not, as Vitest's fake timers leave them real.
  - handlers: `on`, `once`, `addListener`, `prependListener`, `prependOnceListener`,
    `addEventListener`, an `onmessage`-style handler property, the callback of a
    `MutationObserver`, `ResizeObserver`, `IntersectionObserver` or `PerformanceObserver`, and
    the long-lived handlers of `http`/`https`/`http2`/`net`/`tls` `createServer` and
    `createSecureServer`, `dgram.createSocket`, `connect` and `fs.watch`/`fs.watchFile`. A later
    step that awaits, calls something other than `console` or a log method, creates an object or
    writes a property may fire the event and owns it. `subscribe` counts only on an rxjs source
    known to be asynchronous (`interval`, `timer`, `fromEvent`, `webSocket`, or a `pipe` with
    `delay`, `debounceTime` and the like, imported from `rxjs`): `of(1).subscribe(...)` or a
    `BehaviorSubject` run synchronously and are not reported, and neither is anything inside
    `testScheduler.run(...)`.
  - Node callback APIs: a callback passed to a function of `fs`, `child_process`, `dns`, `zlib`,
    `crypto`, `stream`, `net`, `tls`, `http`, `https`, `http2` or `dgram` (imported or required
    under any name). Only the promise form or `done` owns it; other synchronous callbacks, such as
    `assert.throws(run, (err) => ...)`, `errors.map((error) => ...)` or `vi.fn((error) => ...)`,
    are not reported.
  - Also owned: a callback inside a `new Promise(...)` executor whose promise is awaited, returned,
    yielded or passed on to something that is (`Promise.all([...])`, an arrow body handed to
    `map`, a variable, property or array it is stored in and that is awaited later); a test that
    takes the runner's `done` callback and uses it (Mocha and Jest: the first parameter;
    `node:test`: the second; in a Jest `it.each` table the last, once the row length is known or
    the parameter is called; Vitest has no `done`); and a test whose plan needs an assertion from
    the callback (`expect.assertions(n)` or `t.plan(n)` with more than the assertions that run
    synchronously, counting each `expect(...).matcher` chain once, or `expect.hasAssertions()`
    with none). Returning or awaiting the timer or listener call itself (`return setTimeout(...)`)
    does not own it, and an expression-bodied test (`it('x', () => setTimeout(...))`) is checked
    like a block. Hooks, `describe` bodies and Playwright's `test.step` are not tests: a listener
    registered in a hook lives through the test. A host and its owner may sit together in a nested
    block, loop, `test.step` callback or helper; whatever runs after the host in source order, or
    after a call of the helper that holds it, can own it.
  - Limits: a host is found only by its own name, so an alias (`const st = setTimeout`) hides it,
    and module-level helpers outside the test are not followed. Any later await, call or property
    write owns a handler, even one unrelated to it. `expect.hasAssertions()` or a larger
    `expect.assertions(n)` exempts the test whichever callback the assertions are in, and a
    `hasAssertions` in a global `beforeEach` is not seen. A tagged-template `it.each` table is not
    read as a table, and a computed template member name (``obj[`on${name}`]``) is not matched.
- `nitpicker/no-assertion-in-loop`: an assertion inside a loop or an iterating callback of a test body
  runs once per element, so an empty collection (a bug in the code under test) makes the test pass
  without asserting anything. It is the loop counterpart of `vitest/no-conditional-expect`, and the
  TypeScript and JavaScript form of Python's `conditional-assertion-in-test` and Kotlin's
  `AssertionInControlFlow`. It works for Vitest, Jest, `node:test` and Mocha (`it`, `test`,
  `specify`, `xit`, `fit` and `xtest`, also `test.each` with a tagged template, a named function
  as the callback, and a callback wrapped in a call such as `it('x', withFixture(async () => ...))`),
  with `expect` (also `expect.soft`, `expect.poll`, `.resolves`/`.rejects` chains and imported
  aliases such as `import { expect as ex }`), `node:assert` and `assert/strict` (imported under any
  name), Chai `assert`/`expect`/`should`, the `t.assert` of `node:test`, a chained `.expect(...)`
  call (supertest), any imported function whose name starts with `assert` or `expect`, and the
  project's `assertionFunctionNames` convention. Matcher builders (`expect.not.arrayContaining`,
  `expect.any`), `chai.use` and `chai.should()` are not assertions. `it` and `test` count as test
  registrations only when they are unbound globals or come from `vitest`, `jest`, `node:test`,
  `mocha`, `@jest/globals` or `@playwright/test` (or from a `const test = base.extend(...)` of
  such an import), so a local `const test = load()` or a helper parameter named `test` hides
  nothing. The rule is shared by the ESLint and oxlint engines through the plugin. Reported, once
  per outermost loop of a test, at its first assertion:
  - the loops `for`, `for...of`, `for await...of`, `for...in` and `while`, and the callbacks of
    `forEach`, `map`, `flatMap`, `filter`, `some`, `every`, `reduce`, `reduceRight`, `find`,
    `findIndex`, `findLast`, `findLastIndex` and `Array.from(items, callback)`, also on
    `Object.entries(...)` and the like and inside
    `await Promise.all(items.map(async (item) => ...))`; a callback given to `new X(callback)` is
    read like a call argument;
  - a call to a helper that asserts (a function of the same file, found through `const check = ...`
    or `function check`, also when it asserts through another helper), made in a loop or handed to
    an iterating call (`orders.forEach(check)`), whether the helper sits in the test or at module
    level;
  - a loop of assertions inside such a helper that a test calls, reported at the assertion in the
    helper's loop (once, however many tests call the helper, and also when the helper reaches the
    loop through other same-file helpers);
  - a loop over a literal table (`for (const row of [[1, 2], [3, 4]])`), with a message that points
    at `it.each` (or, in `node:test`, at subtests registered from the table): a table that is not
    empty today is still a loop that checks nothing when the table is emptied or filtered;
  - a loop whose assertion does not read the loop variable (`expect(config.mode).toBe('strict')`),
    since it has the same hole. The rule does not follow data flow, as in the Python and Kotlin
    rules;
  - `node:test` subtests registered in a loop (`await t.test(name, () => ...)`, `t.it`) over a
    collection that is not a literal, non-empty array: an empty collection registers no subtest and
    the test passes.

  Allowed, and named by the message:
  - asserting the whole collection (`expect(orders).toEqual([...])`,
    `assert.deepStrictEqual(orders, [...])`); `expect(orders.every((o) => o.paid)).toBe(true)` is
    also true for an empty `orders`, so pair it with `expect(orders).not.toHaveLength(0)`;
  - a parameterized test for a table of cases (`it.each`/`test.each`); in `node:test`, which has no
    table API, a loop over a literal, non-empty array (written inline, or a same-file `const`
    initialised with an array literal) that registers one subtest per row with
    `await t.test(name, () => ...)`; a loop outside any test that registers `it(...)` calls is not
    in a test body and is not reported either;
  - a loop whose body always runs at least once and so cannot pass on an empty collection:
    `for (let i = 0; i < 3; i++)` with a literal start and a literal bound that holds at the start,
    `Array.from({ length: 3 }, ...)` (and `Array.from({ length: 3 }).forEach(...)`) with a literal
    positive length, and `do ... while`, whose body runs once before the condition is read;
  - a loop that only builds data before an unconditional assertion.

  `expect.assertions(n)` and `expect.hasAssertions()` do not exempt a loop. They catch an empty
  loop only when `n` is exact for today's data and nobody keeps it in step with the table, so the
  rule reports the loop anyway and the message sends the test to the allowed forms. Limits: only
  same-file functions are followed, called by name (`check(x)`) or handed to an iterating call;
  methods (`helpers.check(x)`), object-method helpers and helpers imported from another file are
  not followed; a helper that no test calls, or that only a hook calls, is not read, and neither is
  a function defined inside a test that nothing calls. A `test` imported from a local fixture file
  (`import { test } from './fixtures'`) is not recognised as a test registration. Hooks,
  `describe` bodies and `test.step` callbacks are not tests (a step in a loop is judged as part of
  its test). A chained property assertion without a call (`value.should.be.true`) is not an
  assertion call and is not seen; `value.should.equal(1)` is. A tagged-template `it.each` table is
  not read as a table, but its test body is read.

- `slow-test` (coverage check, head only): an added or edited test fails above 5 s, or 30 s in an integration/e2e test folder. All supported runners share this policy. Suspected slow tests are rerun without coverage instrumentation, using the existing head policy's thresholds and reviewed exceptions; unchanged test calls do not add findings.
- `nitpicker/no-real-time-random-or-network`: in tests, no `Date.now()`, `new Date()` without an
  argument or `Math.random()` (fake the clock with `vi.useFakeTimers()` and `vi.setSystemTime`, or
  spy on `Math.random`; either one anywhere in the file lifts the check), and in unit tests
  (`__tests__/`, `<testRoot>/unit/` and `*.test.*` next to sources) no `fetch`, `http`/`https`
  `request`/`get`, `net.connect` or `new WebSocket`. Inject the client instead.
- `nitpicker/no-uncollected-tests`: a file in the test area that is not named `*.test.*` or `*.spec.*`
  (or `*.test-d.*`/`*.spec-d.*`, Vitest's type tests) but defines `describe`/`it`/`test` at its top
  level is never run by Vitest. Rename it. The structure check reports the same rule on the
  `package.json` of a workspace package (npm, yarn or pnpm workspaces) that has test files but no
  `test` script, when the root test config does not include it either: a root Vitest config's
  `test.projects` (read as literals; a glob or a path to the package or its config counts), its
  `test.include`, Jest's `projects`, or a root `test` script that runs Vitest or Jest itself. The
  finding counts the package's test files and is held while the count does not grow, so a new
  package or a new test file in such a package fails. Add a `test` script or a `projects` entry, or
  add an exception for `nitpicker/no-uncollected-tests` with the package.json path.
- `nitpicker/no-test-helpers-in-source`: a file under a source root that sits in a `testing/`,
  `test-utils/`, `test-helpers/`, `test-support/`, `fixtures/` or `__mocks__/` folder, or is named
  `test-utils`, `test-helpers`, `test-support` or `*.fixtures`, is a test helper. Placed in
  production source it is mutation-tested and shipped. When the project has a test root on disk
  (`layout.testRoots`, `test/` or `tests/` by default), move it under that root, for example
  `test/test-support/`; a `test-support/` folder under a source root is reported too. When no test
  root exists and the tests sit next to the code, a `test-support/` folder beside the code it
  serves is the allowed place for test-only modules and is not reported; the other helper folders
  and names are. The layout then counts those files as test code, so coverage, CRAP and mutation
  leave them out.
- `nitpicker/no-internal-module-mocks` also reports `vi.spyOn(namespace, ...)` on a namespace import
  (`import * as domain`) of production code.
- `nitpicker/no-production-imports-in-setup-files`: a file the project's Vitest or Vite config lists in
  `setupFiles` or `globalSetup` may not import production code (a setup file runs before every test
  file, so calls made there would count as covered). The setup files are read from the config text as
  string literals, so a computed `setupFiles` value (built from a variable) is not checked. A test
  may not mention `__stryker__`,
  `STRYKER_*` or `activeMutant` either (`no-restricted-syntax`): behaviour that depends on the
  mutation harness hides every mutant. For the same reason a test reads a global by its name
  (`globalThis.name`), not by a computed key (`Reflect.get(globalThis, key)`, `globalThis[key]`).
- `vitest/no-conditional-expect` (from the vitest recommended set) reports an `expect` inside a `catch` or a branch; the message adds that a test asserts a failure with `expect(() => run()).toThrow(Specific)` or `await expect(promise).rejects.toThrow(Specific)`.
- `vitest/no-conditional-in-test` is enabled for test files: no `if`, ternary or `&&`/`||` branching
  inside a test body. Give each outcome its own `it.each` table row instead of branching on it.
  Assertions inside loops are `nitpicker/no-assertion-in-loop`.
- The vitest config nitpicker runs tests with (`defaults/vitest.quality.config.ts`, used for
  coverage and mutation) sets `restoreMocks: true`, so a `vi.spyOn` spy is restored after every test
  even when an assertion fails, and cannot leak into the next test. It also overrides a
  `restoreMocks` value in the project's own vitest config for these runs. Jest runs with
  `--restoreMocks` for the same reason, and `node:test` restores a test's `t.mock` itself. Jest's
  coverage run also gets `--coveragePathIgnorePatterns=/node_modules/` beside nitpicker's own
  `--collectCoverageFrom` globs, so a `coveragePathIgnorePatterns` in the project's Jest config (or
  one of its `projects`) cannot leave source files unmeasured; `exclude` in `nitpicker.config.json`
  is the way to leave a file out. Neither
  Vitest nor Jest restores fake timers automatically: call `vi.useRealTimers()` (or
  `jest.useRealTimers()`) in `afterEach`.

- `test-console-output` (the `test-console` check, not an ESLint rule): a test file that prints
  `console.error` or `console.warn` output the base run did not print fails, with the message and
  the test that printed it. A change that makes a suite start printing one (a React update on an
  unmounted component from a timer that survives the test, a key warning, a logged error) is
  usually a bug, and warnings in a suite hide the next real one. The allowed forms are fixing the
  cause (cancel the timer or subscription in the cleanup), a `testConsole.allow` entry for a known
  third-party message, or an `exceptions` entry for the test file. Messages are compared by their
  normalized text, per test file, so an old warning that only moved is not new. It runs on
  Vitest, Jest, `node:test` and Mocha projects alike (Jest names the file but not the test), and
  the JavaScript preset gets the same check. See
  [Console output from tests](../usage.md#console-output-from-tests).

Left out, from the same write-up: recomputing one expensive result in every test, and running the
whole pipeline to check a decision made earlier. Both need a heuristic (repeated constant arguments
across tests, or what an assertion depends on), so a finding would not reliably mean a slow test.
Vitest's worker count in CI is a CI setting, not code. It belongs in the CI workflow or in a check
of the project's CI files, not in these rules. That check would need its own analyzer (a runner
kind, a version entry, a check definition and project-level findings) and is not built yet.
