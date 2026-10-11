---
name: nitpicker
description: Use before writing or changing TypeScript in a project that has nitpicker installed, so the code follows its one allowed style and passes `npx nitpicker` on the first run. Not for Java projects (`"preset": "java"`).
---

# nitpicker

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

If your change edits a function that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

## Finish with the gate

1. Run your tests (`npx vitest run`). Failing tests stop coverage, CRAP and mutation from running.
   The gate type-checks for you.
2. When the change is complete, run `npx nitpicker --fix` as a background command you wait on,
   without a pipe: you need its exit code. It applies ESLint and Prettier fixes with its own
   configs (don't format with plain `prettier`), then checks your change against the merge base. It
   takes minutes and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done.
   - 1: fix every new finding and any tool error listed below them. Re-read the files `--fix`
     changed before editing them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a failing test or a
     missing package) and rerun. Exit 2 is never a pass. If it says another run is in progress,
     wait for that run; never kill it.
4. Never suppress: no `eslint-disable`, `@ts-ignore`, config `exclude`/`disable`, legacy entries,
   or weakened tests. If a finding seems wrong, stop and ask.

## Layout

- A feature is `src/main/features/<name>/` with an `index.ts`. Import another feature only through
  its `index.ts`, from `domain/` too: `import type { Tier } from '../../members/index.js'`. Never
  copy a type another feature exports: import it, or derive it from a function you call
  (`Parameters<typeof runGreeting>[1]`). Declare the types your task defines in your feature.
- Export only what another module imports; an exported type nobody imports fails dead-code.
  Callers derive result types: `Awaited<ReturnType<typeof importContacts>>`.
- `adapters/` does I/O and parses untrusted input (files, HTTP bodies, JSON) once, with zod (add it
  if it isn't a dependency). Field rules and conversions live in the schema
  (`z.string().trim().min(1)`, `z.email()`, `.transform(toCents)`), never `z.unknown()` fields
  plus hand checks.
- `domain/` is pure and takes parsed, typed values, never `unknown`. Decisions go here. No I/O or
  `process`; time, IDs and randomness are parameters.
- `src/main/composition-root.ts` only passes things in, through named functions. A new feature is
  a new directory, never a new `if`, `?:` or `??` in a shared entry point: lookups and their
  missing-value checks go in the feature's `adapters/`.
- Follow neighbouring signatures (parameter order, naming) and reuse helpers that exist.

## Write it this way

- `function` declarations for named functions; arrows only as callbacks, with a block body when
  they return nothing: `(line) => { out.push(line); }`.
- `type`, never `interface`; string-literal unions, never `enum`; no classes except `Error`
  subclasses.
- No `as`, `any` or `!`, and no `null` in your own types or values: read a library's `null` with
  `regex.exec(s)?.[0]` or a strict `!== null` check. Narrow with checks, and
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
- At most 3 parameters: group related values into one object, or close over `deps` in a factory.
- `async`/`await`, never `.then()`. No floating promises.
- Named exports only. No comments.

## domain/ is deeply readonly

- `const` only, no loops, no mutation: use `map`, `filter`, `flatMap`, `reduce` with an initial
  value, `toSorted`. Text parsing (CSV lines, tokens) is domain logic too:
  `Array.from(line).reduce(step, initial)`.
- Annotate results as readonly (`const owing: readonly Total[] = rows.toSorted(byTotal);`), and
  give a callback that returns an object or array literal a readonly return type. Return readonly
  results as they are; don't spread-copy them.
- No module-level `RegExp` or zod schema (both are mutable): write the regex literal inside the
  function; schemas live in `adapters/`. Dedupe with `[...new Set(xs)]` or a `ReadonlySet`.

## Errors

- `domain/` returns expected failures as discriminated unions (`{ kind: 'empty-name' }`), never
  throws them.
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
  `vi.fn().mockRejectedValue(42)`. Spy on `process.stdout` only to test composition-root wiring,
  and give it a real temp file (`mkdtemp`) rather than `vi.mock` of `node:` modules. The gate
  restores spies; restore fake timers with `vi.useRealTimers()` in `afterEach`.
- Assert whole outputs with `toEqual`/`toBe`, not `toContain`.
- A shared helper (stdout capture) lives once, in a non-test file such as `test/support/stdout.ts`.
  When an existing test defines the same helper, make it import the shared one.
- A surviving mutant no input can kill means the code is redundant: delete or restructure it.
  Don't pin call order or messages just to kill it. If an input can kill it, add that test; never
  delete a schema rule to silence it.
- No per-test git repos, child processes, servers, fixed sleeps, or raised timeouts.
