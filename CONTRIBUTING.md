# Contributing

Before adding, loosening or removing a rule, read [docs/mindset.md](docs/mindset.md).

## Repository layout

One npm package (`nitpicker`) serves every language; the package root is the repository root.

- `core/`: the engine (base/head comparison, fingerprinting, scheduling, reports, the CLI) and the
  tool helpers every language shares (`core/tooling/`: jscpd, the git base diff, the runner
  arguments).
- `shared/`: language-neutral policy and custom rules (`rules/`), the finding policy that applies
  `exclude`, exceptions and the legacy inventory (`findings/`) and the report readers every
  language shares (`ingest/`: SARIF, format checks, lizard CRAP, structure reports). It imports
  neither `core/` nor `languages/`.
- `languages/typescript/`: the ESLint/strict preset (`preset/`) and the TypeScript analyzers
  (`adapters/`).
- `languages/javascript/`: what the JavaScript preset changes in the TypeScript pipeline (JSDoc
  rules, ESLint dialect, preset constants) and its `js-clean` fixture.
- `languages/java/`: the Gradle init script and `StructureMetrics.java` (`gradle/`), the Java
  analyzer (`adapters/`) and the report ingesters (`ingest/`). The Kotlin preset is the same code
  with Kotlin tools added (`kotlin-*.mjs`).
- `languages/python/`: the nitpicker-owned ruff config (`ruff/`), the Python analyzer (`adapters/`),
  the coverage.py report ingester (`ingest/`) and the `ast`-based structure and complexity script
  (`metrics/`); it reuses the generic ingesters in `shared/ingest/`.
- `spec/`, `docs/`, `evals/` and `scripts/`: the language-neutral contract, documentation,
  agent evaluations and maintenance scripts. Not shipped.

Source files carry no comments; formats and protocols that names cannot express are in
[docs/internals.md](docs/internals.md).

## Running the checks

Pull requests do not run CI on every push. Check your change locally before you push it and again
before it is merged:

```sh
npm ci
git fetch origin main
npm run check
```

`npm run check` runs the self-gate (nitpicker checks your change against the remote's default
branch) and then the full test suite, and fails if either fails. Arguments after `--` go to vitest,
so `npm run check -- --shard=2/8` runs only what one CI test shard runs. It needs Node.js 22.14 or newer (CI
uses 24) and Java 21 for the structure-metrics test. It checks your working tree, uncommitted and
untracked files included, while CI checks the pull request merged into its target branch, so commit
everything and merge or rebase on the latest `main` before the final run. A change to a language's
end-to-end behaviour also needs that language's suite (`npm run test:java`, `test:kotlin` or
`test:python`), which needs the language's toolchain. CI runs all three, in the `java-e2e`,
`kotlin-e2e` and `python-e2e` workflows, which follow the same triggers as the `typescript` workflow
below (pushes to `main` that touch the paths they list, a manual run, and the `run-ci` label).
The TypeScript red-base test (`npm run test:typescript`, which runs real vitest through the CLI) is
not in CI: run it after changing `core/diff/comparison/base-red/` or a test runner's failure report.

CI (the `typescript` workflow) runs:

- on every push to `main` that touches a path in the workflow's `paths` list;
- on a pull request when someone adds the `run-ci` label, once per added label (remove and add the
  label again for another run);
- by hand from the Actions tab (Run workflow) on any branch that already has this workflow.

GitHub does not start a pull request run while the pull request has a merge conflict, so resolve it
before adding the label.

When a pull request loosens `nitpicker.config.json` (for example an exception, exclude or entry
point that covers a new code file; see the policy changes in [docs/usage.md](docs/usage.md)), the
self-gate fails with a `nitpicker-config/policy-loosened` finding that names a 12-character digest.
A repository admin who agrees with the loosening copies the digest from that CI run's log (a local
run can give another digest, since CI checks the pull request merged into `main`), sets the
repository variable `NITPICKER_ACCEPT_POLICY_CHANGE` to exactly that value (Settings > Secrets and
variables > Actions > Variables), and runs the self-gate again by removing and re-adding the
`run-ci` label. The digest covers those loosenings and the content of the files they hide, so a
different loosening needs a new digest. Delete the variable once the pull request is merged. The
self-gate runs the pull request's own code and workflow, so changes to `.github/workflows/`,
`core/`, `package.json` and `nitpicker.config.json` need a careful review whatever the gate says.

CI splits the test files into shards that run as parallel jobs, and the required `test` check passes
only when every shard passed. `scripts/test-shards/sequencer.mjs` gives each shard about the same
total time, from the per-file times in `scripts/test-shards/durations.json`; a file that is not
listed counts as one second. The split never drops a file, it only gets less even as the times drift.
After adding or reshaping slow tests, record the times again: the script runs the suite (vitest
arguments pass through) and rewrites the times of the files it ran.

```sh
node scripts/test-shards/record-durations.mjs --maxWorkers=100%
```

Java end-to-end CI uses 16 isolated runner shards and Kotlin uses 10, with files run serially in
each shard. Independent behavior groups have separate fixture trees; the full 95 Java and 92
Kotlin cases remain selected. The final `java` or `kotlin` check passes only when all its shards
pass. Reproduce a shard with `npm run test:java -- --shard=1/16` or
`npm run test:kotlin -- --no-file-parallelism --shard=1/10`.

Named `tools.tests.timeouts.projects` select the Java/Kotlin subject even though the harness is
JavaScript. They inherit language declaration ceilings and repository execution defaults. JVM
tests run with a three-minute deadline; Java hooks have five minutes and Kotlin hooks three.
The timeout lint rule remains active for these suites. These are bounded execution limits,
separate from slow-test thresholds and measured shard duration; see [timeout tiers](docs/usage.md#test-timeout-tiers).

After moving E2E files or changing their package-script filters, verify real Vitest discovery
(every E2E test file is gated by exactly one suite flag, and each script selects exactly the cases
its flag enables), profile coverage, the workflow wiring and the configured matrix partition
without starting a JVM build or a Python project (CI runs the same check in the shard-plan job of the
Java, Kotlin and Python workflows):

```sh
node scripts/test-shards/verify-e2e-shards.mjs
```

Enabled JVM suites use separate timing files: `scripts/test-shards/java-e2e.json` and
`scripts/test-shards/kotlin-e2e.json`. Ordinary recordings cannot overwrite these with the timings
of skipped E2E tests. To record a JVM suite, set its `NITPICKER_JAVA_E2E=1` or
`NITPICKER_KOTLIN_E2E=1` flag, pass the same file filters as its package script to
`record-durations.mjs`, and use `--no-file-parallelism`. The recorder selects the corresponding
timing file automatically. Run one enabled JVM suite at a time. CI uploads a JSON report per
shard for reviewing durations and failures; timing provenance and limits are in
[scripts/test-shards/README.md](scripts/test-shards/README.md).

Python end-to-end CI uses four isolated shards with two test workers each and retains the final
`python-e2e` check. Reproduce one with
`npm run test:python -- --maxWorkers=2 --shard=1/4`. Enabled runs and recordings use
`scripts/test-shards/python-e2e.json` when `NITPICKER_PYTHON_E2E=1`. Enable only one language's
end-to-end suite at a time so the sequencer and recorder can choose the correct timing profile.

`npm test` runs `languages/python/metrics/structure_metrics.py` on a real `python3`, so it needs
`python3` 3.10 or newer on the `PATH` (that test file is skipped, with its reason in the name,
without one). The Python end-to-end suite (`npm run test:python`) needs more tools and the
network; see [docs/python-preset.md](docs/python-preset.md).

## Licenses

Code nitpicker writes or copies stays permissive (MIT, Apache-2.0, BSD, ISC). A tool nitpicker runs
unmodified, either downloaded at run time or installed as an unmodified npm package, may be
weak-copyleft (LGPL, EPL, MPL). GPL, AGPL and source-available licenses (SSPL, SSALv1, BSL,
Elastic and the like) are never allowed, in either form.

Weak-copyleft tools today: SpotBugs and its find-sec-bugs plugin, and Checkstyle (LGPL); JaCoCo
(EPL-2.0); the JUnit Platform launcher that PIT needs (EPL-2.0, added at run time next to the
project's own engine); Saxon-HE (MPL-2.0), which PMD, SpotBugs and Checkstyle pull in; axe-core,
which `eslint-plugin-jsx-a11y-x` installs (MPL-2.0). PMD itself is BSD-style, which the Java tool
list accepts as permissive.

`core/licensing/dependency-licenses.test.mjs` enforces what it can read on every test run: each
tool pinned in `languages/java/gradle/nitpicker.init.gradle` must have a license entry in
`core/licensing/test-support/` that the allowlist accepts and an exact version, and every package in
`package-lock.json` must declare an allowed license, with its installed LICENSE text scanned for a
GPL, AGPL or source-available notice (a package that offers an allowed license in an OR expression
passes). `Public Domain`, which is not an SPDX id, is accepted for `jsonify@0.0.1` only. Adding a
pinned Java tool means adding its license entry in the same change, after reading the license text,
since a package's metadata can disagree with its LICENSE file.

`languages/java/adapters/java-e2e/preset/security/java-preset-tool-licenses.e2e.test.mjs` runs in the
Java end-to-end suite, since it needs
Maven and the network. It resolves every tool nitpicker downloads with Maven, transitive
dependencies included (the formatters and the Kotlin tools through the coordinates in the Gradle
scripts), and checks the license each jar's POM declares, or the nearest parent POM that declares
one; several licenses in one POM are a choice, as Maven defines them. Free-text names become SPDX
ids in `core/licensing/test-support/pom-licenses.mjs`, and a name it does not know fails until it is
added there after reading the license (dom4j's POM says "Plexus" for its BSD-style license, so it
has its own entry). The license texts inside the jars are not read, and lizard, a Python tool, keeps
only its hand entry.

To cut a release, see [docs/releasing.md](docs/releasing.md).
