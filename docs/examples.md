# Worked examples

The common tasks, each with the command and what it prints. The output blocks are rendered by
nitpicker's own console renderer for a fixed sample of findings, and a test checks that they match
(`npm run gen:checks` rewrites them), so they show the current layout. [Using nitpicker](usage.md)
is the reference for every flag and report.

## Check a change

`npx nitpicker` compares your checkout (committed, staged, unstaged and untracked changes) with the
merge base of the default base and fails only for what the change adds. It exits 0 when the change
adds nothing, 1 when it adds a problem and 2 when a tool failed or the command line is wrong.

<!-- example:typescript-clean -->

```console
$ npx nitpicker
Quality gate summary
✓ No new enforceable violations
Full diagnostics: reports/quality/diff/combined/report.txt
```

When nothing changed since the base, no analyzer runs:

<!-- example:no-changes -->

```console
$ npx nitpicker
No changes since main (3f9c2a71b0d4); nothing to check.
```

To compare with another ref, pass `--base`. `npx nitpicker base` prints the base a run would use
without running anything, so a CI script can fetch it first:

```sh
npx nitpicker --base origin/develop
npx nitpicker base
```

In CI, fetch enough history to contain the merge base (`fetch-depth: 0` on GitHub Actions) and run
`npx nitpicker` as a step; [nitpicker in CI](ci.md) has the recipes. A pull request run takes the
base from the CI variable of the target branch, and the `Base:` line of the run names where the base
came from. When no base can be found the run stops with
[no base could be determined](troubleshooting.md#no-base-could-be-determined): pass `--base <ref>`,
set `"base"` in `nitpicker.config.json`, or use `--all` once (see
[Check the whole project](#check-the-whole-project)).

## First run on TypeScript

```sh
npm install --save-dev nitpicker typescript @types/node
npx nitpicker
```

A failing run lists each violated rule once, with its advice, the places and the `exceptions` entry
that would accept it, in the order to fix them (format, type check, lint, structure, then tests,
coverage, CRAP and mutation). This is the sample of the [README](../README.md): one new file with a
swallowed error, a cast and a test that cannot fail.

<!-- example:typescript-failing -->

```console
$ npx nitpicker
Quality gate summary
✖ 4 new enforceable violations
  by area: lint 3 · mutation 1
  eslint-lint/nitpicker/no-handwritten-boundary-guard: Pass `JSON.parse(text)` straight into `schema.safeParse(...)` inside the same `try`. An exception fits only when the text is trusted and already typed.
    src/main/features/greeting/adapters/load-names.ts:6:18
    If this is intended, add {"rule":"nitpicker/no-handwritten-boundary-guard","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  eslint-lint/no-restricted-syntax: Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.
    src/main/features/greeting/adapters/load-names.ts:6:18
    If this is intended, add {"rule":"no-restricted-syntax","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  eslint-errors/nitpicker/no-silent-catch: This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended.
    src/main/features/greeting/adapters/load-names.ts:8:5
    If this is intended, add {"rule":"nitpicker/no-silent-catch","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  mutation/mutant-survived: Survived ArrayDeclaration at column 12: replacing `[]` with `["Stryker was here"]` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.
    src/main/features/greeting/adapters/load-names.ts:9
    If this is intended, add {"rule":"mutant-survived","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
Full diagnostics: reports/quality/diff/combined/report.txt
```

Fix the code the way the advice says. Do not add the `exceptions` entry to get past the gate: it is
for a reviewer, when the code is right despite the rule (see
[Decide on an exception](#decide-on-an-exception)).

## First run on a Java project

`npx nitpicker init` detects the build tool and writes `nitpicker.config.json` with
`{ "preset": "java" }`; it prints the peers and the skill to add. Then run `npx nitpicker`. A Java
project needs no `package.json`.

```sh
npx nitpicker init
npx nitpicker
```

Gradle and Maven print the same summary. The difference is the build the run starts on the merge
base and on head: the project's `./gradlew` or `./mvnw` when there is one, otherwise `gradle` or
`mvn` from the `PATH` (`NITPICKER_GRADLE` and `NITPICKER_MAVEN` override both). A failing run for a
class with an unused field:

<!-- example:java-failing -->

```console
$ npx nitpicker
Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField: Avoid unused private fields such as total.
    src/main/java/shop/Order.java:7:21
    If this is intended, add {"rule":"pmd/UnusedPrivateField","paths":["src/main/java/shop/Order.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.
Full diagnostics: reports/quality/diff/combined/report.txt
```

Kotlin on Gradle or Maven works the same with `"preset": "kotlin"`. Python, Go and JavaScript take
`"preset": "python"`, `"go"` or `"javascript"`; their output has the same layout with their own
tools and rules. The guides for [Java](java-preset.md), [Kotlin](kotlin-preset.md),
[Python](python-preset.md) and [Go](go-preset.md) list what each project provides.

## Iterate on one area, then finish with a full run

`--analyzer <name>` runs one analyzer and the analyzers it depends on, which is faster while you work
on one kind of finding. The summary says so, and the exit code is not a pass:

<!-- example:analyzer-run -->

```console
$ npx nitpicker --analyzer eslint-errors
Quality gate summary
✖ 1 new enforceable violation
  eslint-errors/nitpicker/no-silent-catch: This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended.
    src/main/features/greeting/adapters/load-names.ts:8:5
    If this is intended, add {"rule":"nitpicker/no-silent-catch","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
Ran only: eslint-errors. Run nitpicker without --analyzer before you finish.
Full diagnostics: reports/quality/diff/combined/report.txt
```

`--quick` skips the tests and the checks built on them and prints what it left out. Finish with
`npx nitpicker` without `--quick` or `--analyzer`; the loop is described in
[The fix loop](usage.md#the-fix-loop).

## Read one rule, or every message in full

`--rule <substring>` lists the findings whose rule contains the text, after the summary. It filters
what is listed, not what runs: every analyzer still runs. Use `--analyzer` to run less.

<!-- example:rule-filter -->

```console
$ npx nitpicker --rule no-silent-catch
Quality gate summary
✖ 2 new enforceable violations
  by area: lint 1 · mutation 1
  eslint-errors/nitpicker/no-silent-catch: This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended.
    src/main/features/greeting/adapters/load-names.ts:8:5
    If this is intended, add {"rule":"nitpicker/no-silent-catch","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  mutation/mutant-survived: Survived ArrayDeclaration at column 12: replacing `[]` with `["Stryker was here"]` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.
    src/main/features/greeting/adapters/load-names.ts:9
    If this is intended, add {"rule":"mutant-survived","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
Full diagnostics: reports/quality/diff/combined/report.txt

Findings matching --rule no-silent-catch:

  New:
eslint-errors/nitpicker/no-silent-catch src/main/features/greeting/adapters/load-names.ts:8 This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended. If this is intended, add {"rule":"nitpicker/no-silent-catch","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
```

`--details` prints every finding with its full message, one entry per place, instead of grouping them
by rule:

<!-- example:details -->

```console
$ npx nitpicker --details
Quality gate summary
✖ 4 new enforceable violations
  by area: lint 3 · mutation 1
  eslint-lint/nitpicker/no-handwritten-boundary-guard src/main/features/greeting/adapters/load-names.ts:6
    Pass `JSON.parse(text)` straight into `schema.safeParse(...)` inside the same `try`. An exception fits only when the text is trusted and already typed. If this is intended, add {"rule":"nitpicker/no-handwritten-boundary-guard","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  eslint-lint/no-restricted-syntax src/main/features/greeting/adapters/load-names.ts:6
    Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed. If this is intended, add {"rule":"no-restricted-syntax","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  eslint-errors/nitpicker/no-silent-catch src/main/features/greeting/adapters/load-names.ts:8
    This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended. If this is intended, add {"rule":"nitpicker/no-silent-catch","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
  mutation/mutant-survived src/main/features/greeting/adapters/load-names.ts:9
    Survived ArrayDeclaration at column 12: replacing `[]` with `["Stryker was here"]` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears. If this is intended, add {"rule":"mutant-survived","paths":["src/main/features/greeting/adapters/load-names.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.
Full diagnostics: reports/quality/diff/combined/report.txt
```

## Read the reports when the console output is cut off

A run writes its reports to `reports/quality/diff/` under the project (`--output <dir>` changes the
folder, and a relative `<dir>` is relative to the project, not to the current folder). Start with
`report.txt`; `new-findings.json` has each new finding with its rule, path, location and message, and
`allowedForm` where the rule states one; `tool-errors.json` has the tool errors, whatever the exit
code.

```sh
sed -n 1,60p reports/quality/diff/report.txt
```

[Reports](usage.md#reports) lists every file.

## Check the whole project

`npx nitpicker --all` reports every finding in the checkout with no baseline, for example before you
adopt nitpicker on existing code. It exits 1 on any violation, so use it to look, not as the check
for a change. `--all` takes files or folders (`npx nitpicker --all src/orders`). It writes to
`reports/quality/snapshot/`.
[Adopting nitpicker on existing code](usage.md#adopting-nitpicker-on-existing-code) describes how to
go from there to a gate that only fails new problems.

## Look a rule up

`npx nitpicker explain <tool/rule>` prints what the rule reference says about a rule: the presets that
report it, why it is on, the allowed form and the `exceptions` entry. Name a rule as a finding prints
it:

```sh
npx nitpicker explain eslint-errors/nitpicker/no-silent-catch
npx nitpicker explain pmd/UnusedPrivateField
npx nitpicker rules
```

`npx nitpicker rules` lists the rules of the project's preset.

## Decide on an exception

Every finding ends with the `exceptions` entry that would accept it. It names the rule, the paths and
a `reason` for a reviewer to fill in. Fix the code when the advice fits. Use an entry only when the
code is right despite the rule, for example when the rule says dropping the error is fine only when
it is intended and it is. Review sees the entry, and every report lists it. A coding agent never adds
one; it stops and asks.
