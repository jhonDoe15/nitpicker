# Test shard timings

The duration sequencer assigns every selected file to exactly one shard, longest files first.
Files without a measurement count as one second. The selected files always come from Vitest's
package-script filters, so adding a test to a language suite does not require editing a shard list.

`durations.json` describes ordinary `npm test` runs. `java-e2e.json` and `kotlin-e2e.json` describe
the corresponding enabled end-to-end suites. Selection uses the same `NITPICKER_JAVA_E2E=1` or
`NITPICKER_KOTLIN_E2E=1` flag that enables those suites. The recorder and sequencer use the same
profile; recording disabled tests in an ordinary run cannot erase enabled-suite measurements.

Python uses `python-e2e.json` when `NITPICKER_PYTHON_E2E=1`, with four isolated runner jobs and
two test workers each. Its initial weights come from the successful
[Python run 39316386448](https://github.com/jhonDoe15/nitpicker/actions/runs/39316386448) on
`aec1d434adabc8259fc8e0e56840687952a6c4d1`: 42 files, 767 tests and 399.74 seconds of test-run
wall time, plus roughly 40 seconds of tool/dependency setup. The sum of per-file times is larger
because files ran concurrently. The target is 2–4 minutes including setup, subject to measurement
in the new matrix. Keep Python 3.9/3.10/3.13, version constraints and all current tests on every
relevant shard; partitioning files must not change interpreter or behavioral coverage.

The initial JVM weights are per-file milliseconds from successful CI logs on main commit
`e527ccb15c2200c9b60c6d07d3fa010b020a5baa`, rounded up to seconds:

- [Java run 39273740484](https://github.com/jhonDoe15/nitpicker/actions/runs/39273740484):
  11 files, 67 tests, 1,826 seconds of test-run wall time before sharding.
- [Kotlin run 39273740059](https://github.com/jhonDoe15/nitpicker/actions/runs/39273740059):
  6 files, 54 tests, 1,121 seconds of test-run wall time before sharding.

The first three-shard runs measured slowest-shard test times of 767.55 seconds for Java
and 447.28 seconds for Kotlin:
[Java](https://github.com/jhonDoe15/nitpicker/actions/runs/39316386497) and
[Kotlin](https://github.com/jhonDoe15/nitpicker/actions/runs/39316386344). The next successful
three-shard sample ([Java](https://github.com/jhonDoe15/nitpicker/actions/runs/39324054668),
[Kotlin](https://github.com/jhonDoe15/nitpicker/actions/runs/39324054835)) on
`16deb5774cd7013978b9566041fceeff340a9973` measured Java preset cases
at 780.49 seconds, Maven preset cases at 347.68 seconds, Kotlin lint at 417.14 seconds and
Kotlin coverage/structure at 297.21 seconds. Every individual case took at most 66.63 seconds.
JSON first-to-last assertion time excludes the first `beforeAll`: the Spring file actually
spent 213.51 seconds including hooks, and Kotlin one-way rules spent 211.65 seconds.

The refined split uses 16 Java and 10 Kotlin runners. Java preset cases are grouped into nine
pairs, Maven into five behavior groups, Kotlin lint into five pairs and coverage/structure into
three groups. Spring retains its three existing independent build hooks in separate files.
Kotlin one-way rules build only the banned, allowed or hostile-config snapshot needed by their
file, rather than rebuilding all three snapshots in every group. Each original assertion is retained. Named timeout projects select the Java/Kotlin test subject
independently of the `.mjs` harness extension. Tests have a three-minute execution deadline;
Java build hooks have five minutes and Kotlin hooks three minutes. The lint rule enforces
the corresponding finite declaration ceilings without path exemptions. Fixture setup and cleanup remain isolated by Vitest file isolation and runner.

The framework cases merged from #279 add nine Java cases and one Kotlin case, giving 76/54
cases in total. Their unchanged files use measured module durations from successful #279 CI:
127 seconds for Java test frameworks ([run 39408625114](https://github.com/jhonDoe15/nitpicker/actions/runs/39408625114))
and 99 seconds for Kotest ([run 39408625035](https://github.com/jhonDoe15/nitpicker/actions/runs/39408625035)).
These measured weights are integrated into the same deterministic partition. The PMD category
checks add four Java cases, bringing current discovery to 80/54; their duration is recorded
from the enabled suite with `record-durations.mjs`.

The split-file weights remain planning estimates, not measurements of the new split. Unchanged files
use the successful isolated-shard log totals, including hooks. Split case groups sum their
measured case times plus original hook time and a conservative 25-second allowance for the
additional first JVM build. Spring review/console weights are 88/150 seconds: their individual
hooks were not logged, so these budget the observed combined 186 seconds by their two/four
snapshot builds, with extra startup allowance. One-way banned/allowed/hostile weights are
128/81/81 seconds, budgeting the observed 165-second combined hook evenly plus extra startup;
the banned group also retains its measured 46.52-second exception comparison. These allocations
are hypotheses to replace with new full-module measurements.

The deterministic sequencer gives estimated Java loads of 111–181 seconds and Kotlin loads
of 117–181 seconds, before runner setup. The goal is 2–3 minutes normally and under five minutes
including setup. The successful warm-cache sample on `0925469` measured Java jobs at 112/152/277 seconds
(minimum/median/maximum) and Kotlin jobs at 110/150.5/206 seconds. Every shard stayed under
five minutes; two shards per language exceeded three minutes. Java queue delays were
116–255 seconds, separate from job execution. These measurements predate the layered timeout
change; they do not prove cold-cache behavior. The prior setup overhead was
29–45 seconds per job. More isolated runners repeat dependency/setup work and compete for
account runner capacity, so queue delay and total runner minutes can rise even if each job is
faster. One active file per runner avoids competing JVM builds inside a shard.

Each shard uploads a JSON test report under a language/shard/attempt-specific artifact name,
including on test failure when a report exists. Compare the test step and full job elapsed time,
including setup, on warm and cold dependency caches. Do not use JSON assertion spans as hook
measurements. The existing duration recorder uses Vitest module diagnostics, which include hook
execution in the module duration, and writes sorted whole-second profiles. Record enabled suites
with the same package filters and flags after obtaining an isolated timing sample.

`node scripts/test-shards/verify-e2e-shards.mjs` collects through the real package scripts,
checks the 80/54 discovered case counts, resolves CLI shard
options through Vitest, and exercises the configured sequencer. It requires the profile to cover
every selected file exactly and each matrix shard to be nonempty, with every selected file in
exactly one shard. Vitest list itself does not apply sharding, so its `--shard` output alone is
insufficient to verify the partition.

Fixture Git trees, generated reports and build outputs remain local to each runner. The existing
Maven/Gradle actions cache dependencies; mutable fixture builds are not shared between shards.
The aggregate `java` and `kotlin` checks retain their names and require matrix success: a failed,
cancelled or unexpectedly skipped matrix cannot turn green. Unrelated PR labels still skip the
workflows' test jobs as before.
