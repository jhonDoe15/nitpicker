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

1. Run your tests with the project's runner (its `test` script). Failing tests stop coverage, CRAP
   and mutation from running.
   The gate type-checks for you. Node globals (`process`, `AbortSignal`) and `node:` imports need
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
   (`istanbul`/`c8`/`v8 ignore`, `Stryker disable`), config `exclude`/`disable`/`exceptions`, legacy entries, generator markers (`@generated`, `DO NOT EDIT`) in files you wrote, or weakened tests. If a finding seems wrong, stop and ask. Never pass `--accept-policy-change` or set
   `NITPICKER_ACCEPT_POLICY_CHANGE`: a `nitpicker-config/policy-loosened` finding is for a person to
   accept.
5. Code that is right despite a rule: each message ends with the `exceptions` entry that would
   accept it (`If this is intended, add {...} to "exceptions" in nitpicker.config.json.`). That
   entry is for a human reviewer. Never add one, and never fill in its
   `reason`, to get past the gate: stop and ask a human, and quote the finding with its entry. A
   TypeScript compiler error has no entry; fix the type.

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/main/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Layout

- A feature is `src/main/features/<name>/` with an `index.ts`. Import another feature only through
  its `index.ts`, from `domain/` too: `import type { Tier } from '../../members/index.js'`. Never
  copy a type another feature exports: import it, or derive it from a function you call
  (`Parameters<typeof runGreeting>[1]`). Declare the types your task defines in your feature.
- Export only what another module imports; an exported type nobody imports fails dead-code.
  Callers in another feature derive result types: `Awaited<ReturnType<typeof importContacts>>`;
  inside a feature, extend the named type (`TransitionResult | { kind: 'blank-reason' }`).
- `adapters/` does I/O and parses untrusted input (files, HTTP bodies, JSON) once, with the project's
  validation library (zod if it has none; add it then). Field rules and conversions live in the schema
  (`z.string().trim().min(1)`, `z.email()`, `z.iso.date()`, `.transform(toCents)`), never
  `z.unknown()` fields plus hand checks. A JSON list is `z.array(recordSchema)`; the first issue's
  `path` (`[index, field]`) names the bad record.
- `domain/` is pure and takes parsed, typed values, never `unknown`. Decisions go here. No I/O or
  `process`; time, IDs and randomness are parameters. Code that drives injected async deps
  (retries, worker pools, abort) is `adapters/`; the decisions it needs are domain functions.
- `src/main/composition-root.ts` only passes things in, through named functions. A new feature is
  a new directory, never a new `if`, `?:` or `??` in a shared entry point: lookups and their
  missing-value checks go in the feature's `adapters/`.
- New code goes under the source roots (`layout.sourceRoots`); the gate reports anything outside.
- Follow neighbouring signatures (parameter order, naming) and reuse helpers that exist.

## Dependencies and files

- The gate fails unlisted, unused and unresolved dependencies, production imports of a
  `devDependency`, and committed secrets, binaries, build output and files over 1 MB; each message
  names the fix. Don't add an `exceptions` entry to get past one: stop and ask.

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
  over unions, with no `default`.
- Template literals take strings only: `${String(count)}`.
- Sort IDs, codes and ISO dates with `toSorted()` and no comparator; names and titles with
  `a.localeCompare(b, 'en')`. Objects in plain string order share one `compareText(a, b)` that
  returns -1, 1 or 0 from `<` and `>`, with its own unit test (a sort reads only the sign). Chain
  keys on its result: `const byMonth = compareText(a.month, b.month); if (byMonth !== 0) return byMonth;`.
- `for...of` is the only loop, and no recursion: a retry is `for...of` over attempt numbers.
- A file stays within 300 lines (a test file 500) and a line within 120 characters. A folder holds
  at most 6 source files and 6 test files directly: group the rest into subfolders by what they do.
- A new clone of at least 5 lines and 50 tokens (`duplicate-clone`), in source or tests, fails:
  extract a function, also when the copy has other names and literals.
- Up to 3 parameters stay positional. Past 3, group related values into one object. A factory's
  inner functions count toward its 50 lines: put helpers at module level and pass `deps` in.
- Remove a parameter the body does not read. One that a callback or override signature requires
  starts with `_` (`_event`).
- `async`/`await`, never `.then()`. No floating promises.
- Fan-out: bound concurrent remote or message calls. Run each call through a limiter created outside the loop (`pLimit(8)`, p-queue `concurrency`, Bottleneck `maxConcurrent`) or work through fixed-size chunks. Never `Promise.all(items.map(send))` over a runtime collection.
- Named exports only. No comments; a `/** ... */` doc comment on an export is the one exception.
- Signatures: a value with three states is a union of string literals, not `boolean | undefined`
  or `flag?: boolean` (also as an optional property); default only `undefined` with `??`, never `||` on an optional parameter that can be `0`, `''` or
  `false`; return a
  new array, `Set`, `Map` or object instead of changing a parameter (`[...items, item]`,
  `items.toSorted()`). When code moves, change every caller and delete the old name: no
  `@deprecated` declaration and no `export const Old = New` alias.

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
- Count by a union as `Readonly<Record<Status, number>>` written as a literal with every member,
  from one `Object.groupBy` (`const byStatus = Object.groupBy(xs, (x) => x.status);` then
  `{ paid: byStatus.paid?.length ?? 0, ... }`), so a new member fails to compile. Group by key with
  `[...new Set(xs.map(key))]` and `filter`.
- Build a result that grows with the input in one pass (`Object.fromEntries`, `new Map`,
  `flatMap`, or `Object.groupBy`, which needs `lib` `ES2024` and TypeScript 5.7 or later),
  never by spreading the accumulator (`({ ...acc, [k]: v })`, `[...acc, x]`). The gate reads
  only inline `reduce` callbacks, so a reducer passed by name is a known gap, not a way around the
  rule: the same spread there is just as quadratic. Spreading a record of fixed keys
  (`({ ...acc, paid: acc.paid + 1 })`) does not grow and is fine.
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
- Keep an assertion unless another test covers the same behaviour.
- A test run that prints new `console.error` or `console.warn` output fails
  (`test-console-output`): cancel the timer or subscription in the cleanup.
- Test features through their `index.ts` with fakes: plain functions returning
  `Promise.resolve(x)` / `Promise.reject(error)`; a non-Error rejection is
  `vi.fn().mockRejectedValue(42)`, a non-Error throw is `const value: unknown = 7; throw value;`.
  Read a fake's calls through a helper that throws when the call is missing, not `calls[n]?.`. Spy on `process.stdout` only to test composition-root wiring,
  and give it a real temp file (`mkdtemp`) rather than `vi.mock` of `node:` modules. The gate
  restores spies; restore fake timers with `vi.useRealTimers()` in `afterEach`.
- Assert whole outputs with `toEqual`/`toBe`, not `toContain`, `toMatchObject` or `expect.any`.
  Write `expect` in the test body; asserting helpers don't count. Do not assert inside a loop,
  `forEach` or `map` callback: an empty collection passes without asserting, so assert the whole
  collection (`expect(orders).toEqual([...])`) and put cases in `it.each`
  (`nitpicker/no-assertion-in-loop`). The rules above (`for...of` only, no `.then()`, no `as`) apply
  to tests too.
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

## React

Applies when `react` is in `package.json`. Every React finding names the allowed form and its
exception route in the message: write that form, don't work around the rule.

- Component tests query through `screen` and assert what the user sees (text, roles, focus), never
  component state, instances or hook internals.
