# Failure policy

Part of the [Kotlin preset guide](../kotlin-preset.md).

As for Java: a Gradle failure on either snapshot (Kotlin does not compile, a tool crashes, a tool
jar cannot be downloaded, no `gradle` on the PATH) is one `kotlin/gradle-failure` finding with
classification `tool-error`, which the comparison reports for that snapshot, skipping the
comparison and exiting with 2. Nothing is silently skipped and nothing throws.

**A base whose tests fail (decision).** Failing tests are not a Gradle failure on the base when the
fresh test reports of a `Test` task name them. The base runs with `--continue`, then once more
with `-Pnitpicker.testsFailed=<project dirs>`: the init script disables every checked test task, the per-task PIT, the aggregate PIT and JaCoCo of the
failing Gradle projects and sets `testsFailed` in their manifest, and the other checks (detekt,
ktlint, PMD, SpotBugs, structure, duplicates, coupling) run as usual. The failing projects get one
`kotlin/tests-failed` tool error each, which the core reads as a red base and writes to
`notes.json` instead of exiting with 2. The coverage-dependent results of the Kotlin sources of
those projects (`changed-branch-coverage`, `crap-score-limit`, `crap-coverage-unknown`, `mutant-*`,
`slow-test`, `test-console-output`) are unknown on the base: a head finding of them is new when
the change adds or edits its lines, else unchanged. A failing root project covers only its own
source and test directories, so the other Gradle projects keep their comparison. A project that
does not compile, a run that exits non-zero without a named failing test and a run that times out
stay `kotlin/gradle-failure`. A change that deletes tests, or removes more test lines than it
adds, gets no help from the red base. A head whose tests fail is a `kotlin/tests-failed` tool error and exits 1.
See "A base whose tests fail" in `usage.md`.
