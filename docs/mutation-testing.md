# Mutation testing scope

Status: Proposed, pending owner review.

## Current scope

The default Stryker config (`languages/typescript/preset/defaults/stryker.config.mjs`) mutates `src/**` code
files (`sourceGlobs` from `languages/typescript/preset/layout.mjs`), minus the shared excluded globs (`dist`, `build`,
`generated`, `node_modules`, `coverage`, `reports`, `target`, `*.d.ts`), `src/**/__tests__/**` and
every test glob. It uses the Stryker runner for the project's test runner (Vitest, Jest, Mocha, or the tap runner
for `node:test`; see [Test runners](usage.md#test-runners)) with the TypeScript checker, `perTest` coverage analysis,
and `thresholds.break: null`, so Stryker itself never fails the run. The differential gate runs it
through `languages/typescript/adapters/quality-areas-runner.mjs`, which rewrites the config, forces the `json`
reporter, and turns `Survived` and `NoCoverage` mutants into findings. `nitpicker --all` mutates
that whole area.

## Scope in a comparison

A comparison mutates only what the change wrote. On the head side, `mutate` becomes one
`<file>:<first>-<last>` line range per changed hunk of a source file (from `git diff --unified=0
--find-renames` between the merge base and the head snapshot); test files, deleted lines and files
outside the source roots are skipped, and a change with no source lines skips Stryker entirely. The
base side runs no mutants: a mutant on a line the change wrote has no counterpart on the base, so
every surviving or uncovered mutant reported is new, which matches the touched-code rule for strict
findings.

When tests fail, mutation runs on the tests that pass. The coverage check writes the test files
that have a failure to `reports/quality/coverage/failing-test-files.json`, and Stryker runs without
those files. The coverage check runs first in a process; when a CI shard runs `mutation` without
`coverage`, there is no list and mutation is skipped as before. Mutants only the left-out tests would have
killed then show as survived or uncovered. Jest cannot leave files out, and a project whose every
test file fails has nothing to run: mutation is skipped with a `tests-failed-skipped` reason.

What this gives up: a change that weakens existing tests, or changes a dependency or config, can
let mutants survive in lines it did not touch, and a comparison does not see them. `--all` (for
example on a schedule) still mutates every source file.

Before this scope, both sides mutated the whole source area. On ufo (1,575 source lines, 1,017
mutants) that took 426 s with the TypeScript checker; the changed lines of a three-line function
(6 mutants) take 18 s.

The Python preset does the same with mutmut's per-mutant results instead of a Stryker file: head
starts from the `mutants/*.meta` files of the base work tree when only added or modified
non-test `.py` files under a source root changed, and runs every mutant after any other change,
including every test change, because mutmut does not re-test results when a test changes. See
[python-preset.md](python-preset.md#reusing-base-results-on-head).

## Question

Should there be an optional, manually run, wider-scope mutation profile?

## Recommendation

Not now. Do not add a second profile in this phase; revisit when a consumer asks for one.

- "Wider" has no obvious target. Everything the preset treats as production code (`src/`) is
  already mutated. The remaining candidates are test helpers, scripts, and config, where surviving
  mutants mostly reflect missing tests of tooling rather than product risk, and mutating tests
  themselves is not what Stryker measures.
- A second profile adds a config file and policy surface that must stay in sync with the layout
  constants, and it would be a path to a report nobody gates on.
- Mutation runs are the slowest analyzer. A wider scope adds cost
  without a decision that depends on the result.
- The gate's own contract is unchanged either way: only the default profile can produce enforceable
  findings. A manual profile would be report-only by construction.

## If it is added later

Keep it cheap and outside the gate:

- A separate `stryker.wide.config.mjs` that spreads the default config and replaces only `mutate`
  (for example adding `scripts/**` or a named workspace package), so it inherits the runner, checker,
  and exclusions.
- Run it manually or on a schedule via Stryker's `--mutate` and `--incremental` options, never from
  the differential gate, and never as a preset default.
- Write its report to `reports/quality/mutation-wide/`, so it cannot be mistaken for the gated
  report, and do not turn its findings into enforceable ones.
- Changing the scope of the default profile instead is a policy change: it alters the policy hash
  and must be a deliberate, reviewed exception.
