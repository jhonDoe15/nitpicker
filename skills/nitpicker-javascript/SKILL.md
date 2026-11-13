---
name: nitpicker-javascript
description: Use before writing or changing JavaScript in a project that runs nitpicker with the javascript preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for JavaScript

Written for nitpicker 0.1.0-rc.2. If `npx nitpicker --version` prints another version, reinstall
this skill with the command `npx nitpicker init` prints.

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

This is for `"preset": "javascript"` in `nitpicker.config.json`: plain `.js`, `.mjs` and `.cjs` files
whose types are written as JSDoc and checked by TypeScript (`checkJs`). The rules are the TypeScript
preset's, with the type syntax written in JSDoc. A `.ts`, `.mts` or `.cts` file in the same project
follows the full TypeScript rules (no `as`, `enum`, `interface`, `any`, `!`), not this page: install
`nitpicker-typescript` too, with the command `npx nitpicker init` prints and `--skill nitpicker-typescript`.

If your change edits a function, file or folder that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

Before you change code other modules use or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md).

## Check one file or folder

To look at one file or folder, for example before you change it, pass its path: `npx nitpicker --all
src/orders` lists every finding in it, and `npx nitpicker src/orders/order.js` gates only your
change to that file. Paths are read from the current folder. The analysis still covers the whole
project, so it takes as long as a full run; finish with the plain run below.

## Finish with the gate

While you iterate, run `npx nitpicker --quick`: it skips the tests and the checks built on them;
read the printed skipped list for what it left out. A quick run is never a pass; finish with the
full run below.

1. Run your tests with the project's runner (its `test` script). Failing tests stop coverage, CRAP
   and mutation from running.
   The gate type-checks for you. Node globals (`process`, `AbortSignal`) and `node:` imports need
   `@types/node` in devDependencies.
2. When the change is complete, run `npx nitpicker --fix` as a background command you wait on,
   without a pipe: you need its exit code. It applies ESLint fixes, single ESLint suggestions of
   reviewed rules, safe TypeScript code fixes, knip's removal of unused exports, types and
   dependencies, and Prettier fixes with its own
   configs (don't format with plain `prettier`; its quotes, semicolons, indentation and width follow
   most of the project's files), then checks your change against the merge base. It
   takes minutes and prints a progress line for each slow analyzer.
   To look at the fixes first, run `npx nitpicker --fix --dry-run`: it changes no file and writes
   `fix.patch` and `fixes.json` to the output folder. `--fix --rule <tool/rule>` applies only the
   fixes of the rules you name, including their `review` recipes.
3. Act on the exit code:
   - 0: done, unless you narrowed the run with `--analyzer`: then the summary says `Ran only: ...`
     and you run the gate again without it before you finish.
   - 1: fix the failing tests the summary leads with, every new finding and any tool error listed
     below them. Re-read the files `--fix`
     changed before editing them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a missing package) and rerun. Exit 2 is never a pass. If it says another run is in progress,
     wait for that run; never kill it.
     When the message links to [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md), the fix is there.
4. Never suppress: no `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, coverage or mutation ignore
   comments (`istanbul`/`c8`/`v8 ignore`, `Stryker disable`), config `exclude`/`disable`/`exceptions`, legacy
   entries, generator markers (`@generated`, `DO NOT EDIT`) in files you wrote, or weakened tests. If a finding seems wrong, stop and ask. Never pass `--accept-policy-change`, set `NITPICKER_ACCEPT_POLICY_CHANGE`
   or add the `accept-policy-change` label: a `nitpicker-config/policy-loosened` finding is for a person to
   accept.
5. Code that is right despite a rule: each message ends with the `exceptions` entry that would
   accept it (`If this is intended, add {...} to "exceptions" in nitpicker.config.json.`). That
   entry is for a human reviewer. Never add one, and never fill in its
   `reason`, to get past the gate: stop and ask a human, and quote the finding with its entry. A
   TypeScript compiler error has no entry; fix the type.

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Write it this way

The allowed forms are on one page per topic. Before you write code, read the pages for the kind of code you are about to write; on your first task in a project, read them all.

- [Layout, size and dependencies](rules/layout.md): features, adapters, domain and the composition root, shared code, exports, file and folder limits, clones, dependencies.
- [Types are JSDoc](rules/types.md): allowed tags, annotations, typedefs, imports of types, no casts, any or null, narrowing.
- [Functions, values and modules](rules/style.md): function declarations, unions, comparisons, declarations, sorting, loops, parameters, async code, fan-out, child processes, exports, signatures, CommonJS, server time zones.
- [domain/ is deeply readonly](rules/domain.md): no mutation, readonly types, regexes and `Date`, counting by a union, one-pass results.
- [Errors](rules/errors.md): failures as unions, what a catch returns, error causes, malformed input.
- [Tests](rules/tests.md): test files, branch coverage and mutants, console output, fakes, globals, typed test data, whole-output assertions, shared helpers, waits, child processes, fast tests.
