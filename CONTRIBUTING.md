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
- `languages/go/`: the Go analyzer (`adapters/`) and the `go/ast` metrics program (`inspect/`, a Go
  module on the standard library only).
- `spec/`, `docs/`, `evals/` and `scripts/`: the language-neutral contract, documentation,
  agent evaluations and maintenance scripts. Not shipped.

Source files carry no comments; formats and protocols that names cannot express are in
[docs/internals.md](docs/internals.md).

Test helpers go in one of two folders next to the tests that use them. `__tests__/` holds helpers
that register Vitest hooks, such as `useJavaPresetProject()`, which builds a fixture project in
`beforeAll` and removes it in `afterAll`. The lint rules treat the folder as test code, and the named timeout
projects in `nitpicker.config.json` include the Java and Kotlin ones, so their hooks get the same
limits as the tests. `test-support/` holds what the tests import without hooks: expected findings,
fixture file contents, and helpers that run a build or summarize a report. Neither folder ships in
the npm package.

## TypeScript sources

The code is moving from JavaScript (`.mjs`) to TypeScript (`.mts`) one area at a time; issue #147
tracks the plan. Node.js strips the types itself, so a checkout runs `.mts` files with no build
step, and `npm pack` emits a `.mjs` file beside each shipped `.mts` (`scripts/typescript/emit.mjs`)
so the package stays plain JavaScript.

- Import a converted module by its real name (`./a.mts`); `npm run typecheck` checks every `.mts`
  file against `tsconfig.json`, the flags of the strict preset.
- Use only syntax that Node.js can strip: no enums, namespaces or parameter properties.
- A shipped `.mjs` file must not import a `.mts` file, so shipped code converts from the importers
  down. `node scripts/typescript/ready.mts <folder>` lists the modules of a folder that can convert
  now, and `node scripts/typescript/convert.mts <files>` renames them and rewrites their imports and
  their `nitpicker.config.json` entries, then lists the places that name them by path.
- Code that opens a module by path (a worker, a spawned runner, a config file handed to a tool, a
  file list that is hashed) keeps the packaged `.mjs` name and resolves it with
  `checkoutModulePath` or `checkoutModuleUrl` from `shared/paths/checkout-module.mjs`, which pick
  the `.mts` source in a checkout when Node.js strips types and the emitted `.mjs` otherwise.
- `npm pack` and the container build run on Node.js 22.14, which cannot strip types: they emit the
  `.mjs` files first (`node scripts/typescript/emit.mjs`, cleaned with `--clean`). Their own
  scripts, `scripts/typescript/emit.mjs` and `scripts/reference/gen-rules.mjs` with the
  `scripts/reference/` modules it imports, stay JavaScript; `ready.mts` holds them.

## Batching issues into pull requests

CI time, not review size, limits how fast changes land, so related issues ship together: fewer pull
requests start fewer CI runs, and every change still passes the same checks.

- **Coordinator issues.** A bigger feature or refactor gets a coordinator issue with the `batch`
  label, such as #147 for the move to TypeScript. It lists each child issue as a checklist item with
  the order to do them in, what each one depends on, and the pull request it ships in.
- **Nesting.** A coordinator issue can list other coordinator issues, so small batches join into
  bigger ones. Each connected group of issues becomes one pull request, with one commit per child
  issue whose message names that issue. The pull request closes the child issues it completes, and
  the coordinator issue closes when its last child does.
- **One direction per pull request.** A pull request delivers one feature, refactor or family of
  fixes; unrelated fixes go in their own batch. Aim for 20 to 30 commits: merge small batches of the
  same feature or of closely related features into one pull request, and split a feature that needs
  more into nested batches that land one after another, each its own pull request.
- **New work.** Before starting an issue, check whether it belongs to an open coordinator issue, and
  add a new issue to the coordinator issue it fits. An issue that fits no batch can still ship alone.
- **CI.** Run the focused local checks for each commit, then push the batch and add `run-ci` once.
  Fix what CI reports in one more push rather than one push per failure.

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
so `npm run check -- --shard=2/2` runs only what one CI test shard runs. It needs Node.js 22.18 or newer (CI
uses 24) and Java 21 for the structure-metrics test. It checks your working tree, uncommitted and
untracked files included, while CI checks the pull request merged into its target branch, so commit
everything and merge or rebase on the latest `main` before the final run. A change to a language's
end-to-end behaviour also needs that language's suite (`npm run test:java`, `test:kotlin` or
`test:python` or `test:go`), which needs the language's toolchain. CI runs all four, in the `java-e2e`,
`kotlin-e2e`, `python-e2e` and `go-e2e` workflows, which follow the same triggers as the `typescript` workflow
below (pushes to `main` that touch the paths they list, a manual run, and the `run-ci` label). The
`github-action` workflow, which runs the composite action in `action.yml` on the sample project in
`.github/sample-project`, and the `platforms` workflow described below follow them too; neither is a
required check. On a pull request, each of these six workflows first runs a small `changes` job
(`scripts/ci/affected-jobs.mts`) that compares the pull request's changed files with the workflow's own
push `paths`. When none of them matches, the workflow's other jobs are skipped and its summary job
passes; when the files cannot be listed, all jobs run. Changing a shared path such as `core/`, `shared/`,
`package.json` or `vitest.config.mts` runs them all.
The `typescript` workflow (the required `test` and `self-gate` checks) always runs in full, because
its tests read the whole repository, documentation included. Keep a workflow's `paths` complete:
on pull requests they now decide what runs, not only which pushes to `main` start a run.
The Java and Kotlin suites add Maven resolver retry options to `MAVEN_OPTS`, so a Maven Central
HTTP 429 (rate limit) is retried up to six times, ten seconds apart, instead of failing the build
under test. CI keeps `~/.m2` and `~/.gradle` between runs; locally they are your own caches.
The TypeScript red-base test (`npm run test:typescript`, which runs real vitest through the CLI) is
not in CI: run it after changing `core/diff/comparison/base-red/`, a test runner's failure report or how
the Stryker report is read.

The `platforms` workflow runs the CLI on the sample projects in `scripts/platforms/samples.mts` on Linux,
macOS and Windows, and the TypeScript sample under Deno. It fails when a run's findings differ from the
Linux run under Node, except for the differences listed in `scripts/platforms/compare-runs.mts`.
Reproduce one sample with `node scripts/platforms/smoke.mts typescript --output reports/platforms/local`
(add `--runtime deno` for Deno), then compare two such directories with
`node scripts/platforms/compare-runs.mts <reference> <other>`. After changing a workflow's versions or the
expected differences, run `npm run gen:checks` so that [docs/compatibility.md](docs/compatibility.md)
matches; a test fails until it does.

CI (the `typescript` workflow) runs:

- on every push to `main` that touches a path in the workflow's `paths` list (a run that has started
  finishes; a run still waiting is replaced by the next push's run, which tests everything merged so far);
- on a pull request when someone adds a label while it carries the `run-ci` label: adding `run-ci`
  starts it, and any later label runs it again (remove and add `run-ci` for another run). GitHub
  keeps only the newest run of a workflow for a commit and counts a skipped required check as
  passed, so a label never skips the checks: on a pull request without `run-ci` the self-gate
  still runs and `test` fails until someone adds `run-ci`;
- by hand from the Actions tab (Run workflow) on any branch that already has this workflow.

GitHub does not start a pull request run while the pull request has a merge conflict, so resolve it
before adding the label.

When a pull request loosens `nitpicker.config.json` (for example an exception, exclude or entry
point that covers a new code file; see the policy changes in [docs/usage.md](docs/usage.md)), the
self-gate fails with a `nitpicker-config/policy-loosened` finding. A maintainer who agrees with the
loosening adds the `accept-policy-change` label. The
[policy approval workflow](.github/workflows/nitpicker-policy-approval.yml) records the approval
on the head commit as the `nitpicker/policy-accepted` status, removes the label and re-runs the
failed jobs, so the self-gate passes for that commit. A later push is a new commit and needs the
label again. Coding agents never add the label. The
self-gate runs the pull request's own code and workflow, so changes to `.github/workflows/`,
`core/`, `package.json` and `nitpicker.config.json` need a careful review whatever the gate says.

CI splits the test files into shards that run as parallel jobs, and the required `test` check passes
only when every shard passed. `scripts/test-shards/sequencer.mts` gives each shard about the same
total time, from the per-file times in `scripts/test-shards/durations.json`; a file that is not
listed counts as one second. The split never drops a file, it only gets less even as the times drift.
After adding or reshaping slow tests, record the times again: the script runs the suite (vitest
arguments pass through) and rewrites the times of the files it ran.

```sh
node scripts/test-shards/record-durations.mts --maxWorkers=100%
```

Java end-to-end CI uses 4 isolated runner shards and Kotlin uses 3, with files run serially in
each shard. Independent behavior groups have separate fixture trees; the full 124 Java and 110
Kotlin cases remain selected. The final `java` or `kotlin` check passes only when all its shards
pass. Reproduce a shard with `npm run test:java -- --shard=1/4` or
`npm run test:kotlin -- --no-file-parallelism --shard=1/3`. A file that runs longer than about
two minutes belongs in several files with their own fixtures, so the shards stay balanced;
`scripts/test-shards/README.md` has the timings.

Named `tools.tests.timeouts.projects` select the Java/Kotlin subject even though the harness is
JavaScript. They inherit language declaration ceilings and repository execution defaults. JVM
tests run with a three-minute deadline; Java hooks have five minutes and Kotlin hooks three.
The timeout lint rule remains active for these suites. These are bounded execution limits,
separate from slow-test thresholds and measured shard duration; see [timeout tiers](docs/usage.md#test-timeout-tiers).

After moving E2E files or changing their package-script filters, verify real Vitest discovery
(every E2E test file is gated by exactly one suite flag, and each script selects exactly the cases
its flag enables), profile coverage, the workflow wiring and the configured matrix partition
without starting a JVM build or a Python project (CI runs the same check in the shard-plan job of the
Java, Kotlin, Python and Go workflows):

```sh
node scripts/test-shards/verify-e2e-shards.mts
```

Enabled JVM suites use separate timing files: `scripts/test-shards/java-e2e.json` and
`scripts/test-shards/kotlin-e2e.json`. Ordinary recordings cannot overwrite these with the timings
of skipped E2E tests. To record a JVM suite, set its `NITPICKER_JAVA_E2E=1` or
`NITPICKER_KOTLIN_E2E=1` flag, pass the same file filters as its package script to
`record-durations.mts`, and use `--no-file-parallelism`. The recorder selects the corresponding
timing file automatically. Run one enabled JVM suite at a time. CI uploads a JSON report per
shard for reviewing durations and failures; timing provenance and limits are in
[scripts/test-shards/README.md](scripts/test-shards/README.md).

Python end-to-end CI uses two isolated shards with two test workers each and retains the final
`python-e2e` check. Reproduce one with
`npm run test:python -- --maxWorkers=2 --shard=1/2`. Enabled runs and recordings use
`scripts/test-shards/python-e2e.json` when `NITPICKER_PYTHON_E2E=1`. Enable only one language's
end-to-end suite at a time so the sequencer and recorder can choose the correct timing profile.

Go end-to-end CI uses two shards and the final `go-e2e` check. The suite (`npm run test:go`) needs Go
on the `PATH` (1.26 or newer, or an older one with the default `GOTOOLCHAIN=auto`, which downloads
1.26 to build the pinned gofumpt and goimports) and network access to the Go module proxy the
first time it builds them; timings are in `scripts/test-shards/go-e2e.json`.

`npm test` runs `languages/python/metrics/structure_metrics.py` on a real `python3`, so it needs
`python3` 3.10 or newer on the `PATH` (that test file is skipped, with its reason in the name,
without one). The Python end-to-end suite (`npm run test:python`) needs more tools and the
network; see [docs/python-preset.md](docs/python-preset.md).

## Changelog

Pull requests do not edit [CHANGELOG.md](CHANGELOG.md). Its entry for a release is written when the
release is cut, from the pull requests merged since the last tag
([docs/releasing.md](docs/releasing.md), step 2), so give a pull request a title that says what
changes for people who use nitpicker: the release draft starts from it.

To cut a release, see [docs/releasing.md](docs/releasing.md).
