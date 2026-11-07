---
name: nitpicker-typescript
description: Use before writing or changing TypeScript or React code in a project that has nitpicker installed with the typescript preset (the default), so the code follows its one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for TypeScript

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

If your change edits a function, file or folder that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

Before you change code other modules use, fix a bug, or add a UI state, read
[beyond-the-gate.md](beyond-the-gate.md).

## Check one file or folder

To look at one file or folder, for example before you change it, pass its path: `npx nitpicker --all
src/orders` lists every finding in it, and `npx nitpicker src/orders/order.ts` gates only your
change to that file. Paths are read from the current folder. The analysis still covers the whole
project, so it takes as long as a full run; finish with the plain run below.

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
   - 0: done, unless you narrowed the run with `--analyzer`: then the summary says `Ran only: ...`
     and you run the gate again without it before you finish.
   - 1: fix the failing tests the summary leads with, every new finding and any tool error listed
     below them. Re-read the files `--fix`
     changed before editing them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a missing package) and rerun. Exit 2 is never a pass. If it says another run is in progress,
     wait for that run; never kill it.
     When the message links to [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md), the fix is there.
4. Never suppress: no `eslint-disable`, `@ts-ignore`, coverage or mutation ignore comments
   (`istanbul`/`c8`/`v8 ignore`, `Stryker disable`), config `exclude`/`disable`/`exceptions`, legacy entries, generator markers (`@generated`, `DO NOT EDIT`) in files you wrote, or weakened tests. If a finding seems wrong, stop and ask. Never pass `--accept-policy-change` or set
   `NITPICKER_ACCEPT_POLICY_CHANGE`: a `nitpicker-config/policy-loosened` finding is for a person to
   accept.
5. Code that is right despite a rule: each message ends with the `exceptions` entry that would
   accept it (`If this is intended, add {...} to "exceptions" in nitpicker.config.json.`). That
   entry is for a human reviewer. Never add one, and never fill in its
   `reason`, to get past the gate: stop and ask a human, and quote the finding with its entry. A
   TypeScript compiler error has no entry; fix the type.

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Write it this way

The allowed forms are on one page per topic. Before you write code, read the pages for the kind of code you are about to write; on your first task in a project, read them all.

- [Layout, size and dependencies](rules/layout.md): features, adapters, domain and the composition root, exports, source roots, file and folder limits, clones, dependencies.
- [Functions, types and expressions](rules/style.md): function declarations, types and unions, no casts or null, comparisons, template literals, sorting, loops, parameters, exports, signatures.
- [Async code, I/O and production rules](rules/production.md): async/await, bounded fan-out, wiring, parsing input, child processes, URLs, regexes, server time zones, exceptions.
- [domain/ is deeply readonly](rules/domain.md): no mutation, readonly types, regexes and `Date`, counting by a union, one-pass results.
- [Errors](rules/errors.md): failures as unions, what a catch returns, error causes, malformed input.
- [Tests](rules/tests.md): branch coverage and mutants, console output, fakes, globals, whole-output assertions, shared helpers, test roots, waits, child processes, fast tests.
- [React](rules/react.md): component tests, hooks and the other React rules, when `react` is in `package.json`.
