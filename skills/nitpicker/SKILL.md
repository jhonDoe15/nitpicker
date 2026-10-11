---
name: nitpicker
description: Write TypeScript the nitpicker way and pass its gate first try. Use before writing or changing code in a project that has nitpicker installed.
---

# nitpicker

nitpicker allows one way to write each construct. Write it that way from the start; the gate is
a backstop, not a guide. It fails only on findings your change adds.

## Run it

- `npx nitpicker` checks your change against the merge base. It runs mutation testing and takes
  minutes, printing nothing until it ends. Run it once the change is complete, as a background
  command you wait on. Don't pipe it: you need its exit code.
- `npx nitpicker --fix` applies ESLint and Prettier fixes, then runs the full check. Make it
  your one run. Format with it, not plain `prettier`: the gate has its own Prettier config.
- Run your tests (`npx vitest run`) first; the gate type-checks for you. Failing tests stop
  coverage, CRAP and mutation from running.
- Exit 0: done. Exit 1: new findings; fix them all (and any tool error listed below them),
  re-read the files `--fix` changed before editing them, then rerun once. Exit 2: no new findings but a tool failed; read the tool error, fix the cause
  (usually a missing package or a failing test), rerun. Exit 2 is never a pass.
- Never suppress: no `eslint-disable`, `@ts-ignore`, config `exclude`/`disable`, legacy
  entries, or weakened tests. If a finding seems wrong, stop and ask.

## Layout

- A feature is `src/main/features/<name>/` with an `index.ts`. Import another feature only
  through its `index.ts`, from `domain/` too: `import type { Tier } from '../../members/index.js'`.
  Never copy a type another feature exports: import it, or derive it from a function you call
  (`type Writer = Parameters<typeof runGreeting>[1];`). A type your task defines is declared in
  your feature.
- Export only what another module imports. An exported type nobody imports fails dead-code;
  callers derive result types with `Awaited<ReturnType<typeof importContacts>>`.
- `adapters/` does I/O and parses untrusted input (files, HTTP bodies, JSON) with zod, once.
  Put field rules in the schema (`z.string().trim().min(1)`, `z.email()`), never
  `z.unknown()` fields plus hand checks. Convert in the schema too (`.transform(toCents)`), so
  `domain/` gets the final value. If zod isn't a dependency, add it.
- `domain/` is pure and gets parsed, typed values, never `unknown`. Decisions go here. No I/O,
  no `process`; time, IDs and randomness are parameters.
- Wire features in `src/main/composition-root.ts` with named functions that only pass things in.
  A new feature is a new directory, never a new branch (`if`, `?:`, `??`) in a shared entry point:
  lookups and their missing-value checks go in the feature's `adapters/`.

## Write it this way

- `function` declarations for named functions; arrows only as callbacks. An arrow that returns
  nothing gets a block body: `(line) => { out.push(line); }`.
- `type`, never `interface`; string-literal unions, never `enum`. No classes except `Error`
  subclasses.
- No `as`, `any`, `!`, `null` (not even in types: `regex.exec(s)?.[0]`). Narrow with checks.
- Template literals take strings only: `${String(count)}`. A string array of IDs, codes or ISO
  dates sorts with `toSorted()` and no comparator; names and titles with
  `a.localeCompare(b, 'en')`. For objects in plain string order, one shared
  `compareText(a, b)` (`if (a < b) return -1; if (a > b) return 1; return 0;`) and tie-breaks
  as `if (a.month !== b.month) return compareText(a.month, b.month);`.
- `===` only. Early returns, no `else` after `return`, no nested ternaries. Exhaustive `switch`
  over unions.
- Don't add `??`, `?.` or checks the types already rule out. Indexing (`list[0]`,
  `record[key]`) may be `undefined`: check the value you got.
- Loops: `for...of` only, no recursion (retries are `for...of` over attempt numbers).
- At most 3 parameters: group related values into one object, or close over `deps` in a factory.
- `async`/`await`, never `.then()`. No floating promises.
- Named exports only. No comments.

## domain/ is deeply readonly

- No loops, no mutation, `const` only; use `map`, `filter`, `flatMap`, `reduce` with an initial
  value, `toSorted`. Text parsing (CSV lines, tokens) is domain logic too:
  `Array.from(line).reduce(step, initial)`.
- Annotate results as readonly: `const owing: readonly Total[] = rows.toSorted(byTotal);`.
  A callback that returns an object or array literal declares a readonly return type. Return
  readonly results as they are; don't spread-copy them.
- No module-level `RegExp` or zod schema (both are mutable): write the regex literal inside the
  function; schemas live in `adapters/`. Dedupe with `[...new Set(xs)]` or a `ReadonlySet`.

## Errors

- Expected failures in `domain/` are returned as discriminated unions
  (`{ kind: 'empty-name' }`), never thrown.
- A `catch` returns a failure result or rethrows an `Error` subclass with `{ cause: error }`.
  Carry the caught error only if something reads it. Keep the `try` around the call that throws:
  `try { return schema.safeParse(JSON.parse(text)); } catch { return { kind: 'malformed-json' }; }`.
- Throw `new XError(message)` without `cause` when there is no caught error.

## Tests

- Every branch you add needs a test: changed-branch coverage and mutation testing run on your
  change. Test each outcome of each union, not just the happy path.
- Test features through their public `index.ts` with fakes. Test doubles are plain functions
  returning `Promise.resolve(x)` / `Promise.reject(error)`; a non-Error rejection is
  `vi.fn().mockRejectedValue(42)`. Spy on `process.stdout` only to test composition-root
  wiring; give it a real temp file (`mkdtemp`) rather than `vi.mock` of `node:` modules. The gate
  restores spies; restore fake timers with `vi.useRealTimers()` in `afterEach`.
- Assert whole outputs with `toEqual`/`toBe`, not `toContain`. Shared helpers (stdout capture)
  live in one non-test file such as `test/support/stdout.ts`, not copied; when an existing test
  defines the same helper, make it import the shared one too.
- A surviving mutant no input can kill means the code is redundant: delete or restructure it.
  Don't pin call order or messages just to kill it.
- No per-test git repos, child processes, servers, fixed sleeps, or raised timeouts.

## Changing existing code

- A function already over a size limit may be edited but must not grow: add one call to a new
  function and put the new code there. To make room, extract the smallest existing block into a
  function; extracted code is new code and must meet every rule. Don't rewrite or move legacy code
  the task doesn't need.
- An edited legacy line may keep a violation the function already had, as long as the function
  doesn't get more of it: change `lines.push(a)` to `lines.push(a, ...extra)` rather than adding
  a second push. Lines you add must meet every rule.
- To read new fields from a legacy `any` value, pass it as `unknown` to one reader that returns
  a typed options object with every field you need, nested ones included. Handle malformed input
  only as the ticket says; don't silently drop entries.
- When a readonly value meets a mutable legacy type, make the type readonly; never drop
  `readonly` from the value.
- Follow neighbouring signatures (parameter order, naming) and reuse helpers that exist.
