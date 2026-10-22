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
because files ran concurrently. The target is 2–3 minutes of job time. Keep Python 3.9/3.10/3.13, version constraints and all current tests on every
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

The earlier refined split grouped Java preset cases into nine pairs, Maven into five behavior
groups, Kotlin lint into five pairs and coverage/structure into three groups. Spring retains its
three existing independent build hooks in separate files.
Kotlin one-way rules build only the banned, allowed or hostile-config snapshot needed by their
file, rather than rebuilding all three snapshots in every group. Each original assertion is retained. Named timeout projects select the Java/Kotlin test subject
independently of the `.mjs` harness extension. Tests have a three-minute execution deadline;
Java build hooks have five minutes and Kotlin hooks three minutes. The lint rule enforces
the corresponding finite declaration ceilings without path exemptions. Fixture setup and cleanup remain isolated by Vitest file isolation and runner.

The framework cases merged from #279 add nine Java cases and one Kotlin case, giving 76/54
cases in total. Their unchanged files use measured module durations from successful #279 CI:
127 seconds for Java test frameworks ([run 39408625114](https://github.com/jhonDoe15/nitpicker/actions/runs/39408625114))
and 99 seconds for Kotest ([run 39408625035](https://github.com/jhonDoe15/nitpicker/actions/runs/39408625035)).
These measured weights are integrated into the same deterministic partition.

The profiles were rewritten from the isolated-shard runs
[Java 39827137379](https://github.com/jhonDoe15/nitpicker/actions/runs/39827137379),
[Kotlin 39827137380](https://github.com/jhonDoe15/nitpicker/actions/runs/39827137380) and
[Python 39827137436](https://github.com/jhonDoe15/nitpicker/actions/runs/39827137436) on
`de8c1413`, whose shards ran 100-297 seconds (Java), 174-344 seconds (Kotlin) and 127-193 seconds
(Python) of job time, with about 48 seconds of setup in each JVM job and 40 in each Python job.
Weights are seconds of test step time including hooks. Where the log showed a file's own time
(Java: nearly every file) the weight is that time. Elsewhere it is the measured suite step of the
shard, shared between its files in proportion to the earlier estimates, and a file that was split
shares its weight over its parts. Files added since (the Java integration tests) keep their
author's estimate. Every weight is replaced by a per-file measurement when a run of the new matrix
is available: read the shard JSON reports uploaded as artifacts.

Files longer than about 125 seconds were split into independent behavior groups, each with its
own fixture tree and every assertion kept: the Java integration, preset branches, Maven reactor,
test framework and escape hatch files, the Kotlin guards, review rules, lint, coverage branches
and one-way rules files, and the Python gate file. Identical builds repeated in one file now run
once and are shared by the cases that read them. The Spring console file (about 197 seconds) is
the one file left longer than a shard: its single case compares the full Gradle and Maven findings
of two builds. It has a shard of its own.

The sequencer gives Java 21 shards of 106-121 seconds, plus 197 seconds for the console file;
Kotlin 15 shards of 98-135 seconds; Python 4 shards of 129 seconds, before runner setup. The
verifier lists tests with `--no-isolate` and runs the four listings at once, which keeps the
shard-plan job under a minute instead of about two.

Each shard uploads a JSON test report under a language/shard/attempt-specific artifact name,
including on test failure when a report exists. Compare the test step and full job elapsed time,
including setup, on warm and cold dependency caches. Do not use JSON assertion spans as hook
measurements. The existing duration recorder uses Vitest module diagnostics, which include hook
execution in the module duration, and writes sorted whole-second profiles. Record enabled suites
with the same package filters and flags after obtaining an isolated timing sample.

`node scripts/test-shards/verify-e2e-shards.mjs [java|kotlin|python]` collects through the real
package scripts. It first lists every `.e2e.test.` file, and every other test file that reads a
`NITPICKER_*_E2E` flag itself or through a module it imports, once with no suite flag and once with
each suite's flag. Each of those files must be gated by exactly one suite flag (cases listed with it
and not without any flag), and the flag it reads must be that one: a file gated by two flags, by
none, or by a flag no suite sets fails the check. Each package script must then select exactly the
cases its flag gates, so the expected cases are derived rather than counted by hand and a gated
file that a script leaves out fails. It checks the workflow wiring: the shard job runs the package
script with `--shard`, the plan job runs this verifier for its language, and the one aggregate job
always runs, needs both and checks both results. It resolves CLI shard options through Vitest and
exercises the configured sequencer with the language's profile. It requires the profile to cover
every selected file exactly and each matrix shard to be nonempty, with every selected file in
exactly one shard. Vitest list itself does not apply sharding, so its `--shard` output alone is
insufficient to verify the partition. The script's own main guard resolves `process.argv[1]`
through `realpathSync`, so a run through a symlinked path checks rather than exiting silently.

Fixture Git trees, generated reports and build outputs remain local to each runner. The existing
Maven/Gradle actions cache dependencies; mutable fixture builds are not shared between shards. The
Python shards also restore uv's download cache (`~/.cache/uv`, keyed on the constraints file and
the shard): it holds downloaded wheels only, every environment is still built fresh and the
constraints still pin every version. Its saving is not measured yet.
The aggregate `java` and `kotlin` checks retain their names and require matrix success: a failed,
cancelled or unexpectedly skipped matrix cannot turn green. Unrelated PR labels still skip the
workflows' test jobs as before.

The Kotlin style file test (`kotlin-e2e/style/kotlin-style-files.e2e.test.mjs`, nine cases) was
gated on the Java flag but selected by neither suite. It runs the init script's two Kotlin style
tasks against a stand-in Kotlin plugin, so it now sits under `kotlin-e2e/`, is gated on the Kotlin
flag and runs in the Kotlin suite (about 64 to 85 seconds locally). Its first run showed two expectations older than the enforcement of the followed base
values: a project `.editorconfig` that sets another value gets the followed one appended, and a
project-first detekt precedence gets the enforced layer last. Each language workflow runs the
verifier in its own shard-plan job; it lists tests without starting a JVM build or a Python project, and the aggregate check
requires it.

Four Python files (`ruff/ruff-rules`, `ruff/ruff-groups`, `adapters/formatting/format-scope` and
`adapters/configuration/python-ruff-config`, six cases) were gated on the Python flag but selected
by no script. They are now in `test:python` with a weight of one second each: they only run the
installed ruff and black, and took under four seconds together locally.
