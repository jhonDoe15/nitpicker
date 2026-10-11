---
name: nitpicker
description: Write TypeScript the nitpicker way and pass its gate first try. Use before writing or changing code in a project that has nitpicker installed.
---

# nitpicker

nitpicker allows one way to write each construct. Write it that way from the start; the gate is
a backstop, not a guide. It fails only on findings your change adds.

## Run it

- `npx nitpicker` checks your change against the merge base. It runs mutation testing on the lines
  you changed and can take minutes, printing nothing until it ends. Run it once the change is complete,
  as a background command you wait on. Don't pipe it: you need its exit code.
- `npx nitpicker --fix` applies ESLint and Prettier fixes, then runs the full check. Make it
  your one run. Format with it, not plain `prettier`: the gate has its own Prettier config.
- Exit 0: done. Exit 1: new findings, fix and rerun. Exit 2: a tool failed; read the tool
  error, fix the cause (usually a missing package), rerun. Exit 2 is never a pass.
- Never suppress: no `eslint-disable`, `@ts-ignore`, config `exclude`/`disable`, legacy
  entries, or weakened tests. If a finding seems wrong, stop and ask.

## Layout

- A feature is `src/main/features/<name>/` with an `index.ts`. Import another feature only
  through its `index.ts`. Export only what the task names. Need a type that index doesn't
  export? Derive it, e.g. `type Writer = Parameters<typeof runGreeting>[1];`, don't copy it.
- `domain/` is pure: no I/O, no `process`, no adapters imports. Time, IDs and randomness are
  parameters. Parsing and decisions go here. `adapters/` does I/O, calls `domain/`, and is
  where you call another feature (`import { runGreeting } from '../../greeting/index.js'`).
- Wire features in `src/main/composition-root.ts`. A new feature is a new directory, never a
  new branch in a shared entry point.

## Write it this way

- `function` declarations for named functions; arrows only as callbacks. An arrow that returns
  nothing gets a block body: `(line) => { out.push(line); }`.
- `type`, never `interface`; string-literal unions, never `enum`. No classes except `Error`
  subclasses.
- No `as`, `any`, `!`. Narrow with checks instead. Untrusted input is parsed with zod at the
  boundary.
- Template literals take strings only: `${String(count)}`.
- `===` only. Early returns, no `else` after `return`, no nested ternaries. Exhaustive `switch`
  over unions.
- Don't add `??`, `?.` or checks the types already rule out.
- Loops: `for...of` only. In `domain/`: no loops, no mutation, `const` only; use `map`,
  `filter`, `flatMap`, `reduce` with an initial value.
- Expected failures in `domain/` are returned as discriminated unions
  (`{ kind: 'empty-name' }`), never thrown. Adapters throw only for unexpected failures, with
  `cause`.
- `async`/`await`, never `.then()`. No floating promises.
- Named exports only. No comments.

## Tests

- Every branch you add needs a test: changed-branch coverage and mutation testing run on your
  change. Test each outcome of each union, not just the happy path.
- Test features through their public `index.ts` with a fake writer. Spy on `process.stdout`
  only to test composition-root wiring.
- No per-test git repos, child processes, servers, fixed sleeps, or raised timeouts.
