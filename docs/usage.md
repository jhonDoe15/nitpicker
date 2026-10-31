# Using nitpicker

The full reference: install, how the comparison works, reports, exit codes, every command-line
option, configuration, the presets, adopting nitpicker on existing code, and running it in CI.
For a short introduction, see the [README](../README.md).

## Install

Add nitpicker as a dev dependency, together with the peers it needs from your project:

```sh
npm install --save-dev nitpicker vitest @vitest/coverage-v8 typescript @types/node
```

`pnpm add --save-dev`, `yarn add --dev` and `bun add --dev` take the same packages; run nitpicker
with `npx nitpicker`, `pnpm exec nitpicker`, `yarn nitpicker` or `bunx nitpicker`.

Requirements: Node.js 22.14 or newer (22.19 or newer for a project on TypeScript 7, see
[Type check engine](#type-check-engine)), a Git repository, and a project whose dependencies are
installed in `node_modules` by npm, pnpm, Yarn (Yarn Plug'n'Play is not supported: set
`nodeLinker: node-modules`) or Bun. The base's own install supports all four managers; nitpicker
itself is tested end to end with npm projects. nitpicker brings its own pinned ESLint, Prettier, dependency-cruiser, knip, jscpd,
Stryker and CRAP tooling and loads them from its own package, so neither side of the comparison can
choose them. `vitest` and `@vitest/coverage-v8` (4.1.11 or newer, or 5) and `typescript` come from
your project; if one is missing or incompatible, the tool that needs it fails and the report shows a
tool error.

### From a GitHub release

A release made by following [the release steps](releasing.md) also attaches the package as a
tarball, `nitpicker-<version>.tgz`, with a `SHA256SUMS` file. Install it when you want a version that
is not on npm. Keep the tarball in your repository, so teammates and CI install the same file
without access to the release:

```sh
VERSION=0.1.0-rc.1
gh release download "v$VERSION" --repo jhonDoe15/nitpicker --pattern 'nitpicker-*.tgz' --pattern SHA256SUMS --dir vendor
(cd vendor && shasum -a 256 -c SHA256SUMS && rm SHA256SUMS)
npm install --save-dev "./vendor/nitpicker-$VERSION.tgz" vitest @vitest/coverage-v8 typescript @types/node
```

`package.json` then records `"nitpicker": "file:vendor/nitpicker-<version>.tgz"`. The peers are the
TypeScript preset's; for another preset, install the tarball with the peers its guide lists, if any.
`gh` signs in with your GitHub account, which a private repository needs. On a public repository,
`npm install` takes the asset URL directly:
`https://github.com/jhonDoe15/nitpicker/releases/download/v<version>/nitpicker-<version>.tgz`.

The tarball carries the agent skills; install the one for your preset from `./node_modules/nitpicker`
as the [README](../README.md) describes.

## First run

```sh
npx nitpicker
```

Run it from anywhere inside your project. It needs no configuration.

The project is the nearest directory, up to the repository root, that holds a `package.json` or a
`nitpicker.config.json`. A repository with several projects, for example a TypeScript `web/` and a
Java `service/`, runs nitpicker once in each directory, and each reads its own
`nitpicker.config.json`. A Java project needs only that config file, no `package.json`.

Using a coding agent? Copy the [agent guidance snippet](agents-snippet.md) into your
`AGENTS.md`.

### What it compares

- **Base**: the merge base of the base ref and `HEAD`.
- **Head**: your checkout, including committed, staged, unstaged and untracked changes (ignored
  files are excluded). Your index, branches and files are not touched. In CI the checkout is clean,
  so the same command checks the committed `HEAD`.
- **Result**: every finding on both sides is fingerprinted. Only findings that are new on the head
  side and enforceable fail the run. Resolved and unchanged findings are reported but never fail.
  Descriptive findings and metric changes are reported only.
- **Mutation testing** in a comparison mutates, for TypeScript, only the source lines the change
  adds or edits on the head side, so every surviving mutant it reports is new. When the change
  edits or deletes a test, the production modules that test imports are mutated whole on head, and
  a mutant there fails only if the base tests caught it and head's tests no longer do ("This change
  weakened the tests of ..."). Python's mutmut
  works per function, not per line: head reuses the base results for the modules the change did
  not edit and that import no edited module, and runs every other mutant (all of them when a test
  or any other file changed). Only mutants that are new on head fail, whichever way the results
  were obtained. `--all` mutates every source file.

### A base whose tests fail

A change that repairs a red base is not blocked. A base is red when its tests ran and at least one
named test failed, while the tests of the head pass. The run is then not a tool error in any
preset: the report carries a note (`notes.json`, a `Notes:` section of `report.txt`, one line in
the console summary, a `system-out` element in the JUnit file and a `note` notification in the
SARIF file) and the run is judged as follows.

- The base results of the checks that need passing tests are unknown: changed-branch coverage
  (`changed-branch-coverage`), CRAP (`crap-score-limit`, `crap-coverage-unknown`), mutation
  (`mutant-*`), slow tests (`slow-test`), test console output (`test-console-output`) and the
  coverage and efficiency descriptions (`uncovered-function`, `uncovered-method`, `line-coverage`,
  `test-efficiency`). Every other check (lint, format, types, structure, duplicates, coupling, file
  limits) is compared with the base as usual.
- A finding of those checks on the head is new when its file is added by the change or it sits on a
  line the change adds, edits or deletes from (a CRAP finding: anywhere in a function that has an
  edited or deleted line). Any other one is unchanged and does not fail, so legacy code cannot fail
  merely because the base had no data. An edited function over the CRAP limit therefore fails,
  because there is no base score to hold it against: test it or split it.
- In a build with several modules (Gradle projects, Maven modules) only the modules whose tests
  fail are unknown on the base. The modules whose tests pass are compared with the base as usual.
  A failing root project is unknown only for its own source and test directories, so the modules
  below it keep their comparison; a TypeScript or Python project counts as one module.
- A change that removes tests gets no help from the red base. When a test file loses more lines
  than it gains, or a test file is deleted, every test-dependent result of the head counts as new,
  as it would on a green base, and a `tests-removed` note says so. A test that is weakened without
  losing lines cannot be told apart from a repaired one, because the base has no mutation data.
- A base whose tests did not run is not a red base. Code that cannot be loaded (an unresolved
  import in a TypeScript test, a Python collection or syntax error), a project that does not
  compile, a test run that exits non-zero without naming a failing test and a run that times out
  are tool errors on the base too: `tests-not-run` for TypeScript and Python, `gradle-failure` or
  `maven-failure` for Java and Kotlin. A test that fails by timing out is an ordinary failing test
  when the runner names it, so a flaky base counts as red.
- A red head still fails. Its tool error is `tests-failed` for TypeScript and Python and
  `gradle-failure` or `maven-failure` for Java and Kotlin. When base and head are both red, both
  are listed as tool errors.
- A base that does not type-check (`typecheck-failed-skipped`) or whose build fails for any other
  reason is still a tool error.
- Java and Kotlin Gradle builds run the base with `--continue`, so every module's tests run, and
  rerun it without the tests of the failing modules (any failing `Test` task counts, not only
  `test`) to read the other checks. A Maven base does not need a rerun: the build
  runs with `-Dmaven.test.failure.ignore=true`, so the Surefire and Failsafe reports of a failing
  module are read and only that module skips JaCoCo and PIT.

The base ref is the first match of:

1. `--base <ref>`
2. the pull request target branch from CI (`CHANGE_TARGET`, `GITHUB_BASE_REF`,
   `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, `SYSTEM_PULLREQUEST_TARGETBRANCH`,
   `BITBUCKET_PR_DESTINATION_BRANCH` or `BUILDKITE_PULL_REQUEST_BASE_BRANCH`)
3. `base` in `nitpicker.config.json` (not `HEAD`, the branch you are on, or its commit)
4. the remote's default branch (`refs/remotes/<remote>/HEAD`, using `upstream` if it exists and
   `origin` otherwise)
5. `origin/main`, then `origin/master`

In CI, fetch enough history to contain the merge base (for example `fetch-depth: 0`). Recipes for
GitHub Actions (with a composite action), GitLab CI and Jenkins are in [nitpicker in CI](ci.md).

**Dependencies of the base.** The base is checked out in a temporary worktree. The package
manager's folder is the nearest folder from the project up to the repository root that holds a
lockfile (the project folder itself in a single-package project; the workspace root when the project
is a member). When `package.json`, a lockfile (`package-lock.json`, `npm-shrinkwrap.json`,
`pnpm-lock.yaml`, `yarn.lock`, `bun.lock` or `bun.lockb`), `pnpm-workspace.yaml` or a manager
config (`.npmrc`, `.yarnrc`, `.yarnrc.yml`, `bunfig.toml`) there equals the head's, the base shares
your `node_modules`; the `node_modules` of workspace packages are linked too, with workspace
siblings pointing at the base's copy. Otherwise the base gets its own frozen install with scripts
disabled, run in that folder with the manager the base uses: the `packageManager` field of its
`package.json`, else its lockfile (pnpm, Yarn, Bun, npm, in that order), else npm. The commands,
without the flags that only quiet or speed up the run (`--no-audit`, `--no-fund`,
`--prefer-offline`, `--non-interactive`):

| Manager | Command                                                             |
| ------- | ------------------------------------------------------------------- |
| npm     | `npm ci --ignore-scripts`                                           |
| pnpm    | `pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile` |
| Yarn 1  | `yarn install --frozen-lockfile --ignore-scripts`                   |
| Yarn 2  | `yarn install --immutable --skip-builds`                            |
| Yarn 3+ | `yarn install --immutable --mode=skip-build`                        |
| Bun     | `bun install --frozen-lockfile --ignore-scripts`                    |

The install does not run code from the base's repository: pnpm ignores `.pnpmfile.cjs`, Yarn runs
with `YARN_IGNORE_PATH=1` (it ignores `yarn-path` and `yarnPath` and uses the Yarn that Corepack or
`PATH` provides, not the release committed in the repository), and a base whose `.yarnrc.yml`
lists `plugins` fails with an error, since Yarn runs plugins during an install. A project without a
`packageManager` field uses the version Corepack or `PATH` provides. A missing manager is a tool
error that names how to get it (`corepack enable pnpm` or `npm install --global pnpm`,
`npm install --global bun`; Node.js no longer bundles Corepack from version 25, so install it
first there). A lockfile that does not match its `package.json` fails the frozen install and the
tool error carries the manager's message. Installing the base is not supported on native Windows
(run nitpicker in WSL).

### Reports

A comparison run writes these files to `reports/quality/diff/`:

- `report.txt`: the readable report.
- `summary.json`: totals, per-tool counts and the fields below.
- `new-findings.json`: the new findings, the ones that count against the change.
- `resolved-findings.json`: findings that were in the base and are gone.
- `changed-metrics.json`: metrics that moved.
- `held-findings.json`: findings that were already there and are no worse than at the base (for
  example a file over a size limit that did not grow); they are allowed, and any increase fails.
- `tool-errors.json`: the tool errors, whatever the exit code.
- `notes.json`: informational notes the run reports but does not fail on, such as a base whose
  tests fail (see "A base whose tests fail" below).
- `report.junit.xml`: JUnit XML for CI test reports.
- `report.sarif`: SARIF 2.1.0 with the new findings only, the file to upload to code scanning.
- `report-baseline.sarif`: SARIF 2.1.0 with the new and the held findings, each marked with its
  `baselineState`, for tools that read it.
- `codequality.json`: the new findings as a GitLab Code Quality report (see
  [GitLab CI](ci.md#gitlab-ci)).

`--all` has no baseline, so it writes `reports/quality/snapshot/` with `report.txt`, `summary.json`,
`findings.json` (every finding in the checkout), `tool-errors.json`, `report.junit.xml`,
`report.sarif` and `codequality.json`.

The summary records every config override, a policy hash, the `policyChanges` the head config makes
against the base and any `notices`. A notice is information that never fails the run. Today there is
one kind: changed code files that lie outside the roots the preset checks. For TypeScript those are
`layout.sourceRoots` and `layout.testRoots` (move the files under a root or add their folder to
`layout.sourceRoots`); for Python, `python.sourceRoots`; for Java and Kotlin, the build's source
sets (`src/<set>/java` or `src/<set>/kotlin` of a module, or a directory the build file declares).
To leave files unchecked, list them in `exclude`. Choose another directory with `--output <dir>`.

The console summary shortens mutation findings: the mutants that no test runs print as one entry
per function (with their count and lines), and a function prints at most three surviving mutants,
then how many more there are. The headline still counts every mutant, and the reports above list
each one.

Set `NO_COLOR` to disable colored console output. On GitHub Actions the run also writes a job
summary and `::error` annotations for the new enforceable findings (see
[Job summary and annotations](ci.md#job-summary-and-annotations)).

#### SARIF

The SARIF files have one run with one result per finding. `ruleId` is `<tool>/<rule>`, `level` is
`error` for an enforceable finding and `note` for a descriptive one, and
`partialFingerprints["nitpickerIdentity/v1"]` is the hash of the finding's comparison key, so a
consumer matches a finding across runs when its line moves. A tool error makes the run's invocation
unsuccessful and adds a notification; a note (such as a red base) adds a `note`-level notification
without changing the outcome. Columns are counted in UTF-16 code units
(`columnKind: "utf16CodeUnits"`), a tab counting as one: nitpicker converts the columns of ruff
(code points), Error Prone (tabs expanded to every eighth column) and Checkstyle (tabs expanded to its
`tabWidth`, 8 unless the project Checkstyle config the run uses sets it). mypy versions count
columns differently, so a mypy finding on a line with non-ASCII text has a line and no column.

| File                    | Run        | Results                                      | `baselineState`    |
| ----------------------- | ---------- | -------------------------------------------- | ------------------ |
| `report.sarif`          | comparison | `new-findings.json`                          | `new`              |
| `report-baseline.sarif` | comparison | `new-findings.json` and `held-findings.json` | `new`, `unchanged` |
| `report.sarif`          | `--all`    | `findings.json`                              | not set            |

GitHub code scanning does not read `baselineState`: every result it receives becomes an open alert.
So `report.sarif` of a comparison holds only the new findings, and the held ones, which the change
is allowed to keep, are only in `report-baseline.sarif`. Fixed findings (`resolved-findings.json`)
are in neither file, since a result is read as a problem in the current code; findings that were in
both snapshots and are not held are in no report file.

A `uri` is relative to the root of the git repository: the folder of the project inside the
repository, then the finding's path, percent-encoded, with `uriBaseId: "%SRCROOT%"` naming the
repository root. A project in `packages/app` reports `packages/app/src/a.ts`, which is how code
scanning matches a result to a file. `originalUriBaseIds` gives `%SRCROOT%` the repository root as a
`file://` URI, so other SARIF viewers can open the files; it is the absolute path of the checkout on
the machine that ran nitpicker, so a SARIF file shared outside it shows where that checkout was.
When nitpicker cannot find the repository root (the `aggregate` command outside a git checkout),
paths stay relative to the project, with no `uriBaseId` and no `originalUriBaseIds`. A finding about
the whole project (no file) points at the project folder, or `.` for a project at the repository
root.

GitHub code scanning rejects an upload whose run has more than 25,000 results or whose file is over
10 MB gzipped. A SARIF file that would pass either limit lists only as many findings as fit, new
findings first (so on a large legacy project `report-baseline.sarif` is the file that gets cut),
and ends its notifications with a `warning` that gives the count and the JSON file that has every
finding.

Upload the comparison file in pull requests with `github/codeql-action/upload-sarif`:

```yaml
- run: npx nitpicker
  working-directory: packages/app
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: packages/app/reports/quality/diff/report.sarif
    category: nitpicker-diff
```

Code scanning closes an open alert when a later upload in the same `category` no longer has it, so
give each kind of run its own category: a `--all` upload on the default branch
(`reports/quality/snapshot/report.sarif`) goes in another category, such as `nitpicker-all`, or the
next comparison upload would close the alerts it opened.

## Exit codes

| Code | Meaning                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| 0    | Completed with no new enforceable findings. A run narrowed with `--analyzer` checked only the analyzers it names. |
| 1    | At least one new enforceable finding (`--all`: any violation), even if a tool also errored.                       |
| 2    | A tool error and no new enforceable findings, invalid arguments, invalid config, or any other failure to decide.  |

A tool error never counts as a pass. When a run has both findings and tool errors it exits 1, and the
tool errors are still listed in the console and reports and recorded in `summary.json`
(`overallStatus` stays `tool-error`). `nitpicker aggregate` applies the same rule. With `--defer-exit`, a comparison always exits 0 once it has
written its reports; use it only for shard workers that are followed by `nitpicker aggregate`.

A full run can take several minutes. While it runs, nitpicker writes a line to stderr when each
snapshot starts and when an analyzer that took 10 seconds or more finishes, fails or is skipped,
labelled `base` or `head` for the two snapshots (for example
`nitpicker: head eslint-lint done (41s), 3 of 9`, or `skipped (tests failed)` for an analyzer whose
dependency failed); stdout still carries only the final summary. Only one run can work in a project
at a time. A second `nitpicker` started meanwhile prints `nitpicker: another run is in progress in
this project (pid 1234); wait for it to finish.` and exits 2. The lock is a pid file in the
repository's `.git` directory (`nitpicker-run-*.lock`); a lock whose process is gone is taken over
automatically.

## Command line

```text
nitpicker [--base <ref>] [--output <dir>] [--all | --fix]
          [--analyzer <name>]... [--rule <substring>]...
          [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache]
          [--accept-policy-change=<digest>] [--help]
nitpicker aggregate --input-root <dir> --shard-count <n>
          [--output <dir>] [--policy-root <dir>]
nitpicker cache publish [--analyzer <name>]...
          [--shard-count <n> --shard-index <i>]
nitpicker base [--base <ref>]
```

- `--all`: report every finding in the current checkout, with no baseline. Exits 1 on any violation.
  Cannot be combined with `--base`, `--fix`, sharding or `--defer-exit`.
- `--fix`: apply ESLint and Prettier fixes to the changed files in your checkout, using the gate's
  own configs, then run the comparison. A fixer that fails is reported as a tool error; the other
  fixer and the comparison still run. Cannot be combined with `--all`.
- `--base <ref>`: the ref to compare against.
- `--analyzer <name>`: run only this analyzer and the analyzers it depends on (repeatable). Cannot
  be combined with sharding. A narrowed run says so: the console, `report.txt` and the GitHub step
  summary print `Ran only: <names>. Run nitpicker without --analyzer before you finish.`, and
  `summary.json` records `partialRun: { ran, skipped, message }` (`skipped` lists the analyzers
  left out). Its exit 0 is not a pass. An unknown name exits 2 and leaves the previous reports in
  place.
- `--rule <substring>`: list the findings whose rule matches, after the summary (repeatable).
- `--output <dir>`: where reports go.

- `--no-cache`: do not read or write the findings cache for this run (local and remote).
- `--accept-policy-change=<digest>`: accept the loosenings of `nitpicker.config.json` whose digest
  the console and the `nitpicker-config/policy-loosened` findings name (see
  [Configuration](#configuration)). It is
  for the person reviewing the change, never for a coding agent, so it is honoured only at an
  interactive terminal (stdin and stdout both terminals); in CI, where `CI` is set, a person sets
  `NITPICKER_ACCEPT_POLICY_CHANGE=<digest>` instead, and that variable is ignored anywhere else. An
  ignored acceptance is named on stderr and the run still fails. The digest covers every loosening
  in full and the content (git blob id) of each file it names, and `summary.json` records it as
  `policyDigest`: editing a named file or adding a loosening changes it and fails again.
- `nitpicker cache publish`: analyze the committed `HEAD` tree and upload its findings to the remote
  cache so later branches reuse them as their base. Requires `NITPICKER_CACHE_URL`; exits 0 when
  everything was uploaded and 2 otherwise.
- `nitpicker base [--base <ref>]`: print the base a comparison would use, picked as listed under
  [What it compares](#what-it-compares), so a CI script can fetch it before the run.

### Findings cache

The base side of a comparison is cached per analyzer; the head side always runs. The key covers the
merge-base commit, project path, analyzer name and version, the analyzer's configuration hash, the
config-file overrides and the head policy (`exclude`, `layout`, `exceptions`, `thresholds`, `react`, `i18n`, `testConsole`, `history`) with the
legacy inventory path, so changing any of them is a miss. A content fingerprint of nitpicker's
package manifest and shipped code and tool configs is computed once per process and included in
the key, so changing rules without a version bump also invalidates old findings. Only clean
reports are stored. When the base is reused, the progress line names the local cache directory
(or the remote cache when there is no local directory); use `--no-cache` to rerun the analysis.

- `NITPICKER_CACHE_DIR`: local cache directory (relative to the project root). Default:
  `node_modules/.cache/nitpicker`.
- `NITPICKER_CACHE_URL`: remote cache prefix; an entry is `GET`/`PUT` at `<url>/<key>.json`.
  Optional `NITPICKER_CACHE_AUTH_HEADER` and `NITPICKER_CACHE_TIMEOUT_MS`. Comparison runs only
  read the remote; give write credentials only to the job that runs `cache publish` on `main`.

See [typescript-single-command.md](typescript-single-command.md) for the full model.

## Configuration

Optional. Put `nitpicker.config.json` at the project root. The head is measured with the head's
config. The base is measured with the base's own `nitpicker.config.json` when it has one that
differs, widened to what the head reads and tightened to what the head checks: the head's added
source and test roots are added; an `exclude`, `layout.excludedGlobs`, `layout.entryPoints`,
`disable` or `exceptions` entry the head drops is dropped; and each threshold
is the lower of the two sides. Code that was already there stays baselined when a change brings it
under the gate or tightens the policy. A finding is new only if the change added it. With no config on the base, or an identical one, the head's config applies to
both sides; a base config that does not load is ignored the same way, and the head's config is then
compared with the defaults. Because the head controls its own config, every change to it is printed
in the console summary and in `report.txt` as "Policy changed in this change" and listed in
`summary.json` under `policyChanges`. A change that checks less fails the run with one
`nitpicker-config/policy-loosened` finding per loosening. The console groups those changes by kind:
it lists the changes of a kind, then what that kind does to the checks and how to undo it, once
(ten new entry points print the entry point guidance once), followed by the count, the digest and
the acceptance command. `report.txt` and `new-findings.json` keep one finding per change, each with
its guidance and the acceptance route. The first response is to undo the change and fix the code
until it passes. If the change is intended, a coding agent stops and asks a person reviewing it, who
accepts it by the digest (`--accept-policy-change=<digest>` or, in CI,
`NITPICKER_ACCEPT_POLICY_CHANGE=<digest>`; the routes are described under
[Command line](#command-line)). A local run and CI can print different digests, because CI may
check the pull request merged into its target branch. A project's first `nitpicker.config.json` is
compared with the defaults. These changes are loosening:

- an added `exclude`, `layout.excludedGlobs`, `layout.entryPoints` or
  `exceptions` glob that covers a code file the base config did not already cover (every
  tracked code file of the preset, wherever it is: `.ts`/`.js` family files for TypeScript and
  JavaScript, `.py` files for Python, `.java`, `.kt` and `.kts` files for Java and Kotlin, so
  excluding a folder outside the roots that production code imports is loosening too). `exclude`
  and `layout.excludedGlobs` are one set: a glob respelled to cover the same files, or moved from
  one key to the other, is listed but does not fail. Files moved with `git mv` keep their base
  path, so updating a glob after a move is not loosening; a glob that covers no new code file is
  listed but does not fail. A `layout.entryPoints` entry makes the dead-code check treat the files
  as used and allows module-load effects and process access in them, and a `python.entryPoints`
  entry only exempts them from `process-env-access`; other checks still apply. A reviewer confirms
  that a command or runtime loads each file without an import, and otherwise the entry is removed;
- a removed `layout.sourceRoots`, `layout.testRoots` or `python.sourceRoots` entry that still has
  checked files under it (Python's detected default counts when the setting is absent), and an
  added `layout.testRoots` entry that turns production code the base checked into test code;
- a code file the change adds or moves to a path the head hides, decided per file: by `exclude`
  and `layout.excludedGlobs` (one set), by the exception paths of one rule (`exceptions`), or by a test root inside a source root. It passes only when the base config
  hid the same path in the same set and a base glob or root that hid it there already covered
  code of the base (an established `vendor/**` or `**/fixtures/**`): otherwise an idle glob is
  listed when it is added, and the code that later arrives under it fails then, however the glob
  is spelled. Even under an established exclusion or test root the file fails when production code
  reaches it: imports from files under the source roots that are neither tests nor hidden, followed
  through other hidden files (a barrel re-exporting a new file), plus the `main`, `bin` and
  `exports` targets of any `package.json` and the `layout.entryPoints` files. So a feature cannot be
  written under an excluded folder and used from the checked code. Exceptions under an established
  glob do not fail on imports, because the file is still checked by every other rule. The import
  walk reads `import` statements: TypeScript and JavaScript through the module resolver, Python
  through the same import scan the coupling rules use (relative imports, `from x import y`,
  parent packages), Java and Kotlin from `import` lines, same-package use of a type or top-level
  declaration by name (unless an explicit import of the same simple name shadows it, and for a
  top-level Kotlin function or property only a use without a receiver), and qualified names in the
  code, starting at the files under the main source directories;
- a `tsconfig.json` removed, or `checkJs` turned off in any of the project's tsconfig files (the root
  one, per-package ones and the configs they reference), with the TypeScript preset;
- a build file that makes the build measure less, compared with the base, counting only what
  nitpicker runs (the project and its `activeByDefault` profiles, the Gradle `test` task and the
  compile tasks, not resources): a Gradle `sourceSets` `srcDirs` assignment, or a module whose
  build file is gone, that leaves out a folder holding checked code (adding a directory, or
  switching between Maven and Gradle or between the Groovy and Kotlin DSL on the same roots, is not
  loosening); an added Gradle `exclude` in a source set, a compile task or the `test` task (also
  written as `test.exclude`, `tasks.test.configure`, `tasks.named("test")` or
  `withType<JavaCompile>`), `excludeTestsMatching`, `excludeTags`, `excludeEngines`,
  `enabled = false` or `onlyIf { false }`, and an `include`, `includeTestsMatching` or
  `includeTags` that leaves out a checked file; with Maven, a `sourceDirectory`,
  `testSourceDirectory` or `build-helper` source that leaves out checked code, an added surefire
  `excludes`, `excludedGroups` or skip flag, surefire `includes`, `groups` or `test` that leave out
  a test surefire would run, a failsafe `excludes`, `excludedGroups`, skip flag, or a `skipITs`
  or `skipTests` property (which keep nitpicker's build from running Failsafe) that covers an
  integration test while a pom binds Failsafe, and an added compiler `excludes`, `testExcludes`,
  `includes` or `testIncludes`, including those in a parent's `pluginManagement`, counted against
  the modules under it. A `maven.test.skip` property is not loosening, and a `skipTests` property
  never counts against unit tests, because nitpicker runs them itself. With Python, `pytest` `testpaths` that stop collecting a test
  file and an added `--ignore` or `--ignore-glob` in `addopts`, both counted only for files pytest
  collects (`python_files`), and a `[tool.mutmut]` `do_not_mutate` pattern that covers production
  code; `-k`, `-m` and `--deselect` are removed from the run and their tests are
  `uncollected-tests` findings instead. An added exclude that covers no checked file is listed and
  does not fail;
- a generated-file marker added to a file the base checked: a generator header, a `@Generated`
  annotation naming a known generator, or the marker the TypeScript, JavaScript and Python presets
  read, any of which makes the checks skip the file;
- an edit of a project tool config the project opted into: an XML rule file in `config/pmd/` or
  `config/checkstyle/` while `tools.pmd.precedence` or `tools.checkstyle.precedence` lists
  `"project"` on both sides, the Kotlin preset's detekt config (`kotlin.detektConfig` or the
  detected `config/detekt/detekt.yml`) while `tools.detekt.precedence` lists `"project"` or
  `kotlin.detektConfig` is set, the `.editorconfig` files that `ktlint` or `ktfmt` read while their
  `precedence` lists `"project"` (only the lines before the first section and the sections whose
  glob matches `.kt` or `.kts` files), the Prettier config files while
  `tools.prettier.precedence` lists `"project"` (the `prettier` key of `package.json` only, and in
  `.editorconfig` only the sections that match the files Prettier formats), and the ESLint flat
  config at the project root with every local file it imports while `tools.eslint.precedence`
  lists `"project"` (turning a nitpicker rule `"off"` there has no effect, but changing its
  options does). An edit that only
  changes comments, blank lines or layout is not counted. Whether an edit is stricter or looser is
  not judged, so a person reviews it; a removed file is listed;
- a newly disabled analyzer, a threshold above the base's (a removed threshold counts at its
  default), and a removed or changed custom analyzer (any change to its `command` or `args`);
- a `preset` that checks less: an explicit preset changed to another one, or `javascript` set where
  `typescript` ran, or a first preset on a project whose TypeScript or JavaScript sources the
  default preset checks. Setting the preset that ran, dropping `typescript`, `javascript` to
  `typescript`, and the preset that a project without such sources must declare (the run stops
  with "no \"preset\" is set" otherwise) are not loosening;
- `react.enabled`, `i18n.enabled` or `python.importLinter` set to `false`, `kotlin.formatter` set to `none`, and
  any change of `kotlin.detektConfig`;
- a tool `precedence` that puts `"project"` first where it was not first, or that drops
  `"nitpicker"` (for `pmd`, which runs both rule sets, only dropping `"nitpicker"` counts);
- a name removed from a `spring.roles` list (adding one only adds checks).

Choosing another tool that runs the same checks is not loosening and is only listed:
`tools.eslint.engine`, `tools.typescript.engine`, `python.typeChecker`, `python.formatter`,
`python.testRunner`, `python.environment` and a `kotlin.formatter` other than `none`. Other changes
(`base`, added roots, `legacyInventory`, and tightenings: a removed `exclude`, `layout.excludedGlobs`,
`layout.entryPoints` or exception path, a re-enabled analyzer, a lowered threshold, `checkJs` turned
on in a tsconfig) are listed and never fail; an added
`nitpicker.legacy.json` entry fails on its own as `baseline-expansion`. With sharding, the first
shard reports the findings. Unknown keys and
invalid values are an error (exit 2). Every override is listed in the report and changes the policy
hash, so a weakened check is visible in review.

```json
{
  "base": "origin/develop",
  "preset": "typescript",
  "disable": ["mutation"],
  "thresholds": { "crapLimit": 12 },
  "exclude": ["src/vendor/**"],
  "duplicates": { "skippedFolders": ["dist", "generated", "target"] },
  "layout": { "sourceRoots": ["lib"], "testRoots": ["spec"], "excludedGlobs": ["**/vendor/**"] },
  "exceptions": [
    {
      "rule": "nitpicker/preserve-error-cause",
      "paths": ["lib/legacy/**"],
      "reason": "Legacy module until the migration"
    }
  ],
  "react": { "styling": "css-in-js" },
  "analyzers": [{ "name": "house-rules", "command": "./scripts/house-rules", "args": ["--ci"] }],
  "legacyInventory": "config/nitpicker.legacy.json"
}
```

| Key               | Type                                                                       | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`            | string                                                                     | Base ref used when neither `--base` nor a CI target branch is given. It must not follow the commit you are on: `HEAD`, `@`, an expression that resolves through them (`HEAD~0`, `@{0}`), the branch you are on, or a SHA equal to `HEAD` is a config error, because the change would be compared with itself. Another branch such as `origin/main` is accepted even when it points at the commit you are on, so uncommitted work on an up-to-date branch is still checked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `preset`          | `"typescript"`, `"javascript"`, `"java"`, `"kotlin"`, `"python"` or `"go"` | The preset; default `typescript`. `javascript` gates a plain JavaScript project; see [JavaScript preset](#javascript-preset). `java` and `kotlin` gate a Gradle project, `python` a Python project and `go` a Go module; none of them is auto-detected. Without `preset`, a project whose source roots hold no TypeScript or JavaScript but that has `pom.xml`, `build.gradle(.kts)` or `settings.gradle(.kts)` (Java, or Kotlin when `.kt` files outnumber `.java`), `go.mod` (Go), or `pyproject.toml`, `setup.py` or `setup.cfg` (Python), stops with a config error (exit 2) naming the preset to set. The check is best-effort: files under `resources`, `static`, `public`, `assets`, `webapp` or `wwwroot` folders and `*.min.js` files are bundled assets and do not count as TypeScript or JavaScript; see [Java preset](#java-preset), [Kotlin preset](#kotlin-preset), [Python preset](#python-preset) and [Go preset](#go-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `disable`         | string[]                                                                   | Analyzer names to turn off, without duplicates. An unknown name is an error. Disabling an analyzer also turns off every analyzer that depends on it, and a note on stderr names them (`coverage` is needed by `crap` and `test-console`, so `"disable": ["coverage"]` turns off all three; a config written before `test-console` existed keeps working).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `thresholds`      | object                                                                     | `crapLimit`: a positive number. A function whose CRAP score is at or above it is a finding. The default is 9. TypeScript, JavaScript, Java, Kotlin and Python. Whole numbers for the file limits: `fileLines` (lines per source file, default 300), `testFileLines` (per test file, default 500), `lineLength` (characters per line, default 120; imports, URLs and the text inside string literals are not counted) and `folderFiles` (source files, and separately test files, directly in one folder, default 6; only code files of the language count, so config and asset folders are never checked, and test files under a `fixtures` folder are skipped). A file or folder already over a limit on the base fails only when it grows, and a folder moved to a new path is matched to its old path. Every preset, except `lineLength` with Java and Kotlin, where setting it is a config error: nitpicker checks the `.java` files at the width of the Java formatter (100 for google-java-format, 120 for palantir-java-format) or at the width of the project's Checkstyle `LineLength`, and a `java.lineLength` convention pins any width from 10 to 999 (text blocks are not counted), and detekt's `MaxLineLength` checks the Kotlin files. Java and Kotlin only: `unitTestSeconds` (default 5) and `integrationTestSeconds` (default 30), the seconds one test the change adds or edits may take (see [slow tests](java-preset.md#slow-tests)); with another preset they are a config error. Java and Kotlin only: `unitTestSeconds` (default 5) and `integrationTestSeconds` (default 30), the seconds one test the change adds or edits may take (see [slow tests](java-preset.md#slow-tests)); with another preset they are a config error. Generated sources a build registers (Java, Kotlin) belong in `exclude`. The size thresholds are below the table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `exclude`         | string[]                                                                   | Globs relative to the project root (`**`, `*`, `?`, `{a,b}`), added to the built-in exclusions: the project-root folders `dist`, `build`, `generated`, `coverage`, `reports` and `target`, and `node_modules` at any depth (a folder such as `src/build/` is analysed). Generated code needs no `exclude`: a file named like generated code (`*.gen.*`, `*.generated.*`, `*.pb.*`, `*_pb.*`, under `__generated__/`) or a tracked code file in one of those root folders counts as generated, skipped by the layout checks and importable from the source roots, when one of its first five lines carries a generator marker such as `// @generated`; any code file counts when its leading comments carry the exact header a known generator writes (OpenAPI Generator's `auto generated by OpenAPI Generator (https://openapi-generator.tech)`, protoc's, Thrift's, or `// Code generated by <tool>. DO NOT EDIT.`). That marker is the allowed form for generated code; without it the file is checked like any other. With the Java and Kotlin presets the one way is the build output: let the generator write under `build/generated/` (Gradle) or `target/generated-sources/` (Maven), which is never analyzed. A file elsewhere counts as generated only through a known generator's header or a `@Generated` annotation naming a known generator. Adding any generated-file marker to a file the base checked is a policy loosening, for every preset. Hand-written `*.d.ts` files under the source roots are linted, and the type check reads their declarations, but it runs with `skipLibCheck`, so it reports no errors inside any `.d.ts` file; coverage, CRAP and mutation skip them. Excluded files are skipped by every analyzer and are absent from the dependency graph. With the Java and Python presets the built-in list does not apply and findings whose path matches a glob are dropped (Python also keeps those files away from ruff and black).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `duplicates`      | object                                                                     | `skippedFolders`: an array of folder names (no slashes, commas, glob characters or leading `!`, no repeats; empty is allowed) that the duplicate-code scan skips at any depth. Every preset. It replaces the built-in list, so name every folder you still want skipped. The built-in lists are the project-root `dist`, `build`, `generated`, `target` for TypeScript and JavaScript (a nested `src/build/` is scanned); `build`, `generated`, `target`, `out` for Java and Kotlin; `build`, `dist`, `tests`, `test`, `migrations` for Python. Use it when a real package is called `build`, `dist` or `test`. Dependency, hidden and tool-output folders (`node_modules`, `coverage`, `reports`, `.venv`, `__pycache__` and the like) and the Python test files stay skipped. To skip files, use `exclude`. The base snapshot is scanned with the same list as the head, so changing it never turns an old clone into a new one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `layout`          | object                                                                     | The TypeScript and JavaScript presets take every key. `sharedRoots` and `featureRoots` are taken by every preset that runs `shared-used-by-one-feature` (today TypeScript and JavaScript; the [checks table](../spec/checks.md#custom-rules) says where), and are an error with the others until they run it, except that every preset takes `featureRoots` once `history.coChange` is on (it names the folders whose children `co-change` treats as one module each); the other keys are TypeScript and JavaScript only. `sharedRoots` and `featureRoots`: arrays of folder globs inside the project (a Java or Kotlin package is its folder, such as `**/com/acme/shared`) that `shared-used-by-one-feature` reads: a module under a shared root that only one feature reaches is reported, and each folder directly under a feature root is one feature. A glob that can never match is an error: a leading `./`, a trailing `/`, a regular-expression flag such as `(?i)` (globs match case-sensitively) or an unclosed `{`; `[` and `]` match themselves, so a Next.js route folder such as `src/app/[id]` is written as it is. For `shared-used-by-one-feature` they default to `<sourceRoot>/main/shared` and `<sourceRoot>/main/features` in the TypeScript and JavaScript presets and to `**/shared` and `**/features` elsewhere; `[]` turns the rule off. For `co-change`, `featureRoots` defaults to `**/features` in every preset, which also matches `<sourceRoot>/main/features`. In TypeScript they move only that rule: the import boundary rules keep `<sourceRoot>/main/shared/` and `<sourceRoot>/main/features/`. `sourceRoots` (default `["src"]`) and `testRoots` (default `["test", "tests", "__tests__", "e2e"]`; a missing folder is ignored): non-empty arrays of directories inside the project, with no absolute paths, `..` or globs. `excludedGlobs`: an array of globs that replaces the built-in exclusions. `entryPoints`: an array of globs of files that are started or loaded by path (a spawned script, a worker, a config read by another tool) and so are never imported; the dead-code check treats them as entries and the module-load-effects check skips them. A root `e2e/` of Playwright or Cypress specs is linted and type-checked like tests but needs no production import, is never mutated and is not run by the default quality test run (a `testRoots` you list yourself is always run). A Jest project whose root `__tests__/` the quality test run cannot execute lists its own `testRoots` or adds `__tests__/**` to `exclude`. Other keys are an error. The strict preset puts features under `<sourceRoot>/main/features/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `exceptions`      | object[]                                                                   | The TypeScript, JavaScript, Java and Kotlin presets; with `python`, only for the file limits (`file-lines-limit`, `folder-files-limit` and `line-length-limit`) and the [repository checks](#dependency-and-repository-checks) (`committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`) and the function rules below, and `co-change`, and `python` has `python.exceptions` for its other rules. Lifts a strict rule for some paths: `{ "rule", "paths", "reason" }`, all required, plus `function` (the name of one function) for `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage` (required) and the mutants `mutant-survived` and `mutant-nocoverage`, and `name` (one declaration) for the dead-code findings `exports` and `types`; the message of each finding prints the entry, see [Exceptions for rules nitpicker adds](#exceptions-for-rules-nitpicker-adds). `rule` must be a rule the preset configures (with `java` and `go`: the finding as printed, `<tool>/<rule>`; with `kotlin`: one of the one-way rules, see [Kotlin preset](#kotlin-preset)) or one of the file limits `file-lines-limit`, `line-length-limit` and `folder-files-limit` (and the size rules below; the TypeScript preset also takes `component-story-missing` and the reuse rules `shared-used-by-one-feature`, `duplicate-definition`, `sibling-copy-edit`, `exported-name-collision`, `redefined-library-component` and `new-icon-asset`, the Java and Kotlin presets the reuse rules `duplicate-definition`, `sibling-copy-edit` and `exported-name-collision`, and a `domain-*` architecture rule, whose `paths` are the importing files); with every preset also the [dependency and repository checks](#dependency-and-repository-checks) (`committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`) and the [change history](#change-history) rule `co-change` (with a `<module>/**` glob), and with the TypeScript and JavaScript presets `unused-dependency`, `unlisted-dependency`, `unresolved-import` and `nitpicker/no-dev-dependency-in-production`; `paths` a non-empty glob array, `reason` a non-empty text, and for `unused-dependency`, `unlisted-dependency` and `unresolved-import` an optional `packages` array that limits the exception to those package names (import specifiers for `unresolved-import`). A file matching a file-limit exception is not checked and not counted in its folder; a `folder-files-limit` path may also name the folder itself. Each exception is listed in the report and changes the policy hash. See [The strict preset](#the-strict-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `react`           | object                                                                     | TypeScript preset only; with `"preset": "javascript"` it is a config error. The React rule scope; see [React](#react). `enabled` (`true` or `false`) forces it on or off; without it the scope is on when `react` is in the project's `package.json` `dependencies` or `devDependencies`. `styling` (`"class-names"`, `"css-in-js"`, `"inline-style"` or `"style-sheet"`; inferred from what the source files use when unset) is the one styling approach the project uses. Other keys are an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `i18n`            | object                                                                     | TypeScript preset. The i18n rule scope for `react-intl`; see [Internationalized messages](#internationalized-messages). `enabled` (`true` or `false`) forces it on or off; without it the scope is on when `react-intl` or `@formatjs/intl` is in the head checkout's `package.json` `dependencies` or `devDependencies`. `functionNames` and `componentNames` (string arrays) name wrappers of `formatMessage` and `FormattedMessage` that are checked too. Other keys are an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `testConsole`     | object                                                                     | Every preset that runs `test-console-output` (today TypeScript, JavaScript, Java and Kotlin, not Python yet; the [checks table](../spec/checks.md#custom-rules) says where); an error with the others until they run it. The allowlist of the `test-console` check (`test-runtime/test-console-output` on Java and Kotlin, see [java-preset.md](java-preset.md)); see [Console output from tests](#console-output-from-tests). `allow` is an array of `{ "contains", "paths"?, "reason" }`: `contains` is a message fragment that keeps at least three characters once it is normalized (`404` alone, which becomes `<n>`, is refused), `paths` a non-empty list of test file globs that limits the entry (the same globs that can never match are an error as in `layout`), and `reason` is required. Other keys are an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `python`          | object                                                                     | Python preset only: `environment`, `formatter`, `testRunner`, `typeChecker` and `sourceRoots` overrides for what nitpicker detects, and `exceptions` (the Python counterpart of `exceptions`); see [Python preset](#python-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `kotlin`          | object                                                                     | Kotlin preset only. `formatter`: `"ktlint"`, `"ktfmt"` or `"none"`, the format check to run; detected from the build files and `.editorconfig` when absent. `detektConfig`: path of the detekt config inside the project; detected when absent. See [Kotlin preset](#kotlin-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `spring`          | object                                                                     | Java and Kotlin presets, for Spring projects. `roles`: an object whose `controller`, `service` and `repository` keys each list fully qualified annotation or type names (`"com.example.UseCase"`); a class annotated with one, directly or through a composed annotation, or extending or implementing one, counts in that role for the [Spring architecture rules](java-preset.md#spring-architecture-rules), on top of Spring's own stereotypes. A mapping only adds roles; removing a name loosens the policy (see above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `go`              | object                                                                     | Go preset only. `formatters`: a list of `"gofmt"`, `"gofumpt"` and `"goimports"`, the format check to run; detected from `go.mod` tool directives and the golangci-lint config when absent. `buildTags`: build tags passed as `-tags` to `go vet` and `go test`, for example `["integration"]`. See [Go preset](#go-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `analyzers`       | object[]                                                                   | Custom analyzers; see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `legacyInventory` | string                                                                     | Path of the legacy inventory, inside the project. Default `nitpicker.legacy.json`. Every preset; see [Adopting nitpicker on existing code](#adopting-nitpicker-on-existing-code) [Java preset](#java-preset) and [Python preset](#python-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tools`           | object                                                                     | Which config each tool uses: `{ "prettier": { "precedence": [...] } }`. See [Your project's tool configs](#your-projects-tool-configs). `jscpd` with every preset except `go`, which runs no duplicate-code scan yet; `prettier`, `eslint` and `typescript` with the TypeScript and JavaScript presets (`{ "eslint": { "engine": "oxlint", "precedence": ["nitpicker"] } }`; see [Lint engine](#lint-engine) and [ESLint configs](#eslint-configs-typescript-and-javascript-presets); `{ "typescript": { "engine": "native" } }`; see [Type check engine](#type-check-engine)), `tests` with the TypeScript and JavaScript presets (`{ "tests": { "runner": "jest" } }`; see [Test runners](#test-runners)), `pmd` and `checkstyle` with `java` and `kotlin`, `ktlint`, `ktfmt` and `detekt` with `kotlin`, and `ruff`, `black`, `pyright`, `mypy` and `mutmut` with `python`, and `gofumpt` and `goimports` with `go` (their options from the project's golangci-lint config; see [Go preset](#go-preset)); any other name is an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `history`         | object                                                                     | Every preset; opt-in analysis of the commit history, see [Change history](#change-history). `coChange`: `true` turns on the `change-history` analyzer, which reports modules that keep changing together (`false` or absent: off). Optional, with `coChange` set (`true`, or `false` to keep them while it is off; without `coChange` they are an error): `commits`, how many recent commits to read (whole number from 20 to 2000, default 300); `minSupport`, the commits two modules must share (whole number, at least 2, default 5); `minConfidence`, the share of the less-changed module's commits that must include the other (above 0, at most 1, default 0.6); `maxCommitFiles`, the most files a commit may touch and still count (whole number from 2 to 100, default 30).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `conventions`     | object                                                                     | Pins a style nitpicker otherwise takes from the project. When two conventions are equally valid, nitpicker counts which one most files use and checks with that: a comparison measures the merge base (so a branch cannot flip it), or the branch when the base has no files of that kind yet; `--all` measures the checkout. A tie, or nothing to measure, keeps the preset default, and the run prints what it followed. Java and Kotlin presets (Java sources): `"java.formatter"`, `"google"` (google-java-format, the default), `"palantir"` (palantir-java-format) or `"none"` (no Java format check); `"java.indentation"`, `"2"` (google-java-format), `"4"` (google-java-format `--aosp`; palantir-java-format is always 4) or `"tab"`; `"java.lineLength"`, a whole number of columns from 10 to 999 (`"100"`, `"120"` and `"140"` are the measured ones; it drives `line-length-limit` for Java files; google-java-format wraps at 100 and palantir-java-format at 120, so a pin that disagrees with a pinned or build-declared formatter is a config error, and with a default or measured one it turns the formatter into `"none"`); `"java.wildcardImports"` `"explicit"`/`"wildcard"` (wildcard turns off Checkstyle `AvoidStarImport` and Error Prone `WildcardImport`); `"java.testStaticImports"` `"explicit"`/`"wildcard"` (the same for `import static ...*` in test sources only); `"java.assertionHelpers"` and `"kotlin.assertionHelpers"`, a list of method names (a helper is followed when it ends tests that have no other assertion in at least three test files and is defined as a method or function in a test or test-support source whose body calls an assertion or throws; PMD's `UnitTestShouldIncludeAssert` and the Kotlin `test-without-assertion` rule then accept it as an assertion; `[]` pins none). Kotlin and Python presets: the `kotlin.*` and `python.*` ids and values are under [Formatter and detekt configs](#formatter-and-detekt-configs-python-and-kotlin-presets); a project's own tool config sets them only when `tools.<tool>.precedence` lists `"project"`. TypeScript and JavaScript presets (Prettier options): `"prettier.quotes"` `"single"`/`"double"`, `"prettier.semicolons"` `"always"`/`"never"`, `"prettier.indentation"` `"2"`/`"4"`/`"tab"`, `"prettier.printWidth"` `"80"`/`"100"`/`"120"` or any number of columns, `"prettier.trailingCommas"` `"all"`/`"es5"`/`"none"`, `"prettier.arrowParens"` `"always"`/`"avoid"`, `"prettier.bracketSpacing"` `"spaced"`/`"tight"`, `"prettier.endOfLine"` `"lf"`/`"crlf"`, `"prettier.jsonIndentation"` `"2"`/`"4"`/`"tab"` and `"prettier.yamlIndentation"` `"2"`/`"4"` (measured from the JSON and YAML files themselves, only the ones the Prettier check covers: JSON at the project root and under the source and test roots, YAML under the source roots; fixtures and generated files do not count). TypeScript preset only (React): `"prettier.jsxQuotes"` `"double"`/`"single"` (Prettier `jsxSingleQuote`, measured from string attribute values in `.tsx`/`.jsx` files) and `"prettier.bracketSameLine"` `"newLine"`/`"sameLine"` (where the `>` of a multi-line opening tag is, compared with its last attribute); and, beyond Prettier, `"typescript.typeImports"` (TypeScript preset only) `"separate"` (`import type { A }`)/`"inline"` (`import { type A }`), which sets the `consistent-type-imports` fix style, and `"typescript.assertionHelpers"` a list of function names (for example `["assertOk", "verifyCalled"]`): a function the project defines in a test file or a `test-support`, `test-utils`, `testing` or `testkit` folder whose body calls `expect` or `assert` (or throws), and that is the last call of a test (`it`, `test` and their `.only`, `.skip`, `.each`, `.for` and similar forms, not hooks or `describe`) containing no `expect` in at least three test files, counts as an assertion for `vitest/expect-expect`, next to `expect`, `assert`, `expectTypeOf` and `assertType`. A pin is a list of plain identifiers (letters, digits, `_`) and replaces the measured list. `"typescript.fileNames"` `"kebab-case"`/`"camelCase"`/`"snake_case"`, the casing `nitpicker/file-name-casing` expects of source and test file names (the part before the first dot, so `foo.min.js` is judged as `foo`). Only files under the source and test roots count; fixtures and generated files neither count nor fail. PascalCase names always pass (components, classes) and cast no vote, as do names that fit every casing (`index`, `utils`, `404`, `fr-CA`), React hook files (a file named `useX` that exports a function or constant named exactly `useX`; `useCase.ts` exporting something else is judged like any other name), Next.js and Remix names (`not-found`, `[id]`, `posts_.$id`, `_app`, `+page`), `*.config.*` files and names with a hash segment (`chunk-3f9a1c2b`). When a folder has at least three other files that vote, their plurality decides for that folder (a tie keeps the project casing); a pin in `conventions` overrides this, so every file follows the pin. |

Size thresholds beyond the file limits, all whole numbers that fail only when a change makes the
code worse than the base: `folderDepth` is the folders below `features/<feature>/<layer>/` in
TypeScript and JavaScript (default 1) and the packages below the root package in Java and Kotlin
(default 4); for Java and Kotlin (their `.java` files), `classMethods` (methods per class, default 20), `classFields` (instance
fields per class, default 10) and `inheritanceDepth` (superclasses, default 3). Their rules
(`folder-depth-limit`, `class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`) take
`exceptions` like the file limits, and a threshold a preset does not enforce is a config error. Details:
[Java preset](java-preset.md#class-and-package-size-limits).

These are the analyzer names you can pass to `disable` and `--analyzer`.
The built-in set: `eslint-lint`, `eslint-errors`, `eslint-logging`, `eslint-module-effects`,
`entry-points`, `prettier-format`, `typescript-typecheck`, `dependency-architecture`,
`coding-standards`, `coupling`, `test-runtime`, `structure`, `duplicates`, `dead-code`, `coverage`,
`test-console`, `crap` and `mutation`. The Java and Kotlin presets have one analyzer each, and the Python preset has
two, `python` and `mutation`. Every preset also runs `repository-hygiene`, and `change-history` once `history.coChange` is on.

### React

A TypeScript project with `react` in `dependencies` or `devDependencies` gets a React rule scope on
top of the strict preset: function components only, the rules of hooks and exhaustive dependencies,
no state derived from props or state in an effect, no data fetching or async work in an effect, no
array index (or random value) as a `key`, no mutated state, impure render or nested component, labelled
form fields, no `dangerouslySetInnerHTML`, cleanup for listeners and timers, one styling approach, the
`jsx-a11y` accessibility rules and Testing Library rules for
component tests (query by role, `userEvent` over `fireEvent`, no implementation details). Detection
reads the package.json of the head checkout once and uses the result for both sides, so a pull
request that adds React does not turn the whole project into new findings.
Set `"react": { "enabled": true }` to force the scope on (a monorepo whose manifest is elsewhere) or
`false` to turn it off. `react.styling` picks the approach: `class-names` flags inline `style`
objects of fixed values and CSS-in-JS imports, `css-in-js` flags stylesheet imports and inline
`style` objects of fixed values, `inline-style` flags stylesheet imports and CSS-in-JS imports,
`style-sheet` (React Native) flags everything but `StyleSheet.create` styles and `style` values
computed at runtime. Unset, it is the approach most source files of the head checkout already use
(stylesheet imports and `className`, CSS-in-JS imports, `StyleSheet.create`, inline `style`); only a
project with no styling yet falls back to `package.json` (`css-in-js` for styled-components,
Emotion or another CSS-in-JS library, `style-sheet` for `react-native` or `expo`, else
`class-names`). The React major, the styling approach, whether Testing Library cleans up by itself
(Vitest `globals: true`), the framework files that need a default export (Next.js routes and
metadata files, React Router and Remix route modules, Storybook stories, Expo Router screens) and
the Vite entry are detected from the head checkout too, and React files outside React Native get
the browser globals, with the confusing ones (`event`, `name`, `status`, ...) restricted to
`window.<name>`. A
rule that flags legitimate code is lifted for some paths with an entry in `exceptions` (for example
`react-hooks/exhaustive-deps`); an exception that names a React rule is skipped while the scope is
off, so adding or removing React in a PR does not break either side of the comparison. The rules and
their allowed forms, and the Vite entry point, CSS Module typing and framework file conventions,
are in [The strict preset](typescript-strict-preset.md#react).

### Exceptions for rules nitpicker adds

Every finding of a rule nitpicker adds ends with the entry that accepts it, in the top-level
`exceptions` of every preset. That covers the function size limits (`function-lines-limit`,
`function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`), CRAP
(`crap-score-limit`, `crap-coverage-unknown`), changed-branch coverage (`changed-branch-coverage`),
surviving and uncovered mutants (`mutant-survived`, `mutant-nocoverage`) and `stability-direction`;
a `duplicate-clone` message keeps its sentence naming the files to add to `exclude`, and an
`exceptions` entry for `duplicate-clone` lifts it too. The TypeScript and JavaScript presets add the dead-code findings (`files`,
`exports`, `types`), `no-production-runtime`, `type-only-production-dependency`,
`public-alternative-bypass`, the coding-standards findings (`public-contract-production-use`,
`runtime-boundary/*`, `callback-protocol/*`) and the dependency-cruiser rules (for example
`no-production-cycles`, `domain-does-not-import-adapters`); every ESLint message ends with its own
entry too, whose `rule` is the ESLint rule id. A TypeScript compiler error (`TS2322`) has no
exception: fix the type error, and a config entry for one is rejected. The entry is the usual
`{ "rule", "paths", "reason" }` with the path of the finding filled in, plus `function` (the
structure, CRAP, coverage and mutation rules) or `name` (unused `exports` and `types`):

```json
{
  "exceptions": [
    {
      "rule": "changed-branch-coverage",
      "paths": ["src/main/payments/retry.ts"],
      "function": "backoff",
      "reason": "The overflow guard cannot be reached from a test."
    }
  ]
}
```

A message prints `"reason":"..."`. That placeholder is for a reviewer to replace,
and a config that keeps it (or `...`) is rejected, so an agent stops and asks a human before it adds
an exception.

- `rule` may also be the finding as it is printed, `<tool>/<rule>`. The tool must be the rule's own:
  `structure/function-lines-limit`, `crap/crap-score-limit`, `coverage/changed-branch-coverage`
  (TypeScript and JavaScript), `jacoco/changed-branch-coverage` (Java and Kotlin),
  `coverage-py/changed-branch-coverage` (Python), `mutation/`, `pit/` or `mutmut/mutant-survived`,
  `duplicates/duplicate-clone`, `coupling/stability-direction`, `dead-code/exports`. Any other prefix
  is a config error (`unknown tool prefix`).
- `paths` are globs relative to the project root: no absolute path and no `..`. A path a message
  prints has its glob characters (`{ } , [ ] * ?`) escaped, so a pasted entry matches exactly its
  own file. An entry whose paths match no file of the project is listed as a note in the console
  summary (not failing), so a stale or mistyped entry shows up.
- `function` is matched exactly against the name the finding prints, and no part of it counts on
  its own: `save` does not accept `Store.save`. The parameter list is ignored, a Java or Kotlin
  `Class::method` reads as `Class.method`, and overloads of one name are accepted together.
  - TypeScript and JavaScript: `Store.save`, `outer.inner`, a binding name for an arrow function or
    function expression (`const arrow = () => {}` is `arrow`), `obj.prop` for an object property,
    `default` for `export default function`, `Store.field` for a class field initializer and
    `Store.<static>` for a static block. A callback with no name is qualified by the function
    around it (`run.<anonymous>`), and the second and later ones of the same function are
    numbered (`run.<anonymous#2>`, `run.<anonymous#3>`, in source order), so an entry never accepts
    a different anonymous function of the file.
  - Java: `Calc.classify`, `Calc.<clinit>` for a `static { }` block, `Calc.<init>` for an
    instance initializer block and `Calc.field` for a field initializer (lambdas included).
  - Kotlin: `Boot.<init>` for an `init` block, `Boot.table` for a property initializer that holds a
    block, and a backtick name as the finding prints it, without the backticks (`Calc.adds up`). A
    test name that contains `(` reads as the start of a parameter list, so the message prints the
    name up to it; use a name without a parenthesis in a test that needs an entry.
  - Python: `Service.wide`.
- For the size, CRAP and mutation rules `function` is optional: without it the entry accepts the
  rule for the whole path, with it only for that function. `name` is optional for the unused
  `exports` and `types` and accepts that declaration only. For `changed-branch-coverage`
  `function` is required, and the entry accepts the uncovered branches inside that function only;
  every other branch of the file, and every other tool's finding, is still checked. Branch coverage
  stays enforced by default.
- A branch that is in no function or initializer cannot be named, and its finding points at
  `exclude`, which drops every finding of the file. That is code at the module level of a
  TypeScript, JavaScript or Python file, and a Kotlin property initializer that holds no block.
  Java has none: every branch is in a method, an initializer block or a field initializer.
- In Java and Kotlin one line can be reported by two tools (PMD and SpotBugs, or Error Prone) and
  the gate shows one of them. Each message names the entry for its own tool; once that entry lifts
  it, the other tool's finding for the line shows up with its own entry.
- `duplicate-clone` and `stability-direction` take no `function` or `name`. Their `paths` are the
  file of the finding in TypeScript, JavaScript and Python, and the package name in Java and
  Kotlin (`"paths": ["stable"]`, not `src/main/java/stable`).
- `function` or `name` on any other rule is a config error, and so is a blank one. Entries are
  listed in the report's config overrides and change the policy hash, so every accepted finding
  shows up in review. Removing or narrowing an exception in a change never turns the findings it
  lifted into new ones, and adding one in the same change accepts the new finding: the base is
  analysed with only the exception paths that the head also lists. Widening an entry, moving it to
  another function or name, or adding a narrow entry for code the base did not except is loosening
  and is reported as such.
- Python uses the top-level `exceptions` list for the function rules above (with `function`), its
  file and size limits and the [repository checks](#dependency-and-repository-checks); its ruff,
  type-checker, import-linter (`contract-broken`), duplicate, coupling and one-way rules, each by
  the id the finding prints, take `python.exceptions`, and their messages name the list that takes
  them. Each list rejects the other's rules.

### Internationalized messages

A TypeScript project with `react-intl` or `@formatjs/intl` in `dependencies` or `devDependencies`
gets an i18n rule scope on top of the strict preset, from `eslint-plugin-formatjs`: every message
has a literal `defaultMessage` and a `description` that tells the translator where it appears, no
untranslated text in JSX, placeholders that match their values, valid ICU syntax, `#` in plurals and
messages that are whole sentences. Detection works like the React scope's: `package.json` of the
head checkout, `dependencies` and `devDependencies` (a peer dependency alone does not count), read
once for both sides. Set `"i18n": { "enabled": true }` to force the scope on (a monorepo whose
manifest is elsewhere) or `false` to turn it off, for instance while a project is not translated
yet. The JavaScript preset has no i18n scope, and `i18n` is a config error with it. A project that wraps `formatMessage` or `FormattedMessage` lists the wrappers in
`i18n.functionNames` and `i18n.componentNames` so their messages are checked too. A rule that flags
legitimate code (a brand name in JSX text) is lifted for some paths with an entry in `exceptions`
(`formatjs/no-literal-string-in-jsx`); an exception that names an i18n rule is skipped while the
scope is off, and one that names an i18n rule nitpicker does not run is an error. Story files
(`*.stories.*`, `*.story.*`) are not checked. The rules, the ones left off and why are in
[The strict preset](typescript-strict-preset.md#internationalized-messages).

### Dependency and repository checks

`repository-hygiene` runs for every preset. It reads the files git tracks and fails only what the
change adds; a file already on the base is left alone. Each message names the exception route: an
`exceptions` entry (`rule`, `paths`, `reason`) in `nitpicker.config.json`, for example
`{ "rule": "committed-env-file", "paths": ["e2e/.env.test"], "reason": "Fake values for the test stack" }`.

| Rule                     | Fails when the change adds                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `committed-env-file`     | a `.env`, `.env.*`, `.env-*`, `*.env`, `env.<environment>` or `.envrc` file; templates (`.env.example`, `.env.sample`, `.env.template`, `.env.dist`) are fine                                                                                                            |
| `committed-private-key`  | any text file with a private-key block, or a key file by name (`id_rsa`, `id_ed25519`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.ppk`) other than a trust store                                                                                                        |
| `committed-binary`       | an archive or compiled file (`.jar`, `.class`, `.exe`, `.dll`, `.so`, `.zip`, `.tar`, `.tgz`, `.gz`, `.whl`, `.node`, ...)                                                                                                                                               |
| `large-file`             | a file whose committed content is over 1 MB                                                                                                                                                                                                                              |
| `committed-build-output` | a file in a build output folder: `dist`, `build`, `out`, `coverage` or `target` next to a `package.json`, `build.gradle(.kts)`, `pom.xml` or `pyproject.toml`, or `.next`, `.nuxt`, `storybook-static`, `.turbo` or `.parcel-cache` at any depth; one finding per folder |

An env file that holds only public build-time values (every key starts with `VITE_`, `NEXT_PUBLIC_`,
`NUXT_PUBLIC_`, `EXPO_PUBLIC_`, `PUBLIC_`, `REACT_APP_`, `VUE_APP_` or `GATSBY_`) is fine. Tooling that
projects commit on purpose is never a binary or large file: the Gradle and Maven wrapper jars,
`.yarn/releases`, `.yarn/plugins`, `.yarn/cache` (zero-install), `.pnp.cjs`, `.pnp.loader.mjs` and a
tarball a `package.json` installs with a `file:` spec. Lock files (`package-lock.json`,
`npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock(b)`, `gradle.lockfile`, `uv.lock`,
`poetry.lock`, `Cargo.lock`, `go.sum` and the like) are never large files, and a file stored with Git
LFS is sized by its pointer.

A build output folder is fine when what runs from the checkout points into it: a GitHub Action's
`action.yml` (`runs.main`, `pre`, `post`), or the `main`, `module`, `types`, `bin`, `exports` or
`browser` of a `package.json` that is not `private` and has no `prepare` script, so a consumer that
installs it from git gets no build step. Such a library's committed `dist` is therefore never flagged.
A `build`, `out`, `target` or `coverage` folder is also fine when it holds only source, script, config,
doc or icon files (no compiled classes, archives, HTML, source maps, `.d.ts`, minified or hashed
bundles), or when its manifest names a file in it (`"build": "node build/build.js"`). The finding is
reported once per folder on the nearest manifest, so moving the folder with its project keeps it
unchanged; an `exceptions` path of `svc/build`, `svc/build/` or `svc/build/**` lifts it. Files in a
flagged folder are not also reported as binaries or large files.

For the TypeScript and JavaScript presets the `dead-code` analyzer also fails a new `unused-dependency`
(listed in `package.json`, imported or run by nothing), `unlisted-dependency` (imported, not listed) and
`unresolved-import`, and `eslint-lint` fails `nitpicker/no-dev-dependency-in-production` (production
code importing a package that is only in `devDependencies`: move it to `dependencies`). That rule
reads the nearest `package.json` that lists dependencies, skips an app a bundler builds (a Vite,
webpack, Next.js, Rsbuild, Rspack, Astro, Nuxt, SvelteKit, Remix, Vue CLI, Parcel or Angular
config, or a `build` script that runs one, and no `main`, `module`, `exports` or `bin`) and test
support next to the code (`setupTests.*`, `test-utils`, `testing/`, `test-support/`, `__mocks__/`, `*.stories.*`,
`.storybook/`), and reports a `package.json` that is not a JSON object. `nitpicker`,
`vitest`, `@vitest/coverage-v8`, `typescript`, `@types/node`, `jsdom` and `happy-dom` are never
reported as unused, because nitpicker or Vitest loads them by name. A tool that loads a package by
name (a plugin in a config file) needs an `unused-dependency` exception for `package.json` that
names the package:
`{ "rule": "unused-dependency", "paths": ["package.json"], "packages": ["prettier-plugin-x"], "reason": "Loaded by .prettierrc" }`.

The Python preset fails a new `unused-dependency`, `unlisted-dependency` and `unresolved-import` the
same way, reading the dependencies from `pyproject.toml`, `Pipfile`, `requirements*.txt` or
`setup.cfg` and the modules from the project and its environment (see
[python-preset.md](python-preset.md)). The Java and Kotlin presets have none of these rules: an import
that does not resolve there fails the compile.

### Change history

`history.coChange` turns on `change-history`, an analyzer that reads the last `commits` commits of the
history (300 by default) and reports modules that keep changing together. It is off until a project
opts in, runs for every preset and never fails: its `co-change` findings are `descriptive`, so they
appear in the reports and never in the failing list. `"coChange": false` switches it off and keeps
any thresholds next to it, so turning it back on is a one-word change.

```json
{ "history": { "coChange": true } }
```

A module is the folder of a production file: the folder that directly holds it or, under a
`layout.featureRoots` folder, the feature folder, whatever the depth below it. `co-change` reads
`featureRoots` in every preset; when it is not set, the default is `**/features` in every preset,
which also matches the TypeScript preset's `<sourceRoot>/main/features`. A module is never paired with
its own parent or child folder (`src/pay` and `src/pay/handlers`).

These files are never modules:

- tests: `test/`, `tests/`, `__tests__/`, `e2e/`, `testdata/`, `__fixtures__/`, `__mocks__/`,
  `androidTest/`, `integrationTest/` and `testFixtures/` at any depth, a test source set such as
  `src/test/`, `src/jvmTest/` or `src/integrationTest/`, a root `fixtures/` or `testing/`,
  `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py`, `tests.py`, `conftest.py`, `*Test.java`,
  `*IT.java`, `*Tests.kt`, `*Spec.kt`, `*_test.go` and the like, plus `layout.testRoots`. Under a Gradle or
  Maven `src/main/`, only the file name marks a test, so a package named `test` stays production
  code, and a `src/testing/` or `src/fixtures/` package is production code too;
- build and tool files: `*.gradle`, `*.gradle.kts` (`build.gradle.kts`, `settings.gradle.kts`),
  `*.config.{js,mjs,cjs,ts,mts,cts}` (`vite.config.ts`, `jest.config.js`), `.*rc.js` and `setup.py`;
- generated code: a generator header or `@Generated` annotation, `build/`, `out/`, `dist/`,
  `target/`, `generated/`, `__generated__/`, `node_modules/` and `vendor/` at any depth,
  `*.generated.*`, `*.pb.*`, `*_pb2.py`, and the files the TypeScript preset marks as generated;
- declaration files (`*.d.ts`, `*.d.mts`, `*.d.cts`), documents, lockfiles, files directly in the
  project root and files under `exclude`.

Only files with a TypeScript, JavaScript, Python, Java or Kotlin extension count, and a file counts
under the path it has at the end of the history read: a renamed or moved file keeps its earlier
history.

Two modules are reported when both thresholds hold over the commits that count:

| Setting          | Default | Meaning                                                                                                    |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `minSupport`     | 5       | Commits that edited code in both modules                                                                   |
| `minConfidence`  | 0.6     | Support divided by the commits that changed the less-changed of the two modules                            |
| `maxCommitFiles` | 30      | A commit touching more files than this (formatting runs, mass renames, code drops) is skipped; at most 100 |

A commit counts for a module when it edits a production file of that module; adding a file, renaming
it unchanged or editing only tests and documents is no evidence, and a pair needs edits in both
modules in the same commit. Merge commits are skipped too. The numbers are plain counts, not a
score: nothing infers how deep a module is from line or export counts.

A finding names both modules, the support, the confidence, how many commits were sampled and up to
three example commits. Its path is the first of the two modules in alphabetical order and its
identity is the pair, so counts and commit ids never make an old finding new. Co-change is
correlation, not proof of a design flaw: feature work, migrations, API evolution and coordinated
releases change modules together on purpose. Read a finding as a question:

- Do they share knowledge such as a format, a constant or a schema? Give it one owner.
- Does one module use the internals of the other? Put what it needs behind one smaller interface
  that the other owns. The finding cannot tell which way the dependency goes (see the limits).
- Do they only ever change as one unit? Merge them into one module.

A pair that is fine as it is takes an `exceptions` entry for `co-change` with a `<module>/**` glob
for either module, for example
`{ "rule": "co-change", "paths": ["src/billing/**"], "reason": "Invoices and billing ship as one release" }`.
Write the glob, not the bare folder: an entry has to match a file of the project, and the stale
exception check reports a bare `src/billing` as matching no file.

#### The same history on both sides

A comparison reads one history for base and head: the last `commits` commits that end at the merge
base. Both runs read that window and resolve modules against the files of the merge base, so
commits the change adds, a dirty working tree and a later commit that pushes an old one out of the
window never move a pair between base and head: a pair that exists is `unchanged`, and only a
change to the policy (`exclude`, `exceptions`, `layout`, `history`) or to a generator header can
create or resolve a finding. A run without a base (`--all`) reads the window that ends at the
checked-out commit. The base result is cached on the merge base and on whether the clone is shallow,
so a shallow run never hands its empty result to a full-history run.

Since a change never shows the pair itself, the summary adds a notice when a change touches a
module and leaves alone a module that changes with it in at least `minConfidence` of the changed
module's commits ("Files you changed in `src/billing` usually change together with `src/invoicing`
(8 of 12 commits, 67%), which this change leaves alone"), with at most three partners for each of
at most three modules. The notice is about the module you changed, so a busy module that only
sometimes changes with a small one is not told about it, and a change that deletes or renames a
partner's files counts as touching it.

Shallow history gives no evidence, which is not a failure. When the repository is a shallow clone, has
fewer than 20 commits (an empty repository has none), is not a git repository, or `git` is not on the
PATH, `change-history` reports nothing and the summary (`--all` runs print it on stderr) carries a
notice with the reason, quoting git's own error when the history cannot be read. In GitHub Actions,
check out with `fetch-depth: 0` to enable it.

Limits: nitpicker does not read imports for this check (they come from per-language tools, and this
analyzer has no import graph), so a finding cannot say whether one module depends on the other. A
module is a folder, so two folders of one component show up as a pair and a flat project has few
modules. The analysis sees only the history it is given, so a squash-merge workflow yields few, large
commits. The head side reads the merge base at the project's head path, so a project whose folder
moved in the change has no head evidence until the move is merged.

### Console output from tests

The `test-console` check fails a change when the project's tests print `console.error` or
`console.warn` output that the base run did not print. The usual cause is work that outlives a test:
a React "state update on an unmounted component" warning from a timer that survives unmount, a
"unique key" warning from a list that changed, an error logged by a handler that now fails. The
check reads the `coverage` run, so it starts no tests of its own; it costs a reporter or a console
wrapper in that run (one file append per `console.error` or `console.warn` call) and a file read per
side.

The check runs on every test runner nitpicker supports (Vitest, Jest, `node:test` and Mocha, both
presets), with the same rules for each. What it sees is what the test prints through `console.error`,
`console.warn`, `console.trace` and a failed `console.assert`; `silent: true` (Vitest and Jest) does
not hide anything from the check, because it silences the terminal, not the output. A call that the
project itself silences is not seen, because it never prints: Vitest's `onConsoleLog` returning
`false`, a `console.error` replaced by a stub or a Jest spy that does not call through. The check
never changes what a test sees: a test that spawns a process gets that process's own output, and a
test that mocks `fs` does not see the check's writes. How the output is attributed depends on the
runner:

| Runner      | Attributed to      | How it is read                                                          |
| ----------- | ------------------ | ----------------------------------------------------------------------- |
| Vitest      | test file and test | A reporter added to the coverage run.                                   |
| `node:test` | test file and test | The coverage preload wraps the console in each test file process.       |
| Mocha       | test file and test | A `--require` module follows the runner's events, `--parallel` too.     |
| Jest        | test file only     | A reporter reading each file's console buffer (Jest has none per test). |

Output printed while a test file loads, or in a `before`/`after` hook (`beforeAll`/`afterAll`),
belongs to that file, with no test name or with the name of the hook's suite. Output from a hook that
runs around each test (`beforeEach`/`afterEach`) belongs to that test. A message is the same whichever
way it is attributed, because findings are keyed by test file and message, so a Jest finding just does
not name a test.

For Jest the run uses Jest's `default` reporter and nitpicker's console reporter in place of the
`reporters` of the project config (as the Vitest and Mocha runs replace theirs), and runs with
`silent` and `verbose` off, because Jest buffers console calls only then; a `silent` project then
shows its console output in the run's log. Jest keeps only the first argument of a failed
`console.assert` (`console.assert(false, 'bad %s', 'input')` gives `Assertion failed: bad %s`). With
`node:test`, tests of one file that run concurrently can swap the test name, and
`--experimental-test-isolation=none` (every file in the runner's own process) is not read at all,
because the file of a call is not known there: the check passes with no findings. Mocha runs every
spec file in one process (one per worker with `--parallel`); a root hook from a `--require` file
belongs to no test file and is not seen, but what the work it started prints while a test runs (a
server it started handling the test's request) belongs to that test, as with Vitest. Work another spec
file started, such as its timer, is not seen while a later file runs.

It does not see:

- `console.log`, `console.info` and `console.debug`, which go to standard output;
- `process.stderr.write`, `process.emitWarning`, and the output of child processes and worker threads
  a test starts;
- output printed after a test file has finished (after its last `after`/`afterAll` hook), such as a
  dangling timer that fires later, or with Mocha a timer that fires while another file's tests run;
  with Jest such a call prints "Cannot log after tests are done", which fails a run in band only when
  it would fail without nitpicker too, and only when Jest's report shows no other failure (a failed
  test or suite, or an obsolete or unwritten snapshot);
- the output of a failing run: `coverage` fails first and `test-console` is skipped, as `crap` is.

Each console call becomes one message. A call is a block that starts at an unindented line, so a
call gives the same message alone or batched with others in one flush. The message is every line of
the block joined by single spaces, except lines with no letter or digit (blank lines, lines that are
only brackets), stack frames and React component stacks (indented lines that start with `at` or
`in`). An object dump or an error with a `[cause]` is compared whole. The text is normalized before
it is compared: a path is replaced by its last segment, the project, temporary and home directories
by `<root>`, `<tmp>` and `<home>`, every number with its unit (`0.766s`, `12 ms`, `3 MB`, `45%`) by
`<n>`, ISO timestamps by `<time>`, `0x` addresses by `<hex>`, UUIDs by `<uuid>`, mixed
letter-and-digit tokens of six or more characters (a random id) by `<id>`, random temporary names (`tmp` and
six or more letters, digits or underscores, as Python makes them, or the six random characters after the last
`-`, `_` or `.` of a name under the temporary directory, as `mkdtemp` makes them) by `<id>`, and runs of spaces by one
space. It is cut at 300 characters.

Three limits follow, and the check accepts them on purpose:

- Numbers become `<n>`, so a status code that changes from 404 to 500 is the same message.
- Paths collapse to their last segment, so the same file name in another directory is the same
  message.
- A random value is tolerated: a message of three or more words matches a message of the base for
  the same test file when exactly one word differs and both versions of that word look like an
  opaque random value. Both must be lowercase letters and digits of five or more characters, and at
  least one must have a run of four consonants, almost no vowels, or letters mixed with digits. A
  capitalized, camelCase or UPPERCASE word, a name in backticks and a word of ordinary text such as
  `key` and `ref` or `List` and `Table` make a new message. Each base message matches at most one
  head message. A random word that looks like ordinary text, such as an id made of letters that
  happen to read as a word, still makes a new message.

The finding is keyed by the test file and the normalized message (with the tolerance above), so
moving a warning to another line, renaming the test or printing it twice does not make it new, and a
message that moves to another test file is new there. The message names the test that printed it.
Three routes: fix the cause, allow a known third-party message in `testConsole.allow`, or lift the
rule for a test file with `exceptions`. `exceptions` lifts files; `allow` lifts one known message
wherever it appears:

```json
{
  "testConsole": {
    "allow": [
      { "contains": "ReactDOM.render is no longer supported", "reason": "React 17 shim" },
      { "contains": "waited 250 ms", "paths": ["test/legacy/**"], "reason": "old suite" }
    ]
  },
  "exceptions": [
    { "rule": "test-console-output", "paths": ["test/flaky.test.ts"], "reason": "..." }
  ]
}
```

An `allow` entry has `contains`, a fragment that is normalized like a message (so `waited 250 ms`
matches every `waited <n>`) and must keep at least three characters besides spaces and placeholders
(`404` alone, or text that is only colors, is refused), an optional non-empty
`paths` list of test file globs, and a required `reason`. The fragment is matched against the
whole message of a call, so it can match any line of the call. There are no regular expressions.
Both routes apply to the base and the head run. The base run does not need to be clean: only messages
the base did not print can fail.

`"disable": ["test-console"]` turns the check off alone. Disabling `coverage` turns it off too, like `crap`,
so a `disable` list written before the check existed keeps working.

### Custom analyzers

Each `analyzers` entry is `{ "name", "command", "args"? }`. The command runs on the base and the
head checkout, with that checkout as its working directory (so `"command": "./scripts/house-rules"`
resolves inside each side). The environment carries `NITPICKER_ANALYZER`, `NITPICKER_PROJECT_ROOT`
and `NITPICKER_SNAPSHOT`. It prints `{"findings": [...]}` on stdout and exits 0. Each finding uses
the built-in finding schema and carries `tool` equal to the entry's `name`. Findings are
fingerprinted and classified exactly like built-in ones. A non-zero exit, invalid JSON or a schema
violation is a tool error. A name must not clash with a built-in analyzer. The command and its
arguments are part of the policy hash.

## Java preset

Set `"preset": "java"` in `nitpicker.config.json` to gate a Gradle or Maven project the same way: PMD,
SpotBugs, Error Prone (with NullAway), google-java-format and JaCoCo run on the merge base and on head (through
`languages/java/gradle/nitpicker.init.gradle`, shipped in this package; the consumer build is not edited), and only
new enforceable findings fail. Exit codes, console summary, `new-findings.json`, `report.sarif`
and `report.junit.xml` are the same as for TypeScript. If Gradle fails on either snapshot, the
failure is reported as a `java/gradle-failure` tool error (exit 2 when there are no new findings), never thrown.
A project whose root has a `pom.xml` and no Gradle build file (or both, with `mvnw` and no `gradlew`)
is built with Maven 3.6.3 or newer instead, with the same tools, versions and findings, one module
at a time (findings carry the module path); a Maven failure or a failing test on the head is a
`java/maven-failure` tool error naming the cause (a base whose tests fail is a note, see "A base
whose tests fail"). Maven runs through `mvnw` when the project has
one, else `mvn` from the PATH; `NITPICKER_MAVEN=<command>` overrides both. See
[Maven builds](java-preset.md#maven-builds).

Needs Java 21. Gradle is run through the project's own wrapper (`gradlew`, `gradlew.bat` on Windows) when the
project root has one (run with `sh` when it is not executable), else `gradle` from the PATH; `NITPICKER_GRADLE=<command>` overrides both.
Config keys with this preset: `base`, `disable`, `analyzers`, and the keys shared with the other
presets, `thresholds` (`crapLimit`, `fileLines`, `testFileLines`, `folderFiles`, `folderDepth`,
`classMethods`, `classFields`, `inheritanceDepth`, `unitTestSeconds` and `integrationTestSeconds`),
`exclude` (findings under the globs are dropped; a duplicate is dropped when a glob matches either file of the pair), `duplicates` (the folders the duplicate scan skips), `exceptions`, `legacyInventory`, `conventions`, `spring` (role mappings for the Spring architecture rules) and `history` (see [Change history](#change-history)).
A Java exception names the finding as printed, `<tool>/<rule>` (for example
`pmd/UnusedPrivateField`), or a size rule (`file-lines-limit`,
`line-length-limit`, `folder-files-limit`, `folder-depth-limit`, `class-methods-limit`,
`class-fields-limit`, `inheritance-depth-limit`) or `slow-test` (`test-runtime/slow-test` is read as the same rule), and drops it under its `paths` on both snapshots. The
inventory has the same format as
the TypeScript one, `{ "sites": [{ "file", "rule", "source", "count" }] }`, where `source` is the
finding's `identity` as printed in `new-findings.json`: up to `count` occurrences of that site are
baselined, and raising a `count` (or adding a site) on head over the base fails as
`baseline-expansion`. `react` and `i18n` describe React and message libraries, have no Java meaning, and stay a config
error with this preset; `layout` is an error too until the Java preset runs the rule that reads it (`shared-used-by-one-feature`).
`testConsole.allow` applies to the console output of the JUnit tests. `tools` takes `pmd` and `checkstyle`; see
[Your project's tool configs](#your-projects-tool-configs). `exceptions` takes a finding as printed
(`pmd/UnusedPrivateField`) or a rule nitpicker adds; see
[Exceptions for rules nitpicker adds](#exceptions-for-rules-nitpicker-adds). Details:
[java-preset.md](java-preset.md).

## Kotlin preset

Set `"preset": "kotlin"` for a Gradle project with Kotlin JVM modules, including modules that mix
Java and Kotlin. It runs everything the Java preset runs on the Java sources, plus detekt and a
format check (ktlint or ktfmt, whichever the project uses, and none for a project that uses
neither; `"kotlin": { "formatter": "ktfmt" }` overrides the detection) on the Kotlin sources,
JaCoCo coverage and changed-branch coverage for both (a changed Kotlin branch that no test takes
fails; a line the compiler generated branches for is ignored), and the structure limits, CRAP,
duplicates and package stability checks on Kotlin code. PIT also mutates the Kotlin classes, but
their mutants are only reported, because plain PIT on Kotlin bytecode reports mostly
compiler-generated mutants (and a Kotlin module pays for PIT's run all the same). The project's
detekt config is found in the usual places or set with `"kotlin": { "detektConfig": "path" }`. Config keys, Gradle
requirements, exit codes and the Gradle-failure tool error are those of the Java preset, with the
analyzer named `kotlin`. Details and the remaining slices: [kotlin-preset.md](kotlin-preset.md).

The preset also narrows Kotlin to one way of writing the common many-ways spots, with detekt rules
of its own that the project's detekt config cannot switch off: `!!` and unsafe casts of nullable
values, the scope functions `run`, `with` and `also` (`let` and `apply` stay), `GlobalScope` and
`runBlocking`, a broad `catch` of `Exception` or `Throwable` (`TooGenericExceptionCaught`), and plain
classes that only hold data. Every message names the allowed form. Test sources are linted by detekt,
ktlint and ktfmt like the main sources, and these rules apply in them too.
A project's own `ForbiddenMethodCall.methods` entries in its `detekt.yml` (for example
`java.lang.Thread.sleep`) are added to the preset's four calls and never replace them; an entry that is not a
method name with an optional parameter list is ignored. `init` blocks, lambdas and property initializers that
branch are measured like functions, under the names `Class.<init>`, `Class.function.<lambda>` and `Class.property`;
a legacy one that is over a limit is held like any function, and a project that must keep one drops its
file with `exclude`.
Inline `@Suppress` of any detekt or ktlint rule fails (Kotlin compiler warnings may be suppressed). Where a rule flags legitimate code, add an `exceptions`
entry with the same shape as TypeScript's, for example
`{ "rule": "detekt.style.ForbiddenMethodCall", "paths": ["src/main/kotlin/app/Main.kt"], "reason": "The entry point blocks on its coroutine." }`.

## Go preset

Set `"preset": "go"` for a Go module (`go.mod` at the project root). It needs Go on the `PATH` and
runs the project's own toolchain: a format check with the formatter the project uses (gofmt,
gofumpt or goimports, detected from `go.mod` tool directives and the golangci-lint config, or set
with `"go": { "formatters": ["gofumpt"] }`; gofmt when there is no signal), `go vet` (compile
errors are `build/compile-error` findings, vet diagnostics `vet/<analyzer>`), `go test -json` over
every package (failing tests are a tool error, plus `no-tests-ran` and the shared slow-test
limits), and the structure, type, file and folder limits from a small `go/ast` program that ships
with nitpicker. Tools nitpicker pins (gofumpt, goimports) are built once into
`~/.cache/nitpicker`; a `tool` directive in the project's `go.mod` for the same tool wins.
Build tags for the tests go in `"go": { "buildTags": ["integration"] }`. Exceptions name a finding
as printed, `{ "rule": "vet/printf", "paths": ["shop/label.go"], "reason": "..." }`, or a shared
rule. Details and the remaining slices: [go-preset.md](go-preset.md).

## JavaScript preset

Set `"preset": "javascript"` to gate a project of plain `.js`, `.mjs` and `.cjs` files with the same
checks, rules and exit codes as the TypeScript preset; the keys `layout`, `exceptions` and `tools` work the same.
It is never auto-detected. CI needs what the TypeScript preset needs
([nitpicker in CI](ci.md#toolchains-by-preset)). Types are written as JSDoc and checked by TypeScript with `allowJs` and
`checkJs`: nitpicker generates the tsconfig, layered over your `tsconfig.json` or `jsconfig.json` when you
have one. `typescript` and `vitest` are peers as for TypeScript.

What the preset does not support:

- **Test runner.** Both presets run the tests with the project's runner: Vitest, Jest, `node:test` or
  Mocha (coverage, CRAP, mutation and console output). Test files are linted with the Vitest rules
  whatever the runner, so `vitest/no-import-node-test` reports a `node:test` import; its message
  points to an exception for that rule.
- **CommonJS tests.** Production code may be CommonJS. A Vitest test file must `import` Vitest,
  because `require('vitest')` fails at run time, so import `.cjs` production code from an ESM test, as
  the fixture does; Jest, `node:test` and Mocha tests may be CommonJS.
- **`.jsx` and `.tsx`.** React and JSX belong to the TypeScript preset. No analyzer reads a `.jsx` or
  `.tsx` file, so a project with one under its source or test roots is a config error (exit 2) rather
  than a green gate that checks nothing. Use the TypeScript preset, or list those files in `exclude`.
  The `react` key is a config error with this preset, and the React rule scope stays off even when
  `react` is in `package.json`.

TypeScript files are part of a JavaScript project, so a project can migrate one file at a time:
`.ts`, `.mts` and `.cts` files get the full TypeScript rules of the strict preset (`as`, `enum` and
`interface` stay banned there) and are checked by Prettier, jscpd and the other analyzers like `.js`
files. A directory must not hold `x.js` and `x.ts` side by side: TypeScript drops the `.js` from the project.

Rules that police TypeScript syntax become their JSDoc form in `.js`, `.mjs` and `.cjs` files; every other
rule is identical:

| TypeScript rule                             | JavaScript preset                                                                                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no `as`, `<T>value`, `!`                    | no JSDoc cast `/** @type {T} */ (value)` (`@type {const}` is allowed); there is no `!`                                                                                                                                 |
| no `any`                                    | no `any`, `*` or a bare `?` in a JSDoc type                                                                                                                                                                            |
| no `null`                                   | no `null` literal, and no `null`, `?T` or `T?` in a JSDoc type                                                                                                                                                         |
| no `enum`, `namespace`, `interface`         | not expressible; a JSDoc tag outside the list below is an error                                                                                                                                                        |
| no `unknown` in parameter or property types | no `unknown` in `@param`, `@property` or `@prop`, and none inside an object type or function parameter of `@returns`, `@return`, `@type`, `@typedef`, `@satisfies` or `@this`                                          |
| no handwritten type guard                   | no `@returns {x is T}` or `asserts`                                                                                                                                                                                    |
| no comments                                 | JSDoc holds types only, with no prose: `@param`, `@property` (`@prop`), `@typedef`, `@returns` (`@return`), `@type`, `@satisfies`, `@extends` (`@augments`), `@this`, `@callback`, `@template`, `@import`, `@overload` |
| `import type`, `type` over `interface`      | dropped (no such syntax)                                                                                                                                                                                               |
| no `require()`                              | allowed: `@typescript-eslint/no-require-imports` is dropped, and `test-must-use-production-runtime` counts a `require()` of production code                                                                            |
| no property assignment in `domain/`         | `module.exports = ...`, `module.exports.x = ...` and `exports.x = ...` are allowed                                                                                                                                     |
| module load effects                         | `module.exports = ...` and `exports.x = ...` are not effects                                                                                                                                                           |

A JSDoc tag or form the rules reject (`@throws`, `@private`, a `?T` from a legacy API) is reported with the
exception route: an entry for `nitpicker/no-comments` in `exceptions` lifts the JSDoc checks for the
paths it names, together with everything else that rule reports there (prose comments and coverage or
mutation ignore comments), so keep its `paths` narrow. In `domain/`, destructure a `require()` (`const { basename } = require('node:path')`):
the module object itself is a mutable value.

The code rules (`const`, `for...of`, named exports, no recursion, the layout and the `domain/` and
`adapters/` rules) apply as written in [The strict preset](#the-strict-preset), with `.js`, `.mjs` and `.cjs`
in place of `.ts`: a component's public file is `index.js`, `index.mjs` or `index.cjs` (or `index.ts` while
migrating), the composition root is `composition-root.mjs` (or `main`/`server`), and Prettier, duplicates,
dead-code and `--fix` cover all of them. `no-var`, `prefer-const`, `prefer-rest-params` and `prefer-spread`
are enforced, which typescript-eslint turns on only for TypeScript files. A small project that follows all of
this is kept in `languages/javascript/preset/fixtures/js-clean`, and its tests assert that `nitpicker --all`
reports no enforceable findings for it.

CRAP is measured on `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` and `.cts` files, the same way as on TypeScript ones.

## Python preset

Set `"preset": "python"` in `nitpicker.config.json` to gate a Python project the same way: ruff, a
format check (ruff format or black, whichever the project uses), a strict type check (mypy or
pyright or basedpyright, whichever the project uses), a few small checks of nitpicker's own, the test suite under
coverage.py, function size limits (lines, statements, control nesting, parameters) and the CRAP
score (cyclomatic complexity computed from Python's own syntax tree, plus per-function coverage; nothing extra to install) run on the merge base and on head, inside the project's own environment, and only new
enforceable findings fail. Exit codes, console summary, `new-findings.json`, `report.sarif` and
`report.junit.xml` are the same as for TypeScript. If a tool fails on either snapshot (no
environment, failing tests, a crashing tool; failing tests on the base alone are only a note, see
[A base whose tests fail](#a-base-whose-tests-fail)), the failure is reported as a tool error of the
analyzer that ran it, never thrown: `python` for `ruff-failed`, `format-failed`, `tests-failed`,
`coverage-failed`, `types-failed`, `rules-failed`, `structure-failed` or a plain one when the environment is missing, and `mutation` for
`mutation-failed` (exit 2 when there are no new findings). A mutation failure keeps the lint,
format and coverage findings, and mutation testing is skipped when the `python` analyzer had a tool
error.

The environment is detected: `uv.lock` (also the one of a uv workspace above a member) runs the
tools with `uv run --no-sync`, `poetry.lock` uses the environment poetry reports, a `Pipfile` the one `pipenv --venv` reports,
`[tool.hatch.envs]` in `pyproject.toml` (or a `hatch.toml`) the one `hatch env find` reports,
an `environment.yml` its `prefix` or the conda environment `conda env list` finds under its
`name`, a `.venv/` directory is used as is, otherwise (an activated conda environment included) the tools come from the `PATH`; `python.environment` can also be
an absolute virtualenv directory. The environment has to exist already (`uv sync`, `poetry install`, or your CI's
install step) and needs `coverage`, a type checker (`mypy`, `pyright` or `basedpyright`) and the project's test runner (pytest, Django or nose2), and `mutmut` and `pytest` unless mutation is disabled (mutmut runs every suite with pytest, which also runs `unittest` and nose2 tests; a Django project also needs `pytest-django`); `ruff` (or `black`) may come
from the `PATH`. The base snapshot runs against the same environment with its own sources first on
`PYTHONPATH`, so an editable install does not make base tests exercise head code.

Mutation testing is the `mutation` analyzer and runs mutmut 3.x after the `python` analyzer: a new
surviving or uncovered mutant fails (`mutant-survived`, `mutant-nocoverage`), there is no score
gate, and mutants that survived on the base stay baselined. `"disable": ["mutation"]` turns it off
(disabling `python` turns `mutation` off too, because `mutation` depends on it), and it is also what to do
when mutmut cannot be installed. A project's own `[tool.mutmut]` is used as it is; without one
nitpicker mutates the source roots, skipping test files and the `exclude` globs. A mutant that no
test can tell from the original (an equivalent mutant) is lifted with an `exceptions` entry
for `mutant-survived` and the `function` (the message prints it), or by listing the path in `exclude`, which drops its findings; code hidden
with `# pragma: no mutate` or a `do_not_mutate` in your `[tool.mutmut]` is reported as
`mutant-ignored`, whatever `tools.mutmut` says. mutmut needs
`fork`, so on native Windows the analyzer is skipped with a note: run nitpicker in WSL. Add
`mutants/` to your ignore file. See [python-preset.md](python-preset.md).

Config keys with this preset: `base`, `disable` (`python` and `mutation` are the analyzer names), `analyzers`, `thresholds` (`crapLimit`), `exclude` (findings
under the globs are dropped), `legacyInventory` (same format as the Java one; `source` is the
finding's `identity`), `history` (see [Change history](#change-history)) and `python`, whose keys all override a detection: `environment` (`"uv"`,
`"poetry"`, `"path"` or a virtualenv directory in the project), `formatter` (`"ruff"` or
`"black"`), `testRunner` (`"pytest"`, `"unittest"`, `"django"` for `manage.py test` or `"nose2"`; detected from the project),
`typeChecker` (`"mypy"`, `"pyright"` or `"basedpyright"`), `importLinter` (`true` or `false`; by default the import-linter
contracts run when the project configures them) and `sourceRoots` (default `src`, else the top-level
packages). The gate also reports new duplicates (`duplicates/duplicate-clone`), package coupling
(`coupling/stability-direction`; an import under `if TYPE_CHECKING:` is never the reported dependency, though it still counts toward instability) and broken import-linter contracts (`import-linter/contract-broken`);
their messages name the file to add to `exclude` when the repetition or dependency is intended (a duplicate names both files of the pair, and an `exclude` or exception that matches either one lifts it, so excluding an old or generated file also hides a clone between it and a new file).
`layout` and `testConsole` are an error until the Python preset runs the rules that read them; the top-level `exceptions` is accepted only
for the file limits (`file-lines-limit`, `line-length-limit`, `folder-files-limit`), the
[dependency and repository checks](#dependency-and-repository-checks) and the shared rules the preset reports.

The one-way rules (pathlib, f-strings, no mutable defaults, no bare `except`, no `except` that only passes, continues, returns or assigns a constant, no `contextlib.suppress(Exception)`, no
`import *`, logging instead of `print` with the logger the project declares, frozen dataclasses,
the project's validation library (pydantic by default) only in `adapters/`, enums
instead of string constants, a caught exception passed to the logger, and an assertion in every test) and the strict type check name the allowed form in every failure
message. Inline `# type: ignore`, `# noqa`, `# pyright: ignore` and `# fmt: off` are findings themselves, and so are `@no_type_check`, `if not TYPE_CHECKING:` and a `.pyi` beside its `.py`. A project's own mypy, pyright or basedpyright config cannot weaken the check unless `tools.mypy` or `tools.pyright` lists `"project"`. The way out of a finding that flags legitimate code (including a comment, with the rule `no-inline-suppression`) is `python.exceptions`; a rule id that nitpicker does not report is a config error. Code
that is legitimately outside a rule is lifted with `python.exceptions`, the Python counterpart of
`exceptions` and of the same shape (`rule`, `paths`, `reason`, all required):

```json
{
  "preset": "python",
  "exceptions": [
    {
      "rule": "T201",
      "paths": ["src/cli/**"],
      "reason": "Command line entry points print their result."
    }
  ]
}
```

`rule` is the id printed in the finding; `exclude` drops every finding under a path instead. The rules most likely to flag code that is right for its place are `T201` (`print` in a command-line tool), `PERF203` (`try` in a loop) and `F401` (an `__init__.py` that re-exports). Inline `# pragma: no cover` and `# pragma: no branch` are not honored either. Changed-branch coverage (`coverage-py`, from the branch data of the same coverage.py
run) fails an untested branch on a changed line, as for Java: `if`, `while`, `for` and `match`
arms are judged, an untested `except` handler is not. The project's own coverage configuration is
ignored (`exclude_lines`, `exclude_also`, `partial_branches`, `omit`, plugins, subprocess
measurement): nitpicker's rcfile measures branches, skips test files and excludes only
`if TYPE_CHECKING:`, `if __name__ == "__main__":`, `@overload`, `raise NotImplementedError`, a
function whose body is `...` right after the colon of its signature (`Protocol` and abstract method
stubs) and a `case _:` arm whose only statement is `assert_never(subject)` on the next line. A
`match` over every member of an enum or union ends with that arm: without it, the jump out of the
`match` when no case matches is an untaken branch. An `assert_never` anywhere else is counted.
A branch that cannot be tested is accepted for one function with an `exceptions` entry for `changed-branch-coverage` that names the function, which keeps every other finding of the file (see [Exceptions for rules nitpicker adds](#exceptions-for-rules-nitpicker-adds)); `exclude` lifts the whole file. A change that leaves the project with no test at all fails as `python/no-tests-ran`. Details: [python-preset.md](python-preset.md).

## The strict preset

The `typescript` preset is strict, and it is the only TypeScript preset: there is no lax mode and no
`preset: "strict"` value. It allows one way to write each construct and fails every other with a
message that names the allowed form. Existing violations are baselined by the differential gate;
new and touched code must comply.

- **Everywhere in production code**: `type`, never `interface` (except in `declare module` and
  `declare global` augmentations and global declaration files without imports or exports); no
  `enum` or `namespace`; classes only as `Error` subclasses; named functions use the `function`
  keyword (arrow functions only as callbacks); named exports only (config files and
  `declare module` blocks may default-export); early returns, no `else` after
  `return`, no nested ternaries; `switch` over a union handles every case; no `as` (except
  `as const`), `any`, non-null `!`, `<Type>value`, or `null` (except strict comparison and the
  `JSON.stringify` replacer); no comments except doc comments on exported API, no inline lint disables, no `@ts-ignore`,
  `@ts-expect-error` or `@ts-nocheck`; `for...of` is the only loop (no `for(;;)`, `for...in`,
  `while`, `do...while` or `forEach`), `async`/`await` with no `.then()/.catch()/.finally()` chains
  and no floating promises, and `===`/`!==` only. Config files are exempt from the loop and chain
  bans.
- **Tests** follow the same construct bans: `for...of` is the only loop (use `it.each` for one test
  per case), no `forEach`, no `.then()/.catch()/.finally()` chains, and no `as` (except `as const`)
  or `<Type>value`. `nitpicker/no-assertion-in-loop` rejects an assertion inside any loop or
  iterating callback of a test (also in a same-file helper that a test calls), because an empty
  collection passes without asserting: assert the whole collection, write a parameterized test, or
  use the loop only to build data. A loop that always runs at least once (a `for` with a literal
  start and bound, `Array.from({ length: 3 })` or `do ... while`) is not reported.
  `nitpicker/no-partial-output-assertion` also rejects `toMatchObject` and
  `expect.objectContaining`, `expect.stringContaining` and `expect.arrayContaining` inside
  `toEqual`/`toStrictEqual`, and `toMatch` with a string or an unanchored pattern: assert the whole
  value. Assertions must pin the value: `toBeDefined`, `toBeTruthy`, `toBeFalsy`, `not.toBeNull`,
  `not.toBeUndefined`, a bare `toHaveBeenCalled()`, `toThrow()` without a message and `expect(true)`
  are rejected. Tests do not use inline lint disables, `@ts-*` or coverage and mutation ignore
  comments; keep no mutable `let` shared between tests; write `it.each` instead of three copies of a
  test; restore fake timers in `afterEach`; leave out `it.todo`, `fails`, `skipIf(true)`, the real
  clock and `Math.random`, and the network in unit tests. A file that defines tests but is not named
  `*.test.*` never runs, and a setup file may not import production code.
- **Layout**: features live in `src/main/features/<name>/` and are imported only through their
  `index.ts`; shared code does not import features; features do not import the composition root
  (`src/main/composition-root.ts`); no import cycles; objects are constructed only in the
  composition root, which only wires features and has no `if`, `?:`, `switch`, `??` or `?.`; no
  module-level `let`.
- **`features/<name>/domain/`** is pure: `const` only, no mutation, readonly types, no loops,
  `forEach`, `reduceRight` or `reduce` without an initial value (use `map`, `filter`, `flatMap`,
  `reduce` with an initial value, `Object.fromEntries`, `Object.groupBy`), no
  classes, no `throw` (return a discriminated union), no `unknown` in parameter or property types
  (it receives parsed, typed values), and no imports of `adapters/`,
  Node I/O, network or database clients, loggers or module state.
- **`features/<name>/adapters/`** does the I/O: throw only `Error` subclasses that keep `cause`, no
  silent catch (rethrow with `{ cause }` or return the caught value in the failure result), and
  parse untrusted input once at the boundary with a schema library, validating every field
  (no `z.unknown()` or `z.any()` fields in `z.object`). The library is the one in your
  `package.json` (zod, valibot, yup, joi, io-ts, arktype, class-validator, ajv, typebox,
  superstruct, runtypes, typia, effect or valita); with none installed the messages name
  [zod](https://zod.dev), an expectation of the preset, not a dependency of nitpicker. The
  catch-logging rule follows the project's logger the same way. See
  [Libraries follow the project](typescript-strict-preset.md#libraries-follow-the-project).
- **All production code** has no recursion: a function that calls itself is flagged (use `map`,
  `flatMap` and friends, or a `for...of` loop for a retry outside `domain/`).
- **Touched code**: a strict-rule finding that exists on the base stays baselined while its file's
  edited lines are elsewhere. When a change edits the line a strict-rule finding sits on, or adds
  the file, the finding counts as new and fails the run. Pure renames and moves stay baselined.
  Findings of descriptive metrics (CRAP, duplication, coupling) keep their delta logic.
  Prettier works the same way: it reports one finding per unformatted region, located at the
  region's first line, so a legacy unformatted file stays baselined until a change edits a line
  inside such a region. An unformatted new file or newly unformatted lines fail the run.
- **Exceptions**: a team that cannot adopt a rule yet adds an entry to `exceptions` in
  `nitpicker.config.json`. It is the only way out; inline disables are errors. Because
  `no-restricted-syntax` is one rule, an exception for it lifts all the syntax bans for those paths;
  default exports, `null` and promise chains have their own rules (`nitpicker/no-default-export`,
  `nitpicker/no-null`, `nitpicker/no-promise-chain`) so a framework convention lifts only one of them.
  When upgrading, an existing `no-restricted-syntax` exception no longer lifts those three bans or
  the UI framework ban in `domain/`: add an entry for `nitpicker/no-default-export`,
  `nitpicker/no-null`, `nitpicker/no-promise-chain` or `nitpicker/no-ui-framework-in-domain` with
  the same paths.
- **Layout overrides**: `layout.sourceRoots` moves the whole structure (`<root>/main/features/...`).
- **Imports stay inside the roots**: production code imports only from files under
  `layout.sourceRoots` (plus packages, `.json` files and files carrying a generator marker, see
  `exclude` under [Configuration](#configuration)). An import of another project folder, including
  build output such as `dist/`, `build/` or `target/`, fails with a message naming the allowed form
  first: move the imported code under a source root, or add its folder to `layout.sourceRoots` so
  the gate checks it. Excluding the imported file instead is a policy loosening that fails until a
  person accepts it.
- **`/* eslint-env */`**: ESLint no longer supports the comment. It is reported as one lint finding
  on the file instead of stopping the lint analyzers.

A small project that follows all of this is kept in `languages/typescript/preset/fixtures/strict-clean` of the nitpicker
repository, and its tests assert that `nitpicker --all` reports no enforceable findings for it.

### Upgrading from the earlier rules

Strict replaced the earlier ESLint rules in a single release. Unless the base carries its own
`nitpicker.config.json`, nitpicker analyzes the base checkout with the head's policy, so the
existing violations appear on both sides and stay baselined; the
policy hash changes. Violations on lines your changes touch fail, so adoption is gradual and driven
by ordinary edits. Add an `exceptions` entry for a rule you cannot adopt yet.

### Your TypeScript and Vitest configs

nitpicker builds on the project's own configs, so type checking and tests see the project as its
own tools do:

- **Type checking** extends the project's `tsconfig.json` when there is one. The project keeps its
  `jsx`, `paths`, module resolution and other settings, and nitpicker adds its policy flags on top
  (`strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`,
  `useUnknownInCatchVariables` and the
  rest of the strict family) plus `noEmit` and `skipLibCheck`. TypeScript projects also get
  `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` and `noUncheckedSideEffectImports`
  (JavaScript projects do not); their errors name the allowed form (`env['PORT']`,
  `title?: string | undefined`). The files checked are the source and test roots. Because `noEmit`
  is set, `.js` files that the project's tsconfig includes no longer fail with TS5055; they get the
  JavaScript lint rules, `no-var` and `prefer-const` among them, and the type-aware `no-unsafe-*`,
  `restrict-plus-operands` and `restrict-template-expressions` rules, so code a change adds to an
  existing `.js` file is held to the types it can see. A new `.js`, `.mjs`, `.cjs` or `.jsx` file
  under the source or test roots of a TypeScript project (one with a `tsconfig.json` at the root or
  in a package, or a config such a `tsconfig.json` references) fails as
  `javascript-in-typescript-project`: write it as `.ts` or `.tsx`. Only an exception for the rule
  lifts it; `layout.entryPoints` do not. Files under a `fixtures/` or `__fixtures__/` folder in a
  test location are test inputs and are not checked, and neither are files outside the roots (root
  config files).
- **Mutation testing** type-checks mutants with the same policy flags, so a mutant such as
  `rows[0]?.text` to `rows[0].text` is discarded as a compile error instead of surviving. The
  flags are only added when the project already type-checks with them; otherwise mutants are checked
  with the project's `tsconfig.json` as it is.
- **Coverage and mutation tests** load the project's `vitest.config.*` or `vite.config.*` (the
  first found, `.ts`, `.mts`, `.cts`, `.js`, `.mjs` or `.cjs`). Its environment, setup files,
  aliases and plugins apply. The options that decide whether a run passes are fixed by nitpicker
  whatever the project sets: no retries, no `bail`, no `.only`, no passing without tests, test and
  hook timeouts of 10 s, unhandled errors fail the run, and snapshots are never written (a snapshot
  must be committed, or the test fails). `vi.stubEnv` and `vi.stubGlobal` are undone after each
  test. nitpicker adds the `*.test.*` and `*.spec.*` files under the source and
  test roots, ignores the project's `test.dir`, and owns the coverage settings, so the project's
  coverage thresholds never decide nitpicker's findings.

Without a project `tsconfig.json` or Vitest config, nitpicker uses its own defaults.

### Test timeout tiers

With the TypeScript or JavaScript preset, `tools.tests.timeouts` sets finite execution deadlines
and permitted timeout declarations. Each field inherits independently, in this order:

1. nitpicker's packaged defaults;
2. `languages[subjectLanguage]`;
3. repository `defaults`;
4. the matching named `projects` entry.

```json
{
  "tools": {
    "tests": {
      "timeouts": {
        "languages": {
          "java": {
            "testDeclarationCeilingMs": 180000,
            "hookDeclarationCeilingMs": 300000
          }
        },
        "defaults": { "testTimeoutMs": 30000, "hookTimeoutMs": 30000 },
        "projects": {
          "java-e2e": {
            "language": "java",
            "include": ["tests/jvm/**/*.test.mjs"],
            "testTimeoutMs": 180000,
            "hookTimeoutMs": 300000
          }
        }
      }
    }
  }
}
```

The subject language is explicit: a Vitest `.mjs` test that builds a Java project can select the
Java tier while ordinary JavaScript tests keep their normal limits. `include` contains nonempty
project-relative glob patterns using `**`, `*`, `?` and `{a,b}`. A file matching multiple named
projects is an error; nitpicker never silently chooses the first or largest allowance. Moving a
test inside its named suite keeps the same bounded policy. These entries do not disable the
timeout rule or exempt files from it.

`testTimeoutMs` and `hookTimeoutMs` control execution. `testDeclarationCeilingMs` and
`hookDeclarationCeilingMs` limit explicit declarations in tests and hooks. All values are positive
whole milliseconds. Without these settings, execution retains the existing runner behavior:
the JavaScript adapters allow 10 seconds plus the larger observed-runtime budget, normally
40 seconds, and preserve native hook settings. Declaration ceilings remain 10 seconds. An omitted
hook deadline keeps the runner's hook default. A permitted declaration ceiling and a runner's
execution deadline serve different purposes and need not be equal.

The existing `thresholds.unitTestSeconds` and `thresholds.integrationTestSeconds` remain
observed-performance budgets, normally 5 and 30 seconds. They produce slow-test findings and are
not timeout declaration ceilings. A shard's total execution time is also separate: it can contain
several cases and shared builds. Give shared build hooks their own measured allowance rather
than raising every unit test's limit.

Vitest applies the resolved deadlines per file while retaining project setup and coverage.
Inline projects and external project configuration files, directories and globs are supported;
external references are expanded into inline projects before applying deadlines. Unresolved or
unsupported project entries fail rather than silently leaving those projects unconfigured.
Other JavaScript runners reject scoped or independent hook settings they cannot faithfully
represent. Native Gradle/Maven/pytest execution settings
are separate integrations; this option currently belongs to the JavaScript test harness.

Increasing a resolved deadline or declaration ceiling, expanding a suite's membership, or removing
a stricter override requires the existing policy-change review. Equivalent tier moves and project
renames retain their effective budgets. The approval digest still needs explicit human acceptance;
introducing this configuration does not accept its own policy changes.

### Your project's tool configs

By default every tool runs with nitpicker's own config, so the project's settings can't loosen the
gate. When a project already has a config it wants to keep, `tools` in `nitpicker.config.json`
sets the precedence for that tool. It lists `"project"` and `"nitpicker"`, highest first:

```json
{ "tools": { "prettier": { "precedence": ["project", "nitpicker"] } } }
```

| `precedence`               | Config used                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `["nitpicker"]` (default)  | nitpicker's only                                                     |
| `["project"]`              | the project's, with the measured conventions under it                |
| `["project", "nitpicker"]` | both merged; the project's value wins where both set the same option |
| `["nitpicker", "project"]` | both merged; nitpicker's value wins where both set the same option   |

A change that adds the opt-in is a policy change, and the project config files it starts reading are
listed with it (each option for `jscpd`), so the person who accepts it sees what the config loosens.

For Prettier, "the project's config" is what Prettier itself resolves for each file
(`.prettierrc*`, `prettier.config.*`, the `prettier` key in `package.json`, and `.editorconfig`),
and the project's `.prettierignore` applies too. The version is still the one nitpicker pins. The
project's config is read from the head checkout and applies to both sides of the comparison, so
editing it never turns unchanged code into new findings, and for the same reason an edit of that
config is a policy change a person reviews (see [Configuration](#configuration)); `--fix` formats
with the same merged config. The setting is listed under "Config overrides" in the report.

Merging is key by key. The project's config replaces only the options it sets; every option it
leaves out keeps the value from the next layer. With `["project", "nitpicker"]` that next layer is
nitpicker's own, whose options under `conventions` are measured from the project's files (the
project's Prettier config is never what they are measured from), so a project config that only sets
`semi: false` still gets the measured quote style, indentation and width. Listing only `"project"`
works the same way without nitpicker's other options: the convention options the project's config
omits take the measured (or pinned, or default) choice, and any other option it omits is Prettier's
own default. Without a `tools` entry the same measured conventions apply on their own, so a project
written with double quotes or without semicolons isn't told to switch. The code options apply to
code files. JSON and YAML take only their own indentation conventions (`useTabs` and `tabWidth`,
measured from the JSON and YAML files); quote style never applies to them, and no print width is
measured from data files, because a YAML or JSON file says nothing about it unless a value is long
enough to wrap. Everything else keeps nitpicker's settings when `"nitpicker"` is listed, and the
project's config alone (plus those two options) under `["project"]`. A `.editorconfig` counts as
the project's Prettier config, so it is read only when `precedence` lists `"project"`.

For `jscpd` (the duplicate-code check, every preset), the project's config is `.jscpd.json` at the
project root, read from the head checkout for both sides of the comparison. Without the opt-in the
run says the file is ignored and how to opt in. Only its detection options apply:

- `minTokens`, `minLines` and `maxLines` (the longest file scanned) take whole numbers of 1 or more.
- `maxSize` (the largest file scanned) takes a size string such as `"100kb"`.
- `mode` takes `strict`, `mild` or `weak`. jscpd 5 reads `skipComments` only from its command line, so
  `"skipComments": true` applies as `"mode": "weak"` (the mode that skips comments) when the file sets
  no `mode`; it has no effect when nitpicker's `mild` wins.
- `ignore` takes file globs such as `"src/legacy/**"`; a bare folder name matches nothing.
- `ignorePattern` takes regular expressions for code to skip, not paths.
- `ignoreCase` takes `true` or `false`.

The project's value wins over nitpicker's (`minTokens: 50`, `minLines: 5`, `mode: "mild"`) where both
set an option, unless `"nitpicker"` comes first; with only `["project"]` an option the file leaves out
takes jscpd's own default. Its `ignore` globs are added to nitpicker's, never replace them. Everything
else stays nitpicker's: which folders and formats are scanned, the report, and the threshold, so a
project `threshold` cannot fail the run. The check for copies with renamed names keeps its own
minimums (100 tokens, 5 lines) unless the project's are higher. Naming `"project"` without the file,
with a file that is not a JSON object, or with a value of the wrong type stops the run with an error
naming the file and the option. An edit of `.jscpd.json` while the project opts in is a policy change,
listed per option (`jscpd .jscpd.json minTokens: 50 -> 500`): one that finds fewer copies needs a
person's acceptance, and one that finds more is only listed. Key order and the options that don't
apply change nothing. When the head drops the opt-in, the base is measured with nitpicker's settings
too.

With the `java` and `kotlin` presets the tools are `pmd` (the project's `config/pmd/ruleset.xml`) and
`checkstyle` (the project's `config/checkstyle/checkstyle.xml`). Both files are read from the head
checkout, and naming `"project"` without the file is a tool error. Without a `tools` entry these files
are not used. Listing `"project"` never drops a nitpicker rule, with Gradle or Maven and for the Kotlin
preset's Java files: `["project"]` and `["project", "nitpicker"]` both lay the project's file over
nitpicker's, and only what the project sets changes (`["nitpicker", "project"]` lets nitpicker's value win where both
set one).

- **PMD** runs nitpicker's ruleset and the project's together. A rule the project names on its own, such as
  `<rule ref="category/java/errorprone.xml/AvoidLiteralsInIfCondition">`, or defines inline, is laid over
  nitpicker's definition of that rule: the project's priority, message and each property it names win, and
  every property it leaves unset keeps nitpicker's value (not PMD's default). The project's ruleset-level
  `exclude-pattern`s apply to the rules it brings. A whole-category reference such as
  `<rule ref="category/java/errorprone.xml"/>` enables the rules of the category that nitpicker does not run
  (including those nitpicker leaves out of the category), minus the `<exclude name>`s in the project's own
  reference; it cannot switch a nitpicker rule off. A rule nitpicker lacks (performance, security, codestyle,
  your own XPath rules) is added as written. The measured `java.assertionHelpers` stay in
  `extraAssertMethodNames` unless the project sets that property itself.
- **Checkstyle** merges the two configs module by module. When nitpicker has one module of a name, the
  project's module of that name merges into it, whatever the ids; with several (`RightCurly` with ids), the
  project's `id` picks the copy, and a module with no id merges into all of them. A merged module keeps
  nitpicker's properties and takes the project's value for each property the project sets; a module in only
  one config stays; the project's `SuppressionFilter`s run next to nitpicker's, and its inline suppression
  filters (`SuppressWarningsFilter`, `SuppressionCommentFilter`, `SuppressWithPlainTextCommentFilter` and the
  like) are removed, as in nitpicker's own config. The merged config runs on the Checkstyle version nitpicker
  pins, not the project's own, and the project's `${config_loc}` points at its config folder in the head
  checkout, on Gradle and Maven and for the base snapshot too.

#### ESLint configs (typescript and javascript presets)

With the `typescript` and `javascript` presets the tool is `eslint`, and the project's config is its flat
config: the first of `eslint.config.js`, `.mjs`, `.cjs`, `.ts`, `.mts` and `.cts` at the project root, the
file ESLint itself would load. It is read from the head checkout and applies to both sides of the
comparison. A TypeScript config loads through the `jiti` package (version 2 or later) the project
installs, as ESLint requires; without one, nitpicker uses a `jiti` installed next to it if there is one,
and otherwise the ESLint analyzers fail with a message asking for `jiti`. A config that is a symbolic
link to a file inside the repository is read through the link; one that points outside the repository is
an error.

The head policy keeps a digest of what the config reads, so the findings cache and the policy review
see a change of any of it:

- the config and every local file it imports (relative `import`, `export ... from`, `import()` and
  `require`), followed through the repository, so a monorepo's shared `../eslint-rules.mjs` counts; a
  local import outside the repository is an error;
- every file a string literal in those files names relative to the file or to the project root, such
  as the `.gitignore` handed to `includeIgnoreFile` (`package.json` and `tsconfig*.json` excepted);
- the installed version of each package those files import by name, such as a plugin or a shared
  config; a workspace package inside the repository counts by its `package.json` and its entry file,
  followed like a local file.

Not covered: a file read through a computed path (a template string with `${}`, a path built from
variables, a glob), environment variables, and the dependencies of an imported package beyond that
package's version. An edit of a tracked file is a policy change; package versions only change the
cache key. Comments and formatting do not count: script files are compared as TypeScript prints them
without comments. With `"project"` first, the policy review also lists each nitpicker rule whose options
the project replaces (`eslint project config replaces the options of nitpicker rule no-unused-vars`).

Naming `"project"` without the file, or with one that does not load, does not export a flat config array
or object, or has an entry key ESLint does not know (`Unexpected key "default" found`, as for a CommonJS
config that wraps its array in `module.exports = { default: [...] }`), is a tool error of the ESLint analyzers. Without the opt-in the run
prints, once at the start, `Ignoring eslint.config.mjs; opt in with "tools": { "eslint": { "precedence":
["project", "nitpicker"] } }`, keeping any other `tools.eslint` key in the snippet. Both
[lint engines](#lint-engine) run the same layered config: oxlint gets the project's options for the rules
it has its own port of, and plugins oxlint lacks run inside oxlint through the original ESLint plugin, as
nitpicker's own do.

Flat configs concatenate and the later entry wins for each rule, so the layer listed first goes last.
Only these parts of each entry of the project's config apply:

| Part of an entry                                                                    | How it applies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules` for a rule nitpicker's config turns on                                      | With `"project"` first, the setting applies only to files nitpicker runs the rule on (the entry's `files` and nitpicker's both have to match), and `"off"` or `0` is dropped. `no-restricted-syntax`, `no-restricted-globals` and `no-restricted-properties` add the project's entries to nitpicker's; a `max-*` or `complexity` limit takes the lower of the two; a severity alone keeps nitpicker's options; any other options replace nitpicker's. With `["nitpicker", "project"]` they are not used. |
| other `rules`, including ones nitpicker only turns off                              | Added in `eslint-lint`, `"off"` included. `eslint-errors`, `eslint-logging` and `eslint-module-effects` take only the project's settings for the rules they run, and a `nitpicker/*` rule is never added where nitpicker does not run it.                                                                                                                                                                                                                                                                |
| `plugins`                                                                           | Added for those rules. A namespace nitpicker defines (`@typescript-eslint`, `vitest`, `nitpicker` and the like) keeps nitpicker's plugin, so the project's rules of that namespace run on nitpicker's version of it.                                                                                                                                                                                                                                                                                     |
| `settings`                                                                          | Merged with nitpicker's, except a key nitpicker sets or one in a namespace nitpicker owns (a `nitpicker*` key, a plugin name nitpicker defines such as `react`, or `import/...` for its `import` plugin), which is dropped.                                                                                                                                                                                                                                                                              |
| `languageOptions.globals`                                                           | Merged with nitpicker's, the higher layer winning.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| global `ignores` (an entry with only `ignores`, `name` and `basePath`)              | Added to nitpicker's. A negated (`!`) pattern is dropped, so it cannot bring back a file nitpicker ignores.                                                                                                                                                                                                                                                                                                                                                                                              |
| `files`, `ignores`, `basePath` and `name` of the other entries                      | Scope the entry, as in ESLint (`basePath` is folded into the patterns).                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `languageOptions` other than `globals`, `linterOptions`, `processor` and `language` | Ignored. nitpicker's parser and type information, its lock on inline configuration (`noInlineConfig` for source files) and its report of unused disable directives stay.                                                                                                                                                                                                                                                                                                                                 |

So, as for PMD, listing `"project"` never switches a nitpicker rule off, and `["project"]` is the same as
`["project", "nitpicker"]`. A rule is lifted for some paths with an `exceptions` entry, the one reviewed
route; with `"project"` listed that includes a rule only the project's config adds (`no-alert`, say), and
an exception also wins over the project's setting for its rule. Which files are linted stays nitpicker's
(the source and test roots, `exclude`): the project's config can only ignore more. Options are the one
way the project can weaken a nitpicker rule (`allowEmptyCatch` for `no-empty`, `args: "none"` for
`no-unused-vars`), which is why the review lists each rule whose options it replaces. Any opt-in that
lists `"project"`, in either order, is a policy loosening a person reviews (its ignores, globals,
settings and added rules apply with nitpicker first too), as is every later edit of a file the config
reads. The rules run on the ESLint version nitpicker pins, so a core rule the project names must exist
in it.

#### Formatter and detekt configs (python and kotlin presets)

The format checks and detekt follow the project's code, not its tool configs, so a setting in
`[tool.ruff]`, `[tool.black]`, `.editorconfig`, a ktfmt style in the build or a `detekt.yml` cannot
loosen the gate. A project whose ruff or black config set the line length or quote style, whose
`.editorconfig` set ktlint properties, or whose `detekt.yml` set rules is checked with the measured
conventions (and detekt's defaults) until it opts in. The run prints, once at the start, the exact
command that formats the code the way nitpicker checks it (`Format with ruff: ruff format ...`), and
one line per ignored config, such as `Ignoring [tool.ruff] in pyproject.toml except
lint.flake8-pytest-style; opt in with "tools": { "ruff": { "precedence": ["project", "nitpicker"] } }`. Each format finding points to that command.

| Tool     | Default (isolated)                                                                                 | Read when `precedence` lists `"project"`                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ruff`   | `ruff format --isolated` with `--line-length`, `format.quote-style`, `indent-width`/`indent-style` | `.ruff.toml`, `ruff.toml` or `pyproject.toml` (first found, from the project up to the repository root, following `extend`) |
| `black`  | `--config` to an empty file with `--line-length`, `--skip-string-normalization`                    | `[tool.black]` in the nearest `pyproject.toml` (black stops there, with or without the table)                               |
| `ktlint` | runs on a copy of the sources under its own `.editorconfig` (`root = true`)                        | every `.editorconfig` under the project and above it up to the repository root                                              |
| `ktfmt`  | `--meta-style` or `--kotlinlang-style` from `kotlin.indentation`, no editorconfig                  | the style the build names (`kotlinLangStyle()`, `googleStyle()`) and `--enable-editorconfig`                                |
| `detekt` | detekt's defaults and nitpicker's rules                                                            | the project's `detekt.yml` (also when `kotlin.detektConfig` names one), laid over the defaults                              |

Listing `"project"` makes the project's value win for the options it sets, and the measured
conventions (or the pins) fill the rest; `["project", "nitpicker"]` and `["project"]` are the same
here. When an opted-in project value overrides a pin in `nitpicker.config.json`, the conventions line
says so. `["nitpicker", "project"]` lets the conventions win where they have a value; it is accepted
for `ruff` and `detekt` and a config error for `ktlint` and `ktfmt` (both read their
`.editorconfig` first) and `black` (no flag switches string normalization back on), which must list
`"project"` first. The files are read from the head checkout and apply to both sides of the
comparison; they are part of the cache key, so editing one invalidates cached results. An edit of
an opted-in config is a policy change a person reviews (see [Configuration](#configuration)), and
so is the config a change opts into: its guidance then says to remove `"project"` from the
precedence or have a person review the config, rather than to restore the file. For
`ruff` and `black` only the tool's own settings count: the `[tool.ruff]` or `[tool.black]` table of
`pyproject.toml` (an edit of `[tool.poetry]` is not one), the whole `ruff.toml` or `.ruff.toml`, and
the files its `extend` chain names; comments, layout and key order never count. A project
listed without its file is a tool error for `ruff`, `black`, `ktlint` and `detekt`, and the message
says to create the file or remove `"project"` from `tools.<tool>.precedence`.

Without the opt-in, ruff and black still keep the project's scope: its `exclude`, `extend-exclude`
and `force-exclude` (paths resolved against the config file) and its `target-version` or
`requires-python`, so a project-excluded generated file gets no format finding and both formatters
infer the same target. The other keys the project sets (`skip-magic-trailing-comma`, `line-ending`,
`docstring-code-format`, `preview`) take effect only with the opt-in.

`tools.ruff` covers `ruff check` too. Without the opt-in the lint runs nitpicker's rules with
nitpicker's options, whatever `[tool.ruff.lint]` sets, and the run prints the `Ignoring [tool.ruff]`
line also when black is the formatter. Listing `"project"` merges the config the format check reads
(the same file and `extend` chain) with nitpicker's:

- **Rules.** The rules the project's `select`, `extend-select`, `ignore` and `extend-ignore` resolve
  to run next to nitpicker's. ruff itself resolves them (`ruff check --show-settings --config
<project file>`), so the `extend` chain, the more specific selector winning, the pydocstyle
  `convention` and the codes ruff redirects (`TCH` to `TC`, `TRY200` to `B904`) count the way the
  project's own ruff counts them. As with PMD, listing `"project"` never drops a
  nitpicker rule: an `ignore` or `per-file-ignores` entry that names one is dropped for that rule,
  and `python.exceptions` (which then accepts any ruff code) is the way to lift a nitpicker rule
  for some paths. A rule nitpicker leaves off on purpose (its own `ignore`, such as `B008`) runs when
  the project selects it with `["project", "nitpicker"]` or `["project"]`, and stays off with
  `["nitpicker", "project"]`.
- **Per-file ignores.** `per-file-ignores` and `extend-per-file-ignores`, as ruff resolves them
  (redirected codes included), apply to the rules the project adds.
- **Options.** With `["project", "nitpicker"]` or `["project"]` the rule settings
  (`[tool.ruff.lint.isort]`, `pydocstyle`, `pep8-naming`, the `flake8-*` tables and the like) and
  lint keys such as `dummy-variable-rgx`, `typing-modules` and `preview` merge key by key, the
  project's value winning where both set one and a list both set joined (nitpicker's
  `pep8-naming.ignore-names` keeps the unittest names next to the project's); `indent-width`,
  `builtins`, `src`, `namespace-packages`, `preview`, `target-version` and
  `per-file-target-version` come from the project. The run prints which of those options reach the
  rules nitpicker runs, such as `ruff check: the project's dummy-variable-rgx, pep8-naming replace
nitpicker's for its own rules`. With `["nitpicker", "project"]` nitpicker's values win, lists
  included: the project's top-level lint keys and the option tables of the linters nitpicker runs
  (`pep8-naming`, `flake8-bandit`, `flake8-unused-arguments` and the like) are left out, so
  `dummy-variable-rgx = ".*"` or `ignore-names = ["*"]` cannot silence a nitpicker rule; the
  tables of linters only the project selects (`pydocstyle`, `isort`) still apply. `target-version`,
  `per-file-target-version`, `builtins` and `preview` stay nitpicker's (the project's preview rules
  then do not run), and only the layout keys `src`, `namespace-packages` and `indent-width` come
  from the project.
- **Line length.** The rules that depend on it (`SIM108` does not suggest a ternary that would not
  fit) check against the followed `python.lineLength`, passed as `--line-length` in every ordering
  and with either formatter, the way the format check does. The project's `line-length` is used
  instead only when it is listed first and its value agrees with the followed one, or when the
  conventions follow none; without the opt-in, or with `["nitpicker", "project"]`, the lint uses
  the followed value (88 when none is followed).
- **Scope.** The project's `exclude`, `extend-exclude` and `lint.exclude` are added to nitpicker's
  `exclude` (ruff's default excludes stay); `include`, `extend-include`, `respect-gitignore`,
  `force-exclude` and the fix, cache and output settings stay nitpicker's.

Paths in the project config are resolved against the folder of the file that sets them, in the
checkout being checked. The `[tool.ruff.lint.flake8-pytest-style]` options are read with or without
the opt-in, from the head checkout for both sides (see the
[Python preset](python-preset.md)). The merged config is written to the report folder as
`nitpicker-ruff-layered.toml`; listing `"project"` with a ruff whose `ruff check --show-settings`
cannot resolve the project config is a tool error.

The ids and values: `"kotlin.indentation"` `"2"`/`"4"` (ktfmt `meta`/`kotlinlang`, and ktlint `indent_size`; unlike
`java.indentation` it has no default: with no clear majority the tools keep their own, ktfmt Meta and
ktlint 4), `"kotlin.trailingCommas"` `"always"`/`"never"` (ktlint only), `"kotlin.wildcardImports"`
`"explicit"`/`"wildcard"` (ktlint `no-wildcard-imports` and detekt `WildcardImport`), `"kotlin.lineLength"`
`"100"`/`"120"`/`"140"` or any number of columns (ktlint `max_line_length`, ktfmt `--max-width` and detekt `MaxLineLength`; no default, so with no
clear majority each tool keeps its own width), `"python.quotes"`
`"double"`/`"single"` (ruff format; black keeps single quotes as written, so it accepts both),
`"python.lineLength"` `"79"`/`"88"`/`"100"`/`"120"` or any number of columns (ruff format and black) and `"python.indentation"`
`"4"`/`"2"`/`"tab"` (ruff format only). A convention the formatter in use cannot apply is not measured
or printed, and pinning it is a config error. The run prints the source of each convention it follows: the files it measured, the pin in
`nitpicker.config.json`, or your tool config.

Which formatter applies which convention:

| Convention               | ruff format | black                                 | ktlint | ktfmt                     | detekt |
| ------------------------ | ----------- | ------------------------------------- | ------ | ------------------------- | ------ |
| `python.quotes`          | yes         | yes (single: keeps quotes as written) | -      | -                         | -      |
| `python.lineLength`      | yes         | yes                                   | -      | -                         | -      |
| `python.indentation`     | yes         | no (black always indents 4)           | -      | -                         | -      |
| `kotlin.indentation`     | -           | -                                     | yes    | yes (`meta`/`kotlinlang`) | -      |
| `kotlin.trailingCommas`  | -           | -                                     | yes    | no (always adds them)     | -      |
| `kotlin.wildcardImports` | -           | -                                     | yes    | -                         | yes    |
| `kotlin.lineLength`      | -           | -                                     | yes    | yes (`--max-width`)       | yes    |

#### Type checker and mutation configs (python preset)

The type checkers and mutmut follow the same rule as the formatters: their strictness and their scope
are nitpicker's, so a project config cannot weaken the gate. By default only what the tool needs to
find the code and the packages is read, and the run prints one line per ignored config, such as
`Ignoring [tool.pyright] in pyproject.toml except its environment keys; opt in with "tools": { "pyright": { "precedence": ["project", "nitpicker"] } }`.

| Tool      | Read without the opt-in                                                                                                                                                                                                                                                | Read when `precedence` lists `"project"`                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pyright` | `venv`, `venvPath`, `pythonVersion`, `pythonPlatform`, `stubPath`, `typeshedPath`, `extraPaths`, and the `root`, `extraPaths`, `pythonVersion` and `pythonPlatform` of `executionEnvironments`                                                                         | every key of `pyrightconfig.json` (or `[tool.pyright]`/`[tool.basedpyright]`, following `extends`) over nitpicker's strict settings |
| `mypy`    | `plugins`, `mypy_path`, `python_version`, the namespace and typeshed options, and the `ignore_missing_imports` and `follow_imports` of sections for modules the project does not own (own: found under the source roots and `mypy_path`, as `.py`, `.pyi` or `-stubs`) | every option and per-module section of `mypy.ini`, `.mypy.ini`, `[tool.mypy]` or `setup.cfg`, over `strict = true`                  |
| `mutmut`  | `also_copy`, the process isolation options, and the source paths when `python.sourceRoots` is `.`; nitpicker writes `source_paths` and `do_not_mutate` (tests and `exclude`)                                                                                           | every key of `[tool.mutmut]` or `[mutmut]` over nitpicker's; the test files and the `exclude` globs stay in `do_not_mutate`         |

`tools.pyright` covers `pyright` and `basedpyright` alike (there is no `tools.basedpyright`). With the
opt-in a key the project sets overrides nitpicker's and every key it leaves out stays strict, so a
project that only sets `pythonVersion` is still checked in strict mode. The `include` and `exclude`
lists and the `extraPaths` are merged with nitpicker's, so its source roots and `exclude` globs still
apply. `["nitpicker", "project"]` keeps the unlisted behavior: only the keys in the left column are
read. Without the opt-in, mypy sections for the project's own modules (`[mypy-shop.*]` with
`ignore_errors`, `follow_imports = skip` and the like) and sections whose pattern starts with `*` are
dropped, since they silence the code under test; sections for third-party modules are kept. A project
listed without its config, or with one that cannot be parsed, is a tool error. The files are read from
the head checkout and are part of the cache key (pyright's `extends` chain included); their source
paths are resolved against the checkout being checked, and pyright also looks in the parent
directories up to the repository root. The project's mypy `exclude` is kept as written and nitpicker's
is added with `--exclude`. mutmut's notice is printed only when the project's table has keys it
ignores.

An edit of an opted-in config is a policy change a person reviews, with any `precedence` that lists
`"project"`, and so is the config a change opts into. Only the tool's own settings count: `pyrightconfig.json` and the files its `extends`
chain names, or the `[tool.pyright]` and `[tool.basedpyright]` tables; for mypy and mutmut the one
file the tool reads, and of it only the `[mypy]` and `[mypy-*]` sections (`mypy.ini`, `.mypy.ini`,
`setup.cfg`), `[tool.mypy]`, `[tool.mutmut]` or the `[mutmut]` section. An edit of `[flake8]` in
`setup.cfg` or of `[tool.poetry]` is not one, and comments, layout and key order never count. A
config the tool finds above the project folder (a `ruff.toml`, `pyproject.toml` or
`pyrightconfig.json` at the root of a repository whose project sits in `packages/api`) counts too,
up to the repository root, and every Python config is named by its path in the repository.

### Lint engine

The lint analyzers apply nitpicker's ESLint policy, but by default they run it on
[oxlint](https://oxc.rs), which is several times faster. Rules oxlint has its own port of run
natively, type-aware rules run on its TypeScript 7 checker, and every other rule (nitpicker's own,
and plugins oxlint lacks) runs inside oxlint through the original ESLint plugin. The few type-aware
plugin rules oxlint cannot run still run on ESLint, for those rules only. A project config opted in
with `tools.eslint.precedence` is layered the same way on both engines; see
[ESLint configs](#eslint-configs-typescript-and-javascript-presets).

Findings match ESLint's with these known differences:

- Type-aware rules see the project through TypeScript 7, so a rule such as
  `@typescript-eslint/unbound-method` can find a few cases TypeScript 6 missed.
- A disable comment for a rule the analyzer does not run is reported as unused, where ESLint
  reports that the rule definition was not found.
- Rules oxlint has its own port of word some messages differently, and a few report a different
  column. Switching engines therefore shows those findings as new once.
- Files and folders whose names start with a dot are not linted.

To run the policy on ESLint itself, set the engine:

```json
{ "tools": { "eslint": { "engine": "eslint" } } }
```

### Type check engine

The `typescript-typecheck` analyzer type checks with TypeScript 7, the native compiler, which is
much faster than TypeScript 5 and 6. nitpicker installs and pins TypeScript 7 itself. A run uses
the project's own `typescript` package instead, as before, when the config uses an option
TypeScript 7 removed or no longer knows (such as `baseUrl`, `moduleResolution: "node"` or
`target: "ES5"`), or when TypeScript 7's compiler is not installed for the platform. The report does
not say which engine a run used; set the engine to choose one.

Projects on TypeScript 7 (the native compiler) are supported. TypeScript 7's npm package has no
JavaScript API, which nitpicker's analyzers and typescript-eslint read source files with, so on such
a project nitpicker reads them with its own TypeScript 6.0, the JavaScript release that matches
TypeScript 7's behavior, and redirects `typescript` to it in the processes it starts. That needs
Node.js 22.19 or newer. The type check still runs on the project's own TypeScript 7 with the
`project` engine, and an option it removed is reported as the project's compiler reports it.

The redirect applies only to modules loaded from a `node_modules` package, so the project's own
code and tests, including the test runs nitpicker starts for coverage and mutation, keep getting the
project's TypeScript 7; a dependency they load that reads `typescript` gets TypeScript 6.0's API. A
project with no `typescript` installed is read and type checked with nitpicker's own TypeScript.

Findings match the project's own TypeScript, with the same messages, positions and symbols, except:

- TypeScript adds "Did you mean ...?" to a limited number of unknown-name errors. TypeScript 7
  checks files on several checkers, each with its own limit, so it adds the suggestion to more of
  them.
- A "file is in the program because" note names the include pattern or `files` entry that
  matched, where the project's TypeScript says "Root file specified for compilation".
- A few messages are worded differently, such as "No overload matches this call" details and
  paths in `/// <reference path>` errors, and an unbuilt project reference is read from its
  sources instead of being reported as not built.

Switching engines therefore shows those findings as new once. Paths inside messages are relative
to the project, so they are the same on both sides of the comparison.

To always type check with the project's own TypeScript, set the engine:

```json
{ "tools": { "typescript": { "engine": "project" } } }
```

### TypeScript project config

To use your project's own type scope and compiler options for type checking and Stryker's
TypeScript checker, explicitly select a config in `nitpicker.config.json`:

```json
{ "tools": { "typescript": { "project": "tsconfig.quality.json" } } }
```

The path must name a JSON config file inside the project, relative to its root. Nested configs
and their `extends` are supported. Each snapshot reads its own copy of that config. Its options,
`files`, `include` and `exclude` are retained; nitpicker adds its configured `exclude` patterns
and sets `noEmit: true`. Imported files and explicit `files` entries follow TypeScript's usual
exclusion semantics. The preset does not add strictness, JavaScript inputs or DOM libraries to
an explicitly selected config. A missing config is an error, without a preset fallback.

`project` selects the config independently of `engine`, so both keys can be set together. With
no `project`, nitpicker keeps its strict preset and automatic root tsconfig/jsconfig layering.
Other analyzers still enforce nitpicker's rules and source/test layout.

## Adopting nitpicker on existing code

Because only new findings fail, most analyzers need no preparation. The `coding-standards` analyzer
is stricter: it fails on every violation of its rules unless an inventory lists the site. To adopt
nitpicker without fixing everything first:

1. Run `npx nitpicker --all` at the project root to list the violations present now.
2. Record the `coding-standards` sites in `nitpicker.legacy.json` at the project root, as
   `{ "sites": [{ "file", "rule", "source", "count" }] }`, and commit it. To keep it elsewhere, set
   `"legacyInventory"` in `nitpicker.config.json` to a path inside the project.
3. Only the listed sites, up to their `count`, are allowed. A new or extra occurrence is a new
   finding.
4. When a site is fixed, remove it from the inventory so it cannot come back. Do not add new code
   to the inventory.

The inventory is read from the head commit and applied to both sides, and its content is part of
the policy hash.

You can also relax the gate while you adopt it: `disable` analyzers you are not ready for,
`exclude` vendored code (generated code needs only its generator marker), and set `layout` if your
sources are not under `src/`. Each
of these is visible in the report. Remove them as the codebase improves.

## Container image

The repository's `Dockerfile` builds an image that runs the gate in any CI without installing Node
on the host. It is Node 22 (slim) with Git, nitpicker installed from source as `nitpicker` (the
entrypoint), and `/work` as the working directory. Build it from the repository root; no image is
published yet.

```sh
docker build -t nitpicker .
docker run --rm -v "$PWD":/work nitpicker            # same as: npx nitpicker
docker run --rm -v "$PWD":/work nitpicker --base origin/main --output reports/quality/diff
```

Mount your project at `/work`. The image marks `/work` as a Git `safe.directory`, so a checkout
owned by another user works. Arguments after the image name are nitpicker's arguments and the exit
codes are the same (0, 1, 2). Your project must have its dependencies installed in `node_modules`
(`vitest`, `@vitest/coverage-v8` and `typescript` are resolved from the project, as with `npx`), and
its history must contain the merge base. Reports are written under the mount, owned by the
container user; add `--user "$(id -u):$(id -g)"` to own them yourself, together with
`-e HOME=/tmp` so that the package managers have a writable cache. The image carries Corepack
(pnpm and Yarn, downloaded on first use) and Bun 1.4.2 for the base's dependency install; a project
that pins another Bun needs its own image.

GitHub Actions:

```yaml
jobs:
  nitpicker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: npm ci
      - run: docker build -t nitpicker path/to/nitpicker
      - run: docker run --rm -v "$PWD":/work -e CI -e GITHUB_BASE_REF -e NITPICKER_ACCEPT_POLICY_CHANGE nitpicker
        env:
          NITPICKER_ACCEPT_POLICY_CHANGE: ${{ vars.NITPICKER_ACCEPT_POLICY_CHANGE }}
```

`NITPICKER_ACCEPT_POLICY_CHANGE` comes from a repository variable that only an admin can set, so a
person accepts a loosening of `nitpicker.config.json` by setting it to the digest the finding
names; the container needs `CI` too, since the variable is honoured only in CI.

## Sharding in CI

Split the analyzers over parallel jobs, then combine the results. Every shard must see the same
commits and the same config.

```sh
# in each of N parallel jobs (index 0 to N-1)
npx nitpicker --shard-count 3 --shard-index "$INDEX" --defer-exit --output "shards/$INDEX"

# after collecting every shard's output directory under one root (shards/0, shards/1, ...)
npx nitpicker aggregate --input-root shards --shard-count 3
```

- `--shard-count` and `--shard-index` go together. Analyzers that depend on each other are kept in
  the same shard, so the count cannot exceed the number of independent analyzer groups.
- `--defer-exit` lets each shard exit 0 after writing its reports, so a failing shard does not hide
  the others. The gate is the `aggregate` step.
- `nitpicker aggregate` validates that every shard ran the expected analyzers on the same
  commits, merges the reports and applies the same exit codes as a normal run: 0, 1 or 2. A
  missing or inconsistent shard is a tool error (exit 2). It reads the same
  `nitpicker.config.json`, writes to `reports/quality/diff/combined` unless `--output` is given,
  and takes the policy from the head commit recorded in the shards (or from `--policy-root`).
- Set `NITPICKER_MAX_PARALLEL` to a positive integer to cap how many analyzers run at once within
  one job.
