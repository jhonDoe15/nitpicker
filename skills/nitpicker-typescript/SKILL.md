---
name: nitpicker-typescript
description: Use before writing or changing TypeScript or React code in a project that has nitpicker installed with the typescript preset (the default), so the code follows its one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for TypeScript

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

If your change edits a function that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

Before you change code other modules use, fix a bug, or add a UI state, read
[beyond-the-gate.md](beyond-the-gate.md).

## Finish with the gate

1. Run your tests with the project's runner (`npx vitest run`, `npx jest`, `node --test` or
   `npx mocha`). Failing tests stop coverage, CRAP and mutation from running. The gate type-checks
   for you. Node globals (`process`, `AbortSignal`) and `node:` imports need
   `@types/node` in devDependencies.
2. When the change is complete, run `npx nitpicker --fix` as a background command you wait on,
   without a pipe: you need its exit code. It applies ESLint and Prettier fixes with its own
   configs (don't format with plain `prettier`; its quotes, semicolons, indentation and width follow
   most of the project's files), then checks your change against the merge base. It
   takes minutes and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done.
   - 1: fix every new finding and any tool error listed below them. Re-read the files `--fix`
     changed before editing them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a failing test or a
     missing package) and rerun. Exit 2 is never a pass. If it says another run is in progress,
     wait for that run; never kill it.
4. Never suppress: no `eslint-disable`, `@ts-ignore`, coverage or mutation ignore comments
   (`istanbul`/`c8`/`v8 ignore`, `Stryker disable`), config `exclude`/`disable`, legacy entries,
   or weakened tests. If a finding seems wrong, stop and ask.

## Layout

- A feature is `src/main/features/<name>/` with an `index.ts`. Import another feature only through
  its `index.ts`, from `domain/` too: `import type { Tier } from '../../members/index.js'`. Never
  copy a type another feature exports: import it, or derive it from a function you call
  (`Parameters<typeof runGreeting>[1]`). Declare the types your task defines in your feature.
- Export only what another module imports; an exported type nobody imports fails dead-code.
  Callers in another feature derive result types: `Awaited<ReturnType<typeof importContacts>>`;
  inside a feature, extend the named type (`TransitionResult | { kind: 'blank-reason' }`).
- `adapters/` does I/O and parses untrusted input (files, HTTP bodies, JSON) once, with zod (add it
  if it isn't a dependency). Field rules and conversions live in the schema
  (`z.string().trim().min(1)`, `z.email()`, `z.iso.date()`, `.transform(toCents)`), never
  `z.unknown()` fields plus hand checks. A JSON list is `z.array(recordSchema)`; the first issue's
  `path` (`[index, field]`) names the bad record.
- `domain/` is pure and takes parsed, typed values, never `unknown`. Decisions go here. No I/O or
  `process`; time, IDs and randomness are parameters. Code that drives injected async deps
  (retries, worker pools, abort) is `adapters/`; the decisions it needs are domain functions.
- `src/main/composition-root.ts` only passes things in, through named functions. A new feature is
  a new directory, never a new `if`, `?:` or `??` in a shared entry point: lookups and their
  missing-value checks go in the feature's `adapters/`.
- Follow neighbouring signatures (parameter order, naming) and reuse helpers that exist.

## Write it this way

- `function` declarations for named functions, nested helpers too; arrows only as callbacks, with a block body when
  they return nothing: `(line) => { out.push(line); }`.
- `type`, never `interface`; string-literal unions, never `enum`; no classes except `Error`
  subclasses.
- No `as`, `any` or `!`, and no `null` in your own types or values: read a library's `null` with
  `regex.exec(s)?.[0]` in one expression or a strict `!== null` check. Narrow with checks, and
  don't add `??`, `?.` or checks the types already rule out. Indexing (`list[0]`, `record[key]`)
  may be `undefined`: check the value you got.
- `===` only. Early returns, no `else` after `return`, no nested ternaries, exhaustive `switch`
  over unions.
- Template literals take strings only: `${String(count)}`.
- Sort IDs, codes and ISO dates with `toSorted()` and no comparator; names and titles with
  `a.localeCompare(b, 'en')`. Objects in plain string order share one `compareText(a, b)` that
  returns -1, 1 or 0 from `<` and `>`, with its own unit test (a sort reads only the sign). Chain
  keys on its result: `const byMonth = compareText(a.month, b.month); if (byMonth !== 0) return byMonth;`.
- `for...of` is the only loop, and no recursion: a retry is `for...of` over attempt numbers.
- A file stays within 300 lines (a test file 500) and a line within 120 characters. A folder holds
  at most 6 source files and 6 test files directly: group the rest into subfolders by what they do.
- A new clone of at least 5 lines and 50 tokens (`duplicate-clone`), in source or tests, fails:
  extract a function.
- Up to 3 parameters stay positional. Past 3, group related values into one object. A factory's
  inner functions count toward its 50 lines: put helpers at module level and pass `deps` in.
- `async`/`await`, never `.then()`. No floating promises.
- Named exports only. No comments; a `/** ... */` doc comment on an export is the one exception.

## Production rules

- Wire clients, servers, pools and config in the composition root (`src/main/composition-root.ts`,
  `main.ts` or `server.ts`) and pass them into factories; read `process.env` only there.
- Parse untrusted input once with zod in `adapters/`; `domain/` takes readonly types it declares.
- Run programs with `execFile(command, [args])`, never a command string.
- Each finding names the allowed form. A deliberate exception goes in `nitpicker.config.json`
  `exceptions` (rule, paths, reason), never inline.

## domain/ is deeply readonly

- `const` only, no loops, no mutation: use `map`, `filter`, `flatMap`, `reduce` with an initial
  value, `toSorted`. Text parsing (CSV lines, tokens) is domain logic too:
  `Array.from(line).reduce(step, initial)`; a value a schema can check (a date, a number) is
  checked by the schema in `adapters/`.
- Parameters, return types and module-level values are readonly (`readonly Total[]`); a local
  inside a function needs no annotation, but still isn't mutated: build a new `Set`, `Map` or
  `Date` instead of calling `add`, `set` or `setHours`. Give a callback that returns an object or
  array literal a readonly return type. Return readonly results as they are; don't spread-copy
  them.
- No module-level `RegExp` or zod schema (both are mutable): write the regex literal inside the
  function; schemas live in `adapters/`. Dedupe with `[...new Set(xs)]` or a `ReadonlySet`.
- A `Date` is mutable: use it in one expression (`new Date(ms).getUTCHours()`) or type it
  `Readonly<Date>`.
- Count by a union as `Readonly<Record<Status, number>>` with one `reduce` from a literal with every
  member (`xs.reduce((c, x) => ({ ...c, [x.status]: c[x.status] + 1 }), { paid: 0, ... })`), so a
  new member fails to compile. Group by key with `[...new Set(xs.map(key))]` and `filter`.
- Variants of one union share one array type (`readonly Share[]` in each).

## Errors

- `domain/` returns expected failures as discriminated unions (`{ kind: 'empty-name' }`), never
  throws them. Success is a `kind` member too: never `T | Failure` narrowed with `typeof`, never
  `Failure | undefined`.
- A `catch` returns a failure result (carrying the caught error only if something reads it) or
  rethrows an `Error` subclass with `{ cause: error }`, which a test asserts. Keep the `try` around
  the call that throws:
  `try { return schema.safeParse(JSON.parse(text)); } catch { return { kind: 'malformed-json' }; }`.
- With no caught error, throw `new XError(message)` without `cause`.
- Handle malformed input only as the ticket says; don't silently drop entries.

## Tests

- Every branch you add needs a test: changed-branch coverage and mutation testing run on your
  change. Test each outcome of each union.
- Test features through their `index.ts` with fakes: plain functions returning
  `Promise.resolve(x)` / `Promise.reject(error)`; a non-Error rejection is
  `vi.fn().mockRejectedValue(42)` (`jest.fn()` under Jest, `mock.fn(async () => { throw 42; })`
  under `node:test`, `sinon.stub().rejects(42)` under Mocha with sinon), a non-Error throw is
  `const value: unknown = 7; throw value;`.
  Read a fake's calls through a helper that throws when the call is missing, not `calls[n]?.`. Spy on `process.stdout` only to test composition-root wiring,
  and give it a real temp file (`mkdtemp`) rather than `vi.mock` of `node:` modules (`jest.mock`,
  `mock.module`, `proxyquire`, `esmock` and the other runners' module mocks count too). After each
  test the gate restores spies and stubs: Vitest's and Jest's mocks, the shared `node:test` `mock`
  (`mock.restoreAll()`), and sinon's under Mocha (`sinon.restore()`, when the project has sinon).
  Restore fake timers yourself in `afterEach`: `vi.useRealTimers()` (`jest.useRealTimers()`,
  `mock.timers.reset()`, `clock.restore()` for a sinon clock).
- The gate runs your tests with the runner the project uses, found from its `test` script, a runner
  config file or a dependency, and the same test rules apply to Vitest, Jest, `node:test` and Mocha;
  only the names differ. Examples in this guide are Vitest.
- Assert whole outputs with `toEqual`/`toBe` (`assert.deepStrictEqual`/`assert.equal`, chai's
  `expect(x).to.deep.equal`), not `toContain`, `toMatchObject` or `expect.any` (nor
  `assert.ok(text.includes('x'))`, `assert.partialDeepStrictEqual` or chai's `include` and
  `containSubset`). Write the assertion
  (`expect`, or `assert` under `node:test` and Mocha) in the test body; asserting helpers don't
  count. Repeated cases are `it.each`; `node:test` and Mocha have no `it.each`, so there write
  `for (const testCase of cases) { it(testCase.name, () => { ... }); }`, not a loop inside one test.
  Shared setup goes in `beforeAll` (`before` under `node:test` and Mocha). The rules above
  (`for...of` only, no `.then()`, no `as`) apply to tests too.
- A shared helper (stdout capture) lives once, in a file the runner does not run as a test, such as
  `test/support/stdout.ts` (under `node:test` with Node's default patterns every file in `test/` is
  a test: put the helper in `tests/support/`, or name the tests in the script, such as
  `node --test 'test/**/*.test.ts'`). When an existing test defines the same helper, make it import
  the shared one.
- Name test files the way the runner finds them; the gate reads the same patterns. Vitest:
  `*.test.{ext}` or `*.spec.{ext}` (plus the config's `test.include`). Jest: `*.test.{ext}`,
  `*.spec.{ext}` or any file under `__tests__/`, or the config's `testMatch`/`testRegex`, read through
  the test script (`react-scripts test` and `craco test` included). `node:test`: the patterns the
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
- Test roots are `test/`, `tests/`, `__tests__/` and `e2e/` at the repo root. A Playwright or Cypress
  spec in `e2e/` imports no production code and is not mutated; a Jest `__tests__/` goes in `exclude`.
- A surviving mutant no input can kill means the code is redundant: delete or restructure it.
  Don't pin call order or messages just to kill it. If an input can kill it, add that test; never
  delete a schema rule to silence it.
- No per-test git repos, child processes, servers, fixed sleeps, or raised timeouts.

## React

Applies when `react` is in `package.json`. Every React finding names the allowed form and its
exception route in the message: write that form, don't work around the rule.

- Component tests query through `screen` and assert what the user sees (text, roles, focus), never
  component state, instances or hook internals.
