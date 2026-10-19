# Test shard timings

The duration sequencer assigns every selected file to exactly one shard, longest files first.
Files without a measurement count as one second. The selected files always come from Vitest's
package-script filters, so adding a test to a language suite does not require editing a shard list.

`durations.json` describes ordinary `npm test` runs. `java-e2e.json` and `kotlin-e2e.json` describe
the corresponding enabled end-to-end suites. Selection uses the same `NITPICKER_JAVA_E2E=1` or
`NITPICKER_KOTLIN_E2E=1` flag that enables those suites. The recorder and sequencer use the same
profile; recording disabled tests in an ordinary run cannot erase enabled-suite measurements.

The initial JVM weights are per-file milliseconds from successful CI logs on main commit
`e527ccb15c2200c9b60c6d07d3fa010b020a5baa`, rounded up to seconds:

- [Java run 39273740484](https://github.com/jhonDoe15/nitpicker/actions/runs/39273740484):
  11 files, 67 tests, 1,826 seconds of test-run wall time before sharding.
- [Kotlin run 39273740059](https://github.com/jhonDoe15/nitpicker/actions/runs/39273740059):
  6 files, 54 tests, 1,121 seconds of test-run wall time before sharding.

Each language starts with three parallel runner jobs and one active test file per job. Java's
recorded loads split into roughly 747, 542 and 541 seconds, excluding provisioning. Kotlin's
longest files previously competed on one runner, so their recorded durations include contention:
those weights order the work, but do not predict its new runtime. Refresh them after isolated
shard runs. No speedup has been measured for the new workflow yet.

Each shard uploads a JSON test report under a language/shard/attempt-specific artifact name,
including on test failure when a report exists. Compare slowest-shard time and full workflow wall
time, including setup, on warm and cold dependency caches. Three runners repeat setup and may
increase runner minutes. Whole-file sharding cannot shorten the longest individual file; split a
dominant file only after measuring its hooks and repeated fixture-build cost.

The desired follow-up budget is 2–3 minutes per runner. This first whole-file split does not meet
that budget: the largest Java preset file alone measured 747 seconds, and the Maven preset file
431 seconds. The largest Kotlin lint and coverage/structure files measured 1,120 and 887 seconds
while sharing a runner. These suites repeatedly build base and head snapshots. Use the new JSON
reports to identify independent test groups, repeated snapshots and setup costs before splitting
them further or replacing full-pipeline repetition with focused tool integrations. Preserve the
full-pipeline representative cases and all existing behavioral assertions. More runner slots alone
cannot remove these per-file limits.

Fixture Git trees, generated reports and build outputs remain local to each runner. The existing
Maven/Gradle actions cache dependencies; mutable fixture builds are not shared between shards.
The aggregate `java` and `kotlin` checks retain their names and require matrix success: a failed,
cancelled or unexpectedly skipped matrix cannot turn green. Unrelated PR labels still skip the
workflows' test jobs as before.
