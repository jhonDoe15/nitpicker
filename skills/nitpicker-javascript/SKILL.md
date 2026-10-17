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
4. Never suppress: no `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, coverage or mutation ignore
   comments (`istanbul`/`c8`/`v8 ignore`, `Stryker disable`), config `exclude`/`disable`, legacy
   entries, generator markers (`@generated`, `DO NOT EDIT`) in files you wrote, or weakened tests. If a finding seems wrong, stop and ask. Never pass `--accept-policy-change` or set
   `NITPICKER_ACCEPT_POLICY_CHANGE`: a `nitpicker-config/policy-loosened` finding is for a person to
   accept.

## Layout

- A feature is `src/main/features/<name>/` with an `index.js` (`index.mjs` or `index.cjs` also
  work). Import another feature only through its index, from `domain/` too. Declare the types your
  task defines in your feature.
- A type another feature needs is a `@typedef` in its index; the importer uses `@import`:
  `/** @typedef {import('./domain/tally.js').Invoice} Invoice */` in `invoices/index.js`, then
  `/** @import { Invoice } from '../../invoices/index.js' */` in the other feature. Never copy a
  type: import it, or derive it from a function you call (`Parameters<typeof runGreeting>[1]`).
- `adapters/` does I/O and parses untrusted input (files, HTTP bodies, JSON) once, with zod (add it
  if it isn't a dependency). Field rules and conversions live in the schema
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
  outside the preset.
- Follow neighbouring signatures (parameter order, naming) and reuse helpers that exist. Match the
  module format of the files around you (ESM `import`/`export`, or CommonJS where the project is).

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
- No cast `/** @type {T} */ (value)`, the JSDoc `as`. Narrow with checks, parse with zod, or type the
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
  over unions.
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
  extract a function.
- Up to 3 parameters stay positional. Past 3, group related values into one object. A factory's
  inner functions count toward its 50 lines: put helpers at module level and pass `deps` in.
- `async`/`await`, never `.then()`. No floating promises.
- Named exports only (`export function`, `export { x } from`); no `export default`. No comments;
  JSDoc type tags are the exception.
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

- Tests are files in `test/` run by the runner the project uses, found from its `test` script, a
  runner config file or a dependency (Vitest, Jest, `node:test` or Mocha; the examples below are
  Vitest). Name them the way that runner finds them (see the naming below). In a Vitest
  project a test file must `import` from `'vitest'`: `require('vitest')` fails, so a test is ESM
  even when the code it tests is CommonJS:
  `import { initials } from '../src/main/features/greeting/domain/initials.cjs';`.
- Every branch you add needs a test: changed-branch coverage and mutation testing run on your
  change. Test each outcome of each union.
- Test features through their `index.js` with fakes: plain functions returning
  `Promise.resolve(x)` / `Promise.reject(error)`; a non-Error rejection is
  `vi.fn().mockRejectedValue(42)` (`jest.fn()` under Jest, `mock.fn(async () => { throw 42; })`
  under `node:test`, `sinon.stub().rejects(42)` under Mocha with sinon). Read a fake's calls
  through a helper that throws when the call is missing, not `calls[n]?.`. Spy on `process.stdout` only to test composition-root wiring, and give it a real temp
  file (`mkdtemp`) rather than `vi.mock` of `node:` modules (`jest.mock`, `mock.module`,
  `proxyquire`, `esmock` and the other runners' module mocks count too). After each test the gate
  restores spies and stubs: Vitest's and Jest's mocks, the shared `node:test` `mock`
  (`mock.restoreAll()`), and sinon's under Mocha (`sinon.restore()`, when the project has sinon).
  Restore fake timers yourself in `afterEach`: `vi.useRealTimers()` (`jest.useRealTimers()`,
  `mock.timers.reset()`, `clock.restore()` for a sinon clock).
- Test data typed from a literal widens (`status: string`): write the array as
  `/** @type {const} */ ([...])`, or annotate the `const` with the typedef.
- Assert whole outputs with `toEqual`/`toBe` (`assert.deepStrictEqual`/`assert.equal`, chai's
  `expect(x).to.deep.equal`), not `toContain`, `toMatchObject` or `expect.any` (nor
  `assert.ok(text.includes('x'))`, `assert.partialDeepStrictEqual` or chai's `include` and
  `containSubset`). Write the assertion
  (`expect`, or `assert` under `node:test` and Mocha) in the test body; asserting helpers don't
  count. Repeated cases are `it.each`; `node:test` and Mocha have no `it.each`, so there write
  `for (const testCase of cases) { it(testCase.name, () => { ... }); }`, not a loop inside one test.
  Shared setup goes in `beforeAll` (`before` under `node:test` and Mocha). The rules above
  (`for...of` only, no `.then()`, no casts) apply to tests too.
- A shared helper (stdout capture) lives once, in a file the runner does not run as a test, such as
  `test/support/lines.js` (under `node:test` with Node's default patterns every file in `test/` is
  a test: put the helper in `tests/support/`, or name the tests in the script, such as
  `node --test 'test/**/*.test.js'`). When an existing test defines the same helper, make it import
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
- A surviving mutant no input can kill means the code is redundant: delete or restructure it.
  Don't pin call order or messages just to kill it. If an input can kill it, add that test (a
  padded value for a `.trim()`, two bad fields for a `join`); never delete a schema rule to silence it.
- No per-test git repos, child processes, servers, fixed sleeps, or raised timeouts.
