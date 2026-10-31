---
name: nitpicker-javascript
description: Use before writing or changing JavaScript in a project that runs nitpicker with the javascript preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for JavaScript

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

This is for `"preset": "javascript"` in `nitpicker.config.json`: plain `.js`, `.mjs` and `.cjs` files
whose types are written as JSDoc and checked by TypeScript (`checkJs`). The rules are the TypeScript
preset's, with the type syntax written in JSDoc. A `.ts`, `.mts` or `.cts` file in the same project
follows the full TypeScript rules (no `as`, `enum`, `interface`, `any`, `!`), not this page: install
`nitpicker-typescript` too (`npx skills add jhonDoe15/nitpicker --skill nitpicker-typescript`).

If your change edits a function that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

Before you change code other modules use or fix a bug, read
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
4. Never suppress: no `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, coverage or mutation ignore
   comments (`istanbul`/`c8`/`v8 ignore`, `Stryker disable`), config `exclude`/`disable`/`exceptions`, legacy
   entries, generator markers (`@generated`, `DO NOT EDIT`) in files you wrote, or weakened tests. If a finding seems wrong, stop and ask. Never pass `--accept-policy-change` or set
   `NITPICKER_ACCEPT_POLICY_CHANGE`: a `nitpicker-config/policy-loosened` finding is for a person to
   accept.
5. Code that is right despite a rule: each message ends with the `exceptions` entry that would
   accept it (`If this is intended, add {...} to "exceptions" in nitpicker.config.json.`). That
   entry is for a human reviewer. Never add one, and never fill in its
   `reason`, to get past the gate: stop and ask a human, and quote the finding with its entry. A
   TypeScript compiler error has no entry; fix the type.

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/main/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Layout

- A feature is `src/main/features/<name>/` with an `index.js` (`index.mjs` or `index.cjs` also
  work). Import another feature only through its index, from `domain/` too. Declare the types your
  task defines in your feature.
- A type another feature needs is a `@typedef` in its index; the importer uses `@import`:
  `/** @typedef {import('./domain/tally.js').Invoice} Invoice */` in `invoices/index.js`, then
  `/** @import { Invoice } from '../../invoices/index.js' */` in the other feature. Never copy a
  type: import it, or derive it from a function you call (`Parameters<typeof runGreeting>[1]`).
- `adapters/` does I/O and parses untrusted input (files, HTTP bodies, JSON) once, with the project's
  validation library (zod if it has none; add it then). Field rules and conversions live in the schema
  (`z.string().trim().min(1)`, `z.email()`, `z.iso.date()`, `.transform(toCents)`), never
  `z.unknown()` fields plus hand checks. A JSON list is `z.array(recordSchema)`; the issues'
  `path` (`[index, field]`) names the bad record: `issues.map((issue) => issue.path.join('.'))`.
- `domain/` is pure and takes parsed, typed values, never `unknown`. Decisions go here. No I/O or
  `process`; time, IDs and randomness are parameters. Code that drives injected async deps
  (retries, worker pools, abort) is `adapters/`; the decisions it needs are domain functions.
- `src/main/composition-root.mjs` (or `main`/`server`) only passes things in, through named
  functions. A new feature is a new directory, never a new `if`, `?:` or `??` in a shared entry
  point: lookups and their missing-value checks go in the feature's `adapters/`.
- Shared code lives in `src/main/shared/` and does not import features.
- Export only what another module imports: an exported function or `@typedef` that nothing imports
  fails dead-code.
- Don't put `x.js` beside `x.ts` in one directory: TypeScript drops the `.js`. `.jsx` and `.tsx` are
  outside the preset, and so is React: a React project uses the typescript preset (`react` in
  `nitpicker.config.json` is an error here).
- Follow neighbouring signatures (parameter order, naming) and reuse helpers that exist. Match the
  module format of the files around you (ESM `import`/`export`, or CommonJS where the project is).

## Dependencies and files

- The gate fails unlisted, unused and unresolved dependencies, production imports of a
  `devDependency`, and committed secrets, binaries, build output and files over 1 MB; each message
  names the fix. Don't add an `exceptions` entry to get past one: stop and ask.

## Types are JSDoc

JSDoc holds types only, never prose. Allowed tags: `@param`, `@property` (`@prop`), `@typedef`,
`@returns` (`@return`), `@type`, `@satisfies`, `@extends` (`@augments`), `@this`, `@callback`,
`@template`, `@import`, `@overload`. Anything else (`@throws`, `@private`, `@example`, a description
line) is a finding.

- Annotate every function: a `@param {Type} name` for each parameter and a `@returns {Type}`.
  Optional is `@param {string} [label]`.
- A named type is a `@typedef`, a string-literal union, never an enum:
  `@typedef {'paid' | 'open' | 'void'} Status`. An object type is
  `@typedef {{ readonly id: string; readonly cents: number }} Invoice`. Keep each line within 120
  characters: split a long union into named typedefs and join them
  (`@typedef {Parsed | Invalid | { readonly kind: 'malformed-json' }} ParseResult`).
- Bring a type in with `@import { Invoice } from '../domain/tally.js'`; there is no `import type`.
- A value whose type can't be inferred gets a one-line `/** @type {string[]} */` above its `const`.
  A literal that must stay narrow is `/** @type {const} */ ([...])`; that is the one allowed cast.
- No cast `/** @type {T} */ (value)`, the JSDoc `as`. Narrow with checks, parse with the project's validation library, or type the
  value correctly where it is made. There is no `!`.
- No `any`, `*` or a bare `?` in a type. No `null`, `?T` or `T?`: absent is `undefined`
  (`{ readonly note: string | undefined }`).
- No `unknown` in `@param` or `@property`, and none inside an object type or function parameter of
  `@returns`, `@type`, `@typedef`, `@satisfies` or `@this`. Parsing `unknown` input is `adapters/`
  work; it is not a domain type.
- No handwritten guard: no `@returns {x is T}` or `asserts`. Narrow with `kind` checks or a schema.
- `@satisfies {Type}` checks a value against a type without widening it.

## Write it this way

- `function` declarations for named functions, nested helpers too; arrows only as callbacks, with a block body when
  they return nothing: `(line) => { out.push(line); }`.
- String-literal unions, never an enum; no classes except `Error` subclasses.
- No `any` and no `null` in your own values: read a library's `null` with `regex.exec(s)?.[0]` in
  one expression or a strict `!== null` check. Narrow with checks, and don't add `??`, `?.` or
  checks the types already rule out. Indexing (`list[0]`, `record[key]`) may be `undefined`: check
  the value you got.
- `===` only. Early returns, no `else` after `return`, no nested ternaries, exhaustive `switch`
  over unions, with no `default`.
- `const` or `let`, never `var`. Rest parameters (`...args`) instead of `arguments[i]`, and spread
  instead of `.apply`.
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
- Named exports only (`export function`, `export { x } from`); no `export default`. No comments;
  JSDoc type tags are the exception.
- Signatures: a value with three states is a union of string literals, not `{boolean|undefined}`,
  `{boolean=}` or a `@param {boolean} [force]` with no default (the type-aware rules read your
  JSDoc types, so write them); default only `undefined` with `??`, never `||` on an optional parameter that can be `0`, `''` or
  `false`; return a
  new array, `Set`, `Map` or object instead of changing a parameter (`[...items, item]`,
  `items.toSorted()`). When code moves, change every caller and delete the old name: no
  `@deprecated` declaration and no `export const Old = New` alias.
- CommonJS is allowed: `require()` of a module, and `module.exports = { f }`, `module.exports.f = f`
  or `exports.f = f`. In `domain/`,
  destructure a `require`: `const { basename } = require('node:path');`, not
  `const path = require('node:path');`.

## domain/ is deeply readonly

- `const` only, no loops, no mutation: use `map`, `filter`, `flatMap`, `reduce` with an initial
  value, `toSorted`. Text parsing (CSV lines, tokens) is domain logic too:
  `Array.from(line).reduce(step, initial)`; a value a schema can check (a date, a number) is
  checked by the schema in `adapters/`.
- Every parameter and result is typed readonly, callbacks included: `@param {readonly Invoice[]}`,
  `@returns {readonly Total[]}`, `@property`s marked `readonly`. A non-readonly type is a
  `prefer-immutable-types` finding, and so is a mutable module-level value. A local inside a
  function needs no annotation, but still isn't mutated: build a new `Set`, `Map` or `Date` instead
  of calling `add`, `set` or `setHours`.
- A callback that returns an object literal can't carry a type, so make it a module-level function
  with `@returns {Total}` and pass it: `statuses.map((status) => totalFor(xs, status))`. A reducer is
  the same: `xs.reduce(addInvoice, none)`, with `addInvoice` taking and returning the readonly type.
  Return readonly results as they are; don't spread-copy them.
- No module-level `RegExp` or zod schema (both are mutable): write the regex literal inside the
  function; schemas live in `adapters/`. Dedupe with `[...new Set(xs)]` or a `ReadonlySet`.
- A `Date` is mutable: use it in one expression (`new Date(ms).getUTCHours()`) or type it
  `Readonly<Date>`.
- Count by a union as `Readonly<Record<Status, number>>` with one `reduce` from a literal with every
  member, so a new member fails type-checking:
  ```js
  /** @type {Readonly<Record<Status, number>>} */
  const none = { paid: 0, open: 0, void: 0 };
  return invoices.reduce(addInvoice, none);
  ```
  Group by key with `[...new Set(xs.map(key))]` and `filter`.
- Variants of one union share one array type (`readonly Share[]` in each).
- `module.exports` assignment is not mutation and may stay; every other property assignment is.

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

- Tests are files in `test/` (`*.test.js`, `.mjs`) for the project's runner (Vitest, Jest,
  `node:test` or Mocha). A Vitest test must `import` from `'vitest'`: `require('vitest')` fails, so
  it is ESM even when the code it tests is CommonJS:
  `import { initials } from '../src/main/features/greeting/domain/initials.cjs';`.
- Every branch you add needs a test: changed-branch coverage and mutation testing run on your
  change. Test each outcome of each union.
- Keep an assertion unless another test covers the same behaviour.
- A test run that prints new `console.error` or `console.warn` output fails
  (`test-console-output`): cancel the timer or subscription in the cleanup.
- Test features through their `index.js` with fakes: plain functions returning
  `Promise.resolve(x)` / `Promise.reject(error)`; a non-Error rejection is
  `vi.fn().mockRejectedValue(42)`. Read a fake's calls through a helper that throws when the call is missing, not
  `calls[n]?.`. Spy on `process.stdout` only to test composition-root wiring, and give it a real temp
  file (`mkdtemp`) rather than `vi.mock` of `node:` modules. The gate restores spies; restore fake
  timers with `vi.useRealTimers()` in `afterEach`.
- Test data typed from a literal widens (`status: string`): write the array as
  `/** @type {const} */ ([...])`, or annotate the `const` with the typedef.
- Assert whole outputs with `toEqual`/`toBe`, not `toContain`, `toMatchObject` or `expect.any`.
  Write `expect` in the test body; asserting helpers don't count. Do not assert inside a loop,
  `forEach` or `map` callback: an empty collection passes without asserting, so assert the whole
  collection (`expect(orders).toEqual([...])`) and put cases in `it.each`
  (`nitpicker/no-assertion-in-loop`). The rules above (`for...of` only, no `.then()`, no casts) apply
  to tests too.
- Assert the value, not that something is there (`nitpicker/no-weak-assertion`): no `not.toBe(null)`,
  `expect(x.length).toBeGreaterThan(0)`, `assert.ok(x.length)` or `toHaveBeenCalledWith(expect.anything())`
  as the whole check; assert the exact value, contents or length and the call's arguments. `assert(x != null)`
  is fine when the test then uses `x`.
- Tests assert exact values and are deterministic and fast; each finding names the allowed form.
- A shared helper (stdout capture) lives once, in a non-test file such as `test/support/lines.js`, or in a `test-support/` folder beside the code when the tests sit next to it.
  When an existing test defines the same helper, make it import the shared one.
- A surviving mutant no input can kill means the code is redundant: delete or restructure it.
  Don't pin call order or messages just to kill it. If an input can kill it, add that test (a
  padded value for a `.trim()`, two bad fields for a `join`); never delete a schema rule to silence it.
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
  `*.integration.test.js`, folders counted under the test roots). Use fake timers instead of waits
  and fakes instead of network or disk. A test over budget is run again alone without coverage and
  fails only if it is still over. A slow test you did not touch stays baselined.
