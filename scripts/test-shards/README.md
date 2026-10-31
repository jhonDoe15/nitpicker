# Test shard timings

The duration sequencer assigns every selected file to exactly one shard, longest files first.
Files without a measurement count as one second. The selected files always come from Vitest's
package-script filters, so adding a test to a language suite does not require editing a shard list.

`durations.json` describes ordinary `npm test` runs. `java-e2e.json` and `kotlin-e2e.json` describe
the corresponding enabled end-to-end suites. Selection uses the same `NITPICKER_JAVA_E2E=1` or
`NITPICKER_KOTLIN_E2E=1` flag that enables those suites. The recorder and sequencer use the same
profile; recording disabled tests in an ordinary run cannot erase enabled-suite measurements.
Python uses `python-e2e.json` when `NITPICKER_PYTHON_E2E=1`.

## Where the weights come from

The weights are whole seconds fitted to three green runs on `main` (commits `b35fdc2a`,
`f2ebc984` and `e26d24d7`), which still used the unsplit files on 16 Java, 10 Kotlin and 4 Python
shards:

- Java [41194158038](https://github.com/jhonDoe15/nitpicker/actions/runs/41194158038),
  [41194173446](https://github.com/jhonDoe15/nitpicker/actions/runs/41194173446) and
  [41194187644](https://github.com/jhonDoe15/nitpicker/actions/runs/41194187644).
- Kotlin [41194158042](https://github.com/jhonDoe15/nitpicker/actions/runs/41194158042),
  [41194173526](https://github.com/jhonDoe15/nitpicker/actions/runs/41194173526) and
  [41194187721](https://github.com/jhonDoe15/nitpicker/actions/runs/41194187721).
- Python [41194187705](https://github.com/jhonDoe15/nitpicker/actions/runs/41194187705).

For each shard of those runs the sequencer gives the files it ran, and the median of the three
end-to-end step times gives what they took together. The method:

- Java and Kotlin shards run their files one at a time. Each step pays about 2 seconds of Vitest
  startup, and its first file pays for starting a Gradle daemon on cold caches (the first diff of
  the branches-exceptions file took 53 seconds and its second one 33), so 22 seconds come off the
  step time. A shard is expected to take the sum of its weights plus those 22 seconds. Setup
  before the tests (checkout, Node, JDK, Gradle and Maven caches, `npm ci`) took 50-90 seconds per
  JVM job, so each shard added to a matrix costs about 60-90 seconds of runner time.
- The split files of a shard start from their own per-file times in the run of commit `3fcaedfa`
  ([Java 39850506780](https://github.com/jhonDoe15/nitpicker/actions/runs/39850506780),
  [Kotlin 39850506687](https://github.com/jhonDoe15/nitpicker/actions/runs/39850506687)), and are
  scaled together so that their sum matches the shard. The Java complexity and parity files and
  the preset branches and violations files grew most (factors 1.8 and 1.45): `main` added cases to
  them after that run.
- A file new since that run gets what its shard has left after the others, and at least 10
  seconds: the Java overlap probe (28), tool text and Error Prone report (10 each), and the Kotlin
  fan-out (28), multi-project (85) and mutation facts (25) files. The Kotlin library-branches and
  ports file holds the two coverage cases `main` added to the branches file; its 95 seconds are
  what that shard grew by.
- Python shards run two files at a time, so their step times do not separate files. Python keeps
  the per-file times with two workers from run
  [39850506814](https://github.com/jhonDoe15/nitpicker/actions/runs/39850506814), and files added
  since then keep their authors' estimates, listed under the files moved into the suites below.
  The four shards took 166-193 seconds of test step on `e26d24d7`.

The same shard varied by 30-60% between runs (Java shard 8 took 145, 152 and 242 seconds, Kotlin
shard 6 took 301, 367 and 425), so shards drift by about half a minute. Replace the weights from a
new run when the spread grows: every shard uploads a JSON report under a
language/shard/attempt-specific artifact name, also on test failure, and its log lists the time
of each file. Do not use JSON assertion spans as hook measurements. The duration recorder uses
Vitest module diagnostics, which include hooks, and writes sorted whole-second profiles.

## Shard counts

The targets are 2-3 minutes of job time for a Java or Kotlin shard (#364, #365) and about 2-4
minutes for a Python shard (#366). The account runs at most about 20 jobs at once, so the counts
are also weighed against queue time.

- Java has 19 shards: 125-133 seconds of tests (about 2.5-3 minutes of job time), plus 172
  seconds for the Spring console file, whose single case compares the full Gradle and Maven
  findings of two builds and has a shard of its own (#478). 20 or 21 shards would shorten the
  longest regular shard by about 9 seconds, and 21 shards and the plan job exceed the 20 concurrent
  jobs. 19 shards and the plan job fit.
- Kotlin has 15 shards: 129-163 seconds of tests, plus about 215 for the Kotlin red-base file
  alone. 14 shards would raise the longest regular shard to 172 seconds, and 16 would shorten it
  by 12 seconds for another 60-90 seconds of runner time.
- Python has 4 shards of about 300 weighted seconds each, about 150 seconds of test step with two
  workers, so about 3.5-4 minutes of job time.

When the `run-ci` label starts every workflow at once, about 40 jobs compete for 20 runners, and
the wall time is bounded by the total runner time divided by 20. An extra shard adds about 60-90
seconds of runner time, 3-5 seconds of wall time at that bound, and shortens nothing once the
longest shard holds a single file. Queue time can still dominate: the jobs of the runs above
waited up to about 90 minutes for runners before they started.

## Splits

Files longer than about 125 seconds were split into independent behavior groups, each with its
own fixture tree and every assertion kept: the Java integration, preset branches, Maven reactor,
test framework and escape hatch files, the Kotlin guards, review rules, lint, coverage branches
and one-way rules files, and the Python gate file. Identical builds repeated in one file now run
once and are shared by the cases that read them. Kotlin one-way rules build only the banned,
allowed or hostile-config snapshot their file needs. Spring keeps its three independent build
hooks in separate files. Every Java and Kotlin case stays selected.

Named timeout projects select the Java/Kotlin test subject independently of the `.mjs` harness
extension. Tests have a three-minute execution deadline; Java build hooks have five minutes and
Kotlin hooks three minutes. The lint rule enforces the corresponding finite declaration ceilings
without path exemptions. Fixture setup and cleanup stay isolated by Vitest file isolation and
runner.

## Earlier profiles

The first JVM weights were per-file times from successful CI logs on main commit
`e527ccb15c2200c9b60c6d07d3fa010b020a5baa`, rounded up to whole seconds:
[Java run 39273740484](https://github.com/jhonDoe15/nitpicker/actions/runs/39273740484) (11
files, 1,826 seconds of tests before sharding) and
[Kotlin run 39273740059](https://github.com/jhonDoe15/nitpicker/actions/runs/39273740059) (6
files, 1,121 seconds). The first Python weights came from
[Python run 39316386448](https://github.com/jhonDoe15/nitpicker/actions/runs/39316386448) on
`aec1d434adabc8259fc8e0e56840687952a6c4d1`: 42 files, 767 tests and 399.74 seconds of wall time.
Three-shard runs then measured slowest shards of 767.55 seconds for Java and 447.28 for Kotlin
([Java](https://github.com/jhonDoe15/nitpicker/actions/runs/39316386497),
[Kotlin](https://github.com/jhonDoe15/nitpicker/actions/runs/39316386344)), which led to the
splits above. The isolated-shard runs
[Java 39827137379](https://github.com/jhonDoe15/nitpicker/actions/runs/39827137379),
[Kotlin 39827137380](https://github.com/jhonDoe15/nitpicker/actions/runs/39827137380) and
[Python 39827137436](https://github.com/jhonDoe15/nitpicker/actions/runs/39827137436) on
`de8c1413` gave the weights that the `3fcaedfa` run replaced.

## Checking the plan

`node scripts/test-shards/verify-e2e-shards.mjs [java|kotlin|python]` collects through the real
package scripts. It first lists every `.e2e.test.` file, and every other test file that reads a
`NITPICKER_*_E2E` flag itself or through a module it imports, once with no suite flag and once
with each suite's flag. Each of those files must be gated by exactly one suite flag (cases listed
with it and not without any flag), and the flag it reads must be that one: a file gated by two
flags, by none, or by a flag no suite sets fails the check. Each package script must then select
exactly the cases its flag gates, so the expected cases are derived rather than counted by hand
and a gated file that a script leaves out fails. It checks the workflow wiring: the shard job runs
the package script with `--shard`, the plan job runs this verifier for its language, and the one
aggregate job always runs, needs both and checks both results. It resolves CLI shard options
through Vitest and exercises the configured sequencer with the language's profile. It requires
the profile to cover every selected file exactly and each matrix shard to be nonempty, with every
selected file in exactly one shard. Vitest list itself does not apply sharding, so its `--shard`
output alone is insufficient to verify the partition. The script's own main guard resolves
`process.argv[1]` through `realpathSync`, so a run through a symlinked path checks rather than
exiting silently.

The verifier lists tests with `--no-isolate` and runs the four listings at once, which keeps the
shard-plan job at about half a minute instead of about two. Sharing one module graph between
files is safe here: `vitest list` imports the test files and collects their names but runs no
test body or hook, each listing is a process of its own with one fixed set of flags, so a module
that reads a flag at import time reads the same value for every file, and the listings with and
without `--no-isolate` were compared and are identical. Each language workflow runs the verifier
in its own shard-plan job without starting a JVM build or a Python project, and the aggregate
check requires it.

## Runners and caches

Fixture Git trees, generated reports and build outputs remain local to each runner. The existing
Maven/Gradle actions cache dependencies; mutable fixture builds are not shared between shards.
Python does not cache uv's downloads. A trial restored `~/.cache/uv` per shard and pruned it with
`uv cache prune --ci`, which keeps only the wheels uv built from source: each shard deleted
175-212 MiB and saved about 5 MB, and the Python runner time stayed the same (760 seconds before,
755 after). Keeping the whole download cache would save and restore about 200 MiB per shard
without a measured gain, so the cache step was removed. The aggregate `java` and `kotlin` checks
retain their names and require matrix success: a failed, cancelled or unexpectedly skipped matrix
cannot turn green. Unrelated PR labels still skip the workflows' test jobs as before.

## Files moved into the suites

The Kotlin style file test (`kotlin-e2e/style/kotlin-style-files.e2e.test.mjs`, nine cases) was
gated on the Java flag but selected by neither suite. It runs the init script's two Kotlin style
tasks against a stand-in Kotlin plugin, so it now sits under `kotlin-e2e/`, is gated on the
Kotlin flag and runs in the Kotlin suite (29 seconds in CI). Its first run showed two
expectations older than the enforcement of the followed base values: a project `.editorconfig`
that sets another value gets the followed one appended, and a project-first detekt precedence
gets the enforced layer last.

Four Python files (`ruff/ruff-rules`, `ruff/ruff-groups`, `adapters/formatting/format-scope` and
`adapters/configuration/python-ruff-config`, six cases) were gated on the Python flag but selected
by no script. They are now in `test:python` with a weight of one second each: they only run the
installed ruff and black, and took under a second together in CI.

The coverage precedence file (`adapters/configuration/coverage-config/coverage-precedence`, five
cases) is in `test:python` with a planning weight of 45 seconds: it installs coverage and pytest
into one uv environment and runs the test step nine times, which took about 30 seconds locally.
The ruff lint precedence file (`adapters/project-tools/ruff/ruff-lint`, ten cases) has 15 seconds:
it runs only the installed ruff on small projects, and took about six seconds locally.
`ruff/ruff-snapshot` (one second) only asks the installed ruff for its rule list. The type
analysis columns file has 15 seconds, and the fan-out and signature rule files 2-5 seconds, in
line with the measured rule files beside them.
