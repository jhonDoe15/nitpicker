# Mutation testing scope

Status: Proposed, pending owner review.

## Current scope

The default Stryker config (`languages/typescript/preset/defaults/stryker.config.mjs`) mutates `src/**` code
files (`sourceGlobs` from `languages/typescript/preset/layout.mjs`), minus the shared excluded globs (the root folders `dist`, `build`,
`generated`, `coverage`, `reports` and `target`, `node_modules` at any depth, and `*.d.ts`), `src/**/__tests__/**`, `src/**/test-support/**` when tests sit next to sources, and
every test glob. It uses the Stryker runner for the project's test runner (Vitest, Jest, Mocha, or the tap runner
for `node:test`; see [Test runners](usage.md#test-runners)) with the TypeScript checker, `perTest` coverage analysis,
and `thresholds.break: null`, so Stryker itself never fails the run. The differential gate runs it
through `languages/typescript/adapters/quality-areas-runner.mjs`, which rewrites the config, forces the `json`
reporter, and turns `Survived` and `NoCoverage` mutants into findings. A mutant that a `Stryker
disable` comment would hide is reported as an enforceable `mutant-ignored` finding too, so the comment
cannot be used to switch mutation off, not even for a path with a `nitpicker/no-comments` exception.
Code that must stay out of mutation testing gets a reviewed `exceptions` entry for `mutant-ignored`
with its paths in `nitpicker.config.json` instead; that entry is the only way to lift the finding.
`nitpicker --all` mutates that whole area.

## Scope in a comparison

A comparison mutates only what the change wrote. On the head side, `mutate` becomes one
`<file>:<first>-<last>` line range per changed hunk of a source file (from `git diff --unified=0
--find-renames` between the merge base and the head snapshot); test files, deleted lines and files
outside the source roots are skipped, and a change with no source lines skips Stryker entirely. The
base side runs no mutants: a mutant on a line the change wrote has no counterpart on the base, so
every surviving or uncovered mutant reported is new, which matches the touched-code rule for strict
findings.

### Changed tests

When the change adds, edits, renames or deletes a test file, head also mutates, whole, every
production module that a changed test imports directly (read with TypeScript's `preProcessFile`
from the head version of the test, and from the base version for an edited, renamed or deleted
test). A test renamed without a content change (`R100`) does not count. A changed file in the test
area that is not itself a test, such as `test/support/assert.ts`, counts through the tests that
import it, directly or through other test-area files. Imports resolve with TypeScript's module
resolution and the project's `tsconfig.json` (or `jsconfig.json`), so relative paths, `paths`
aliases such as `@/` and `baseUrl` imports are followed, including settings inherited through
`extends` and those of the configs listed in `references` (the usual Vite layout keeps `paths` in
`tsconfig.app.json`). Without a config the bundler resolution applies. A module the test reaches
through re-exports (`export * from`, `export { x } from`, as in a feature's `index.ts`) counts too,
up to three re-exports deep. Packages, an alias that points into `node_modules` included, and
modules reached only through another module's imports are not followed. A module that exists on
only one side is skipped, and a module that is also a changed source file is mutated whole instead
of by its changed lines.

At most ten modules are mutated this way: the ones the changed tests import directly first, then
those reached through re-exports, so a test that imports a top-level `src/index.ts` cannot make
the run mutate the whole source tree. The modules over the cap are named in a descriptive
`tested-modules-capped` finding, which never fails the run.

The usual findings still come only from the changed lines. A mutant elsewhere in those modules
fails only when the change let it escape: head reports it `Survived` or `NoCoverage`, and the base
tests caught it (`Killed` or `Timeout`). To find that out, the base checkout runs Stryker on just
those mutants: each escaped mutant's lines, moved to their base position. Every line of a source
file that the change did not write is mapped to its base line through the hunks of `git diff
--unified=0` (deleted lines included, so deleting a line above a mutant moves it too), and a mutant
matches a base mutant with the same mutator, replacement, base line and column. The base run skips
the TypeScript checker, since head's checker already accepted those mutants. The finding keeps the
`mutant-survived` or `mutant-nocoverage` rule and says "This change weakened the tests of
<module>: the base tests caught this <mutator> mutant (...), but it survives now". If the weaker
tests are intended, an exception for that rule with the module's path in `nitpicker.config.json`
lifts it (the same exception lifts the usual mutant findings of that path). A change that touches
no test mutates nothing extra, and when no mutant of those modules outside the changed lines
escapes on head, the base run is skipped.

On the sandbox project (33 lines in three modules), deleting one assertion took about 2.5 minutes
for the mutation analyzer, against about 1 minute for a one-line source change.

Not covered: a change to the Vitest config that stops some tests from running (an `exclude`, a
narrower `include`) changes no test file, so it mutates nothing extra. The options pinned in the
config nitpicker runs tests with (see [typescript-strict-preset.md](typescript-strict-preset.md))
keep a config from letting a failing test pass, but not from dropping a test.

What this gives up: a change of a dependency or a config can still let mutants survive in lines it
did not touch, and a comparison does not see them. `--all` (for example on a schedule) still
mutates every source file.

Before this scope, both sides mutated the whole source area. On ufo (1,575 source lines, 1,017
mutants) that took 426 s with the TypeScript checker; the changed lines of a three-line function
(6 mutants) take 18 s.

The Python preset does the same with mutmut's per-mutant results instead of a Stryker file: head
starts from the `mutants/*.meta` files of the base work tree when only added or modified
non-test `.py` files under a source root changed, and runs every mutant after any other change,
including every test change, because mutmut does not re-test results when a test changes. See
[python-preset.md](python-preset.md#reusing-base-results-on-head).

## Java and Kotlin mutators

Stryker runs every one of its mutators. PIT, run with no `--mutators`, uses an implicit set of 11
(`INVERT_NEGS`, `MATH`, `VOID_METHOD_CALLS`, `NEGATE_CONDITIONALS`, `CONDITIONALS_BOUNDARY`,
`INCREMENTS` and the five return-value mutators), which misses what Stryker's
`ConditionalExpression`, `MethodExpression` and `BlockStatement` catch: an error branch no test
reaches (`if (parts == 0) throw ...` survives when its condition is forced to `false`), a `trim()`
no test needs, a switch case no test takes. So every PIT run, on Gradle (Java and Kotlin presets)
and on Maven, passes `--mutators` with the list in the init script's `def pitMutators`, which the
Maven build reads with `readPitMutators` (`languages/java/builds/java-build.mjs`):

| Stryker                                             | PIT                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ArithmeticOperator, AssignmentOperator              | `MATH`                                                                                           |
| EqualityOperator                                    | `CONDITIONALS_BOUNDARY`, `NEGATE_CONDITIONALS`                                                   |
| UnaryOperator, UpdateOperator                       | `INVERT_NEGS`, `INCREMENTS`                                                                      |
| ArrowFunction, return values                        | `TRUE_RETURNS`, `FALSE_RETURNS`, `PRIMITIVE_RETURNS`, `EMPTY_RETURNS`, `NULL_RETURNS`            |
| ConditionalExpression, LogicalOperator              | `REMOVE_CONDITIONALS` (equality and order checks forced either way)                              |
| MethodExpression                                    | `EXPERIMENTAL_NAKED_RECEIVER` (a call that returns its receiver's type replaced by the receiver) |
| BlockStatement                                      | `VOID_METHOD_CALLS`, `REMOVE_INCREMENTS`, `EXPERIMENTAL_MEMBER_VARIABLE`                         |
| switch cases                                        | `REMOVE_SWITCH`, `EXPERIMENTAL_SWITCH`                                                           |
| ArithmeticOperator on `BigDecimal` and `BigInteger` | `EXPERIMENTAL_BIG_DECIMAL`, `EXPERIMENTAL_BIG_INTEGER`                                           |

BooleanLiteral is covered where `true` or `false` is returned or decides a branch, not as an
argument. StringLiteral, ArrayDeclaration, ObjectLiteral, Regex and OptionalChaining have no PIT
counterpart. PIT's own groups do not fit: `DEFAULTS` has no `NEGATE_CONDITIONALS`, and `STRONGER`
builds on `DEFAULTS`. Left out on purpose:

- `NON_VOID_METHOD_CALLS` and `CONSTRUCTOR_CALLS` replace a call with `null` or `0`; nearly every
  such mutant dies of a `NullPointerException`, Stryker has no counterpart, and they nearly double
  the mutant count.
- `EXPERIMENTAL_ARGUMENT_PROPAGATION` works on erased types, so `map.get(key)` becomes `key`.
- `INLINE_CONSTS` changes numeric literals, which Stryker leaves alone.

Both sides of a comparison run the same list, so mutants of unchanged code match by identity and
only those in changed code are new. On a single-module Maven project of 3,400 lines and 432 tests,
the list gave 830 mutants against 399 with the implicit set, 52 survivors against 15 (all 37 new
ones were real test gaps: unreached error branches, untested whitespace, untaken switch cases), and
PIT took 75 s against 42 s. On Kotlin the list also mutates what the compiler writes for coroutines (the state machine's
conditionals, `switch` and fields) and the check of the last branch of an exhaustive `when`; the
Kotlin filter leaves those out (see [Mutation](kotlin-preset.md#mutation) in the Kotlin preset), and on its
measurement fixture the list adds 5 killable mutants to the 14 the implicit set left. The Python
preset's mutmut has a fixed operator set.

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
