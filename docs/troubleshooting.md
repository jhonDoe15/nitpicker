# Troubleshooting

This page covers the failures that are not findings about your code: a run that exits 2, a tool that
cannot start, a base that cannot be analyzed. Each entry gives the symptom, the cause and the fix.
A message whose fix takes more than it says ends with a link to its entry; one that already says what
to do has no link, and its entry is here to find by the message's text. The link follows the version
you run: an installed package links to this page at its release tag (`blob/v<version>`), and a
checkout of the repository links to `main`. Findings about your code are explained in
[Usage](usage.md) and the preset guides instead.

- [Reading a failed run](#reading-a-failed-run)
- [Arguments, configuration and project](#arguments-configuration-and-project)
- [Git and the base](#git-and-the-base)
- [Runs, analyzers and caches](#runs-analyzers-and-caches)
- [Policy changes](#policy-changes)
- [Tests](#tests)
- [TypeScript and JavaScript](#typescript-and-javascript)
- [Python](#python)
- [Java and Kotlin](#java-and-kotlin)
- [Platforms](#platforms)

## Reading a failed run

### Exit code 2 and tool errors

**Symptom.** `nitpicker` exits 2, and the console summary lists `tool error` lines, each as
`<analyzer> (<base or head>): <message>`. Or the run stops at once with `nitpicker failed: <message>`
on stderr and no reports.

**Cause.** Exit 2 means nitpicker could not decide, which is never a pass. Either an analyzer or one of
its tools failed (a tool error), or the run failed before it could analyze anything (invalid arguments,
invalid configuration, no Git repository). A tool error is the tool's failure, not a finding about your
change. Findings still fail the run first: with a new enforceable finding the exit code is 1 and the
tool errors are listed next to it. Each tool error names the snapshot it happened on: `head` is your
checkout and `base` is the merge base.

**Fix.**

1. Read the message. Many say what to do; the others carry a link to the entry on this page that
   names the cause.
2. When a message has no link, find its text in the entries below, or read the full text in
   `reports/quality/diff/tool-errors.json` (the console cuts long messages at about 300 characters).
   `summary.json` records `overallStatus: "tool-error"`.
3. Fix the cause and run again. `--analyzer <name>` reruns only the analyzer that failed (it cannot be
   combined with sharding), which is quicker than a full run.
4. A tool error on `base` that your change did not cause (the base's tests fail, the base does not
   install) cannot be fixed in your change. Move to a base that works, or compare with another ref
   using `--base <ref>`.

## Arguments, configuration and project

### Invalid arguments

**Symptom.** `nitpicker failed: Unknown argument: --foo`, `--base requires a value`,
`--fix cannot be combined with --all`, `--all cannot be combined with --base`,
`--shard-count and --shard-index must be provided together`,
`NITPICKER_MAX_PARALLEL must be a positive integer`, `Unknown cache command`, and similar. Exit code 2.

**Cause.** The command line or an environment variable nitpicker reads has a form it does not accept.
Nothing was analyzed.

**Fix.** Run `nitpicker --help` for the accepted forms, or read the
[command line reference](usage.md#command-line). The combinations that are refused:

- `--all` cannot be combined with `--base`, `--fix`, sharding or `--defer-exit`.
- `--shard-count` and `--shard-index` go together, and `--analyzer` cannot be combined with them.
- `--shard-count` cannot exceed the number of independent analyzer groups, and `--shard-index` must be
  a whole number from 0 to `--shard-count` minus 1.
- `NITPICKER_MAX_PARALLEL` is a positive whole number.
- `--accept-policy-change` takes a digest as `--accept-policy-change=<digest>`.

### Invalid configuration

**Symptom.** `nitpicker.config.json is not valid JSON: ...`, or a message that starts with
`nitpicker.config.json:` such as `unknown threshold "x"`, `"thresholds.crapLimit" must be a positive
number`, `analyzers entry "x" clashes with another analyzer name`, or `"base" cannot be ...`.
Exit code 2.

**Cause.** The config file is read before anything runs, and any unknown key, wrong type or value, or
key that the chosen preset does not support is an error. A key is never ignored silently.

**Fix.** Edit `nitpicker.config.json` as the message says. The message names the key and the accepted
values; the [configuration reference](usage.md#configuration) lists every key and which presets take it.
A `base` that names the commit you are on is refused because the change would be compared with itself:
name a branch such as `origin/main`.

### Not a Git repository

**Symptom.** `<directory> is not inside a Git repository that git can read (or git is not installed)`,
followed by `git said:` and git's own message when git printed one.

**Cause.** nitpicker compares your change with its merge base, so the project must be inside a Git
checkout that git agrees to read, and `git` must be on the `PATH`. The most common reasons are a
source archive without `.git`, a container build that copies the files but not the history, a CI job
that runs before the checkout step, and a checkout owned by another user, which git refuses to read
(`detected dubious ownership in repository`).

**Fix.**

- Run nitpicker inside a checkout, and install Git where it runs. Every run needs the repository,
  `--all` included.
- In a container, mount or copy the `.git` directory.
- For `dubious ownership`, the checkout belongs to another user, as in containers and CI runners that
  mount the workspace. Mark it as safe for the user that runs nitpicker:
  `git config --global --add safe.directory <path>`, with the path git prints.

### No project found

**Symptom.** `No package.json or nitpicker.config.json found between <directory> and repository root
<root>`.

**Cause.** The project is the nearest directory, from where you ran nitpicker up to the repository
root, that holds a `package.json` or a `nitpicker.config.json`. Neither exists on that path. A Java,
Kotlin or Python project often has no `package.json`.

**Fix.** Run nitpicker from inside the project, or create the config with its preset at the project
root: `{"preset": "java"}` (or `"kotlin"`, `"python"`, `"javascript"`, `"typescript"`). In a repository
with several projects, run nitpicker once in each project directory.

## Git and the base

### No base could be determined

**Symptom.** `No base could be determined. Use --base <ref>.`, or `"base" is <ref>, the commit you are
on, so the change would be compared with itself`.

**Cause.** nitpicker takes the first of `--base`, the pull request target branch from CI
(`CHANGE_TARGET`, `GITHUB_BASE_REF`, `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`), `base` in the config, the
default branch of the `upstream` remote when there is one (else of `origin`), then `origin/main` and
`origin/master`. None exists in this clone, for example
a fresh `git init` with no remote, or a CI checkout that fetched one branch only. A configured `base`
that equals `HEAD`, the branch you are on, or its commit is refused.

**Fix.** Pass the branch to compare with: `npx nitpicker --base origin/main`. In CI, fetch the target
branch (`fetch-depth: 0` in GitHub Actions) so that `origin/<branch>` exists, or set `base` in
`nitpicker.config.json`. See [the base ref](usage.md#what-it-compares).

### Base ref not found

**Symptom.** `Cannot resolve base ref "origin/main". Fetch it before running the comparison.`

**Cause.** The ref exists in the config or on the command line, but not in this clone. A shallow or
single-branch clone, a mistyped name, or a remote that was never fetched all look like this.

**Fix.** Fetch it: `git fetch origin main` (the name must match, so `origin/main` needs the remote
`origin` and the branch `main`). In CI, check out with full history, or at least fetch the target
branch. Check the spelling with `git branch -a`.

### No merge base

**Symptom.** `Cannot find a merge base between HEAD and "origin/main". Run \`git fetch --unshallow
'origin' 'main'\` and retry.`(a plain`git fetch` command when the clone is not shallow).

**Cause.** The base ref and `HEAD` are both there, but the history that connects them is not. This is
the signature of a shallow clone: CI systems fetch only the last commit (or a few) by default, so the
common ancestor is not in the clone. It also happens when the two branches share no history at all.

**Fix.** Run the command the message prints; it unshallows the clone when it is shallow, and fetches
the base branch otherwise. In GitHub Actions, set `fetch-depth: 0` on `actions/checkout`. In other CI
systems, set the clone depth to full or to more commits than the branch has diverged by. If the
branches share no history, compare against a ref they do share with `--base`.

### Too many style files

**Symptom.** `Found 1234 style files under <project>, more than the 1000 that nitpicker copies from the
merge base: run it from a narrower project folder`.

**Cause.** When a tool's `precedence` lists `"project"` (see
[your project's tool configs](usage.md#your-projects-tool-configs)), the Kotlin and Python presets read
the project's formatter and linter settings (`.editorconfig`, `ruff.toml`, `pyproject.toml`,
`setup.cfg`, `detekt.yml`, Gradle build files and similar) from the merge base, so that a change cannot
loosen them. nitpicker copies at most 1000 such files into a temporary folder, and the project folder
holds more, usually because it is the whole repository of a large monorepo.

**Fix.** Run nitpicker from the project's own folder rather than the repository root, so that only its
files count, or remove stray copies of those files, such as vendored dependencies.

## Runs, analyzers and caches

### Another run is in progress

**Symptom.** `nitpicker: another run is in progress in this project (pid 1234); wait for it to
finish.` Exit code 2. Or `Could not take the run lock <path>`.

**Cause.** Only one run can work in a project at a time, because the runs write the same report folder
and share temporary state. The first run writes its process id to
`.git/nitpicker-run-<hash>.lock`, or `.git/worktrees/<name>/nitpicker-run-<hash>.lock` in a linked
worktree (the path `git rev-parse --git-path` reports, so each worktree has its own lock). A second run that finds the lock held by a live process exits at once. A lock whose
process is gone is taken over automatically, so a crashed run does not block the next one.

**Fix.** Wait for the other run to finish, then run again. If no nitpicker run exists, the process id in
the lock now belongs to an unrelated process (this happens in containers, where process ids restart),
so delete the lock file (`nitpicker-run-*.lock` in that folder) and run again.
Separate checkouts and separate worktrees do not block each other.

### An analyzer times out

**Symptom.** `<analyzer> timed out after 300000 ms`, `<tool> timed out after 25 minutes`, `ESLint timed
out after ... ms` or `Gradle did not finish within 15 minutes`, or a tool error from Maven that says
it was stopped.

**Cause.** Every analyzer runs under a time budget, so a hung tool cannot block the run forever. The
default is 5 minutes for an analyzer; analyzers that run a whole build or a test suite have more (the
Python analyzer 30 minutes, Python mutation testing 70, a Gradle or Maven command 15 each). The usual
reasons are an overloaded machine (a CI runner shared with other jobs, several runs in parallel), a
test suite that waits on the network, or a project larger than the budget allows.

**Fix.**

- Run it again on an idle machine first, to rule out contention. `NITPICKER_MAX_PARALLEL` caps how
  many analyzers run at once, which helps on a small runner.
- Split the work: `--shard-count`/`--shard-index` over parallel jobs, followed by `nitpicker aggregate`,
  as described in [sharding](usage.md#sharding-in-ci).
- For Gradle, `NITPICKER_GRADLE_TIMEOUT_MINUTES` raises the budget (see
  [Gradle or Maven times out](#gradle-or-maven-times-out)). The budgets of the other analyzers are
  fixed.

### An analyzer crashes

**Symptom.** `<analyzer> crashed with exit 1: ...`, `crashed with signal SIGKILL`, `<analyzer> did not
produce valid JSON`, `<analyzer> exceeded the analyzer output limit`, `<analyzer> emitted a finding for
unexpected tool <tool>`, `Analyzer scheduler crashed with exit 1: ...`, `Analyzer scheduler returned
invalid JSON`, or `Hygiene check failed: ...` or `History check failed: ...`.

**Cause.** Analyzers run as child processes that report findings as JSON. This message means the
process died, was killed (an out-of-memory kill shows as `SIGKILL`), printed something that is not a
findings report, or printed too much. For a custom analyzer from the `analyzers` key, the cause is
usually the command itself: a non-zero exit, text on stdout besides the JSON, or findings that do not
match the finding schema (`tool` must equal the entry's `name`).

**Fix.** The message ends with the process's own output; start there. For an out-of-memory kill, give the
job more memory or run fewer analyzers at once with `NITPICKER_MAX_PARALLEL`. For a custom analyzer, run
its `command` in the checkout by hand and check that it prints only `{"findings": [...]}` and exits 0.
See [custom analyzers](usage.md#custom-analyzers). If a built-in analyzer crashes on a simple project,
please open an issue with the message and the project's tool versions.

### A stale or shared cache

**Symptom.** A finding appears or disappears between runs without a change that explains it, two
machines disagree about the base, or a result looks like the old configuration. With a remote cache:
`NITPICKER_CACHE_URL ignored: it must be an http(s) URL.` or
`NITPICKER_CACHE_AUTH_HEADER ignored: expected "Name: value".`

**Cause.** The base side of a comparison is cached per analyzer, keyed by the merge-base commit, the
project path, the analyzer name and version, the analyzer's configuration hash and the head policy. The
head side always runs. The key does not cover everything the base result depends on: project files that
only feed the head policy (for example a `tsconfig.json` changed on the head branch) and the versions of
the dependencies the project installed are not part of it. A cache directory shared between checkouts
with different dependencies, or a remote cache written by a job with another toolchain, can therefore
hand back a result that the current environment would not produce. Only clean reports are stored, so a failed analysis is never cached. A remote cache that
errors, times out (5 seconds per request by default) or returns a bad entry is treated as a miss, and
is not contacted again in that run, so it cannot change the result of the gate, only its speed.

**Fix.**

- Run once with `--no-cache` to see the uncached result. It reads and writes neither the local nor the
  remote cache.
- To clear the local cache, delete the directory: `node_modules/.cache/nitpicker`, or the folder
  `NITPICKER_CACHE_DIR` names (relative to the project root).
- Do not share `NITPICKER_CACHE_DIR` between checkouts that install different dependencies.
- For a remote cache, give pull request jobs read access only, and publish from one job on `main` with
  `nitpicker cache publish`. Check that `NITPICKER_CACHE_URL` starts with `http://` or `https://`, and
  that `NITPICKER_CACHE_AUTH_HEADER` is a whole header line such as `Authorization: Bearer <token>`.
  `NITPICKER_CACHE_TIMEOUT_MS` raises the 5 second request limit for a slow store.

### Cache publish fails

**Symptom.** `nitpicker cache publish requires NITPICKER_CACHE_URL`, or the command prints
`Not published: <analyzer> (analysis failed)` or `(upload failed)` and exits 2.

**Cause.** `nitpicker cache publish` analyzes the committed `HEAD` tree and uploads one entry per
analyzer to the remote cache, so later branches reuse them as their base. It exits 0 only when every
selected analyzer was uploaded. `analysis failed` means the analyzer had a tool error on that commit
(only clean reports are cached), `upload failed` means the store refused or did not answer: a missing
or wrong credential, a read-only token, a proxy that does not accept `PUT`, or the 5 second request
limit.

**Fix.** Set `NITPICKER_CACHE_URL` to the store's prefix (an entry is written with `PUT` to
`<url>/<key>.json`) and `NITPICKER_CACHE_AUTH_HEADER` to write credentials, in the one job that
publishes. For an analysis failure, run `nitpicker --all` on that commit to see the tool error. Publish
only on `main`; a pull request job does not need to write, and the gate never depends on the cache.

### Shard aggregation fails

**Symptom.** `Quality shard aggregation failed: ...` from `nitpicker aggregate`, for example
`Quality shard 2 could not read summary.json`, `Quality shard 1 expected analyzers ... but reported ...`,
`Quality shard 1 has stale policy for <analyzer>` or `Quality shard 1 head sha does not match shard 0`.
Exit code 2, and the combined report folder is left empty.

**Cause.** `nitpicker aggregate` checks that every shard ran the expected analyzers, on the same
commits, with the same configuration, before it merges them, and any mismatch is an error rather
than a partial result. The usual causes are a shard job that failed or was cancelled before it wrote
its reports, shards that were collected under the wrong folder names, shard jobs started from
different commits or with different config files, and a different `--shard-count` in the aggregate step
than in the shards.

**Fix.**

- Each shard's output must be in `<input-root>/<index>` for index 0 to count minus 1, as
  `npx nitpicker --shard-count 3 --shard-index "$INDEX" --defer-exit --output "shards/$INDEX"` writes it.
  Download all of them into one folder before the aggregate step.
- Run the aggregate step even when a shard job failed: `--defer-exit` makes the shards exit 0 so that
  their reports exist, and the aggregate step is the gate.
- Make every shard check out the same commit and use the same `nitpicker.config.json`, and pass the same
  `--shard-count` to `nitpicker aggregate`.
- Re-run the shard whose report is missing or stale.

### Fixers fail

**Symptom.** With `--fix`, the summary lists a tool error for `eslint-fix` or `prettier-fix`, and some
files are not fixed.

**Cause.** `--fix` runs ESLint and Prettier fixes on the changed files with nitpicker's own configs,
then runs the comparison. A fixer fails when the tool crashes or cannot process a file, for example
because of a syntax error. A failed fixer does not stop the other fixer or the comparison; it is a
tool error, so the run cannot exit 0.

**Fix.** Read the message for the file and the error, fix the file by hand and run `--fix` again.
Without `--fix`, the lint and format analyzers report the same files.

### A project tool config is missing or broken

**Symptom.** `"tools.pmd.precedence" lists "project" but <file> is missing`, `The mypy config <file>
could not be parsed`, `<file> is not valid TOML`, `"kotlin.detektConfig" is <path>, which does not
exist`, or the same for Checkstyle, ktlint, ktfmt, Prettier, ruff and pyright.

**Cause.** You opted in to your project's own config for a tool with
`"tools": { "<tool>": { "precedence": ["project", "nitpicker"] } }` (or set `kotlin.detektConfig`), and
the file nitpicker looks for does not exist in that snapshot or cannot be parsed. An opt-in with nothing
to read is an error rather than a silent fallback, because a missing config would otherwise make the
check weaker without notice. On the base snapshot a missing detekt config is ignored, so adding one in
your change is fine.

**Fix.** Create the file where the message says it searched, fix its syntax, or remove `"project"` from
that tool's `precedence`. See [your project's tool configs](usage.md#your-projects-tool-configs) for the
file names each tool reads.

## Policy changes

### A policy-loosened finding

**Symptom.** An enforceable `nitpicker-config/policy-loosened` finding on `nitpicker.config.json`. The
run exits 1. The console groups the loosenings by kind, says once what each kind does to the checks,
and prints the digest with `--accept-policy-change=<digest>` and
`NITPICKER_ACCEPT_POLICY_CHANGE=<digest>`; `report.txt` and `new-findings.json` keep one finding per
loosening.

**Cause.** The head controls its own `nitpicker.config.json`, so a change that checks less than the base
(an added `exclude` or exception that hides existing code, a removed source root, a raised threshold,
a disabled analyzer, a `precedence` that puts the project's own config first, and the other forms listed
under [Configuration](usage.md#configuration)) fails the run once per loosening instead of passing
quietly. It is a finding, not a tool error, so the exit code is 1.

**Fix.**

1. The allowed form is to keep the base's policy and change the code until it passes: put new code
   under the source roots, fix findings rather than excluding them, and remove the config edit.
2. If the loosening is intended, a person who reviews the change accepts it. At an interactive terminal,
   run `npx nitpicker --accept-policy-change=<digest>` with the digest from the finding. In CI, set
   `NITPICKER_ACCEPT_POLICY_CHANGE=<digest>` (the variable is read only when `CI` is set). A coding agent
   stops and asks that person.
3. The digest covers every loosening and the content of each file the findings name. Editing a named
   file, or adding another loosening, changes it and the finding returns with a new digest, so accept
   the final state of the change. A local run and CI can print different digests, because CI may
   check the pull request merged into its target branch: accept the digest of the run that fails.
4. `--accept-policy-change` is ignored when stdin and stdout are not both terminals, and
   `NITPICKER_ACCEPT_POLICY_CHANGE` is ignored when `CI` is unset. Stderr names the ignored acceptance
   and the run still fails.

## Tests

### Tests fail

**Symptom.** A tool error on `head` that lists the failing tests: `1 test fails, so coverage, CRAP and
mutation were skipped. Fix the tests and rerun:` with the rule `tests-failed` (or `tests-not-run` when a
test file could not even load) on TypeScript, JavaScript and Python, or `Tests fail in <project>; nitpicker needs a passing test suite for coverage and mutation
testing:` as the `gradle-failure` or `maven-failure` of Java and Kotlin. The analyzers that need the
tests (coverage, CRAP, console output, mutation testing) are skipped (`skipped (tests failed)`). Exit
code 2 when there is no new finding.

**Cause.** Coverage, CRAP and mutation testing need the project's own test suite to pass, because
their results come from running it. The suite failed on your checkout (a failing test, a test file
that cannot be imported, a runner that cannot start), so nothing derived from it can be trusted.

**Fix.** Run the project's tests the way nitpicker does and fix the failure: for TypeScript and
JavaScript, the runner's own command with coverage (`vitest run --coverage`, `jest --coverage`); for
Python, the project's test runner under `coverage run`; for Java and Kotlin, `./gradlew test` or
`mvn test`. The message shows the first failures, with the runner's output.

### Tests fail on the base

**Symptom.** A note, not a tool error: `Tests fail on the base:` (or `Tests fail on the base in
<module>:`) followed by the failing tests, or `mutation skipped: the base commit fails its own tests, so
its mutants are unknown there`. A base whose tests did not run is a tool error labeled `base`: a
`tests-not-run` error such as `vitest exited 1 without naming a failing test` or `without a readable
test report` on TypeScript, JavaScript and Python, or the `gradle-failure` or `maven-failure` of Java
and Kotlin.

**Cause.** The base is red: its tests ran and at least one named test failed. The results that need
passing tests (coverage, CRAP, mutation testing, slow tests, test console output) are unknown on the
base, so a finding of those checks on the head counts as new only in a file your change adds or on a
line it adds, edits or deletes from. When the base tests did not run at all (a load, collection or
compile failure, a non-zero exit that names no test, a timeout), there is nothing to compare with.

**Fix.** A red base does not block your change, but a finding of those checks in code you edit still
fails, because there is no base result to hold it against: test that code or split it. A change that
removes tests gets no help from the red base, and a `tests-removed` note says so. When the base tests
did not run, rebase or merge the base branch once it is green, or compare against a passing ref with
`--base <ref>`; if the failure is flaky, rerun. `nitpicker --all` has no baseline. See
[A base whose tests fail](usage.md#a-base-whose-tests-fail).

### The test runner ran no tests

**Symptom.** `vitest ran no tests, but nitpicker sees test files such as src/a.test.ts. Make the
project's vitest config find them, or set "tools.tests.runner" in nitpicker.config.json to the runner
they are written for.`

**Cause.** nitpicker found files that look like tests, but the runner it chose ran none. Either the
runner's config (`include`, `testMatch`, `testRegex`, a Vitest workspace or projects list) does not
match those files, or nitpicker picked a different runner than the one the files are written for. The
runner is decided from `tools.tests.runner` in the config, else the project's `test` scripts, else a
`vitest.config`, `jest.config` or `.mocharc` file, else the installed packages, else Vitest.

**Fix.** Make the project's runner config match the test files, or set the runner:
`{"tools": {"tests": {"runner": "jest"}}}` (`vitest`, `jest`, `mocha` or `node` for `node:test`).

### The base does not type check

**Symptom.** `mutation skipped: the base commit does not type-check, so its mutants cannot be compared.
Fix the base first; a missing @types/node is the usual cause.`

**Cause.** Mutation testing runs Stryker's TypeScript checker on both snapshots. On the base it failed
the dry-run compile, so the base's mutants cannot be compared with yours. The base is often
type-correct only with the dependencies of the head, and a missing `@types/node` is the usual cause.
The head variant of the message (`the project does not type-check under the mutation checker
configuration`) says the head failed instead; the `typescript-typecheck` findings show what.

**Fix.** For the head, make the project type check under its own `tsconfig`; declare `@types/node` (and
any other `@types/*` package the code needs) as dev dependencies. The base is a past commit, so a fix
on the head applies to later bases only: rebase onto a base that type checks, or pass `--base <ref>`.

### A test runner is not installed

**Symptom.** `The test script runs "react-scripts test", but react-scripts is not installed in <dir>`,
the same for `craco`, or `Mocha is not installed in <dir>, so its tests cannot be mutated.`

**Cause.** The runner nitpicker found in the project's `test` script is not in the project's
`node_modules`: the dependencies are not installed, or the script names a launcher the project does
not depend on.

**Fix.** Install the project's dependencies before running nitpicker, or set `tools.tests.runner` to
the runner your tests use.

### Jest collects no coverage

**Symptom.** `Jest collected no coverage for the project's source files, such as src/a.ts. Jest only
instruments files inside the rootDir of the config that runs the test (the global rootDir is <dir>).`

**Cause.** Jest reports coverage only for files under the `rootDir` of the configuration that runs the
tests. A `rootDir` that points at a sub-folder, a `projects` list whose entries use their own
`rootDir`, or a config in another package leaves the project's sources outside every instrumented root.

**Fix.** Make the Jest config, or each of its `projects`, use a `rootDir` that contains the source
files (`rootDir: '.'` at the project root is the usual choice).

### Test timeouts need Vitest

**Symptom.** `This test runner cannot set hook deadlines. Use Vitest for configured hook timeouts.` or
`This test runner uses one test and hook deadline. Use Vitest for projects with different timeout
scopes.`

**Cause.** `tools.tests.timeouts` sets test and hook deadlines per project and language
([test timeout tiers](usage.md#test-timeout-tiers)). Only Vitest can apply different deadlines to
different files, or a separate hook deadline. The other runners take one deadline for the whole run.

**Fix.** With Jest, Mocha or `node:test`, use the same `testTimeoutMs` for every tier the selected test
files fall in, and no separate `hookTimeoutMs` (or the same value), or run the tests with Vitest.

## TypeScript and JavaScript

### A peer tool is missing

**Symptom.** `Required tool vitest is not installed from <dir>. Install vitest ^4.1.11 || ^5.0.0 as a
dev dependency of the project.`; the same for `jest`, `mocha`, `@vitest/coverage-v8`, `@types/node` or
`typescript` (`Install typescript >=5.7 as a dev dependency`); `vite is not installed at or above <dir>` or
`vite could not be resolved from the project`; or `Cannot find package 'vitest' imported from <file>`
(Node's `ERR_MODULE_NOT_FOUND`) when `node_modules` exists but does not have the package.

**Cause.** nitpicker ships its own ESLint, Prettier, dependency-cruiser, knip, jscpd and Stryker, but it
uses the project's test runner, coverage provider and TypeScript so that the results match the
project. Those are peer dependencies, and the one the tool needs is not installed in the project.
TypeScript 7 is supported: nitpicker reads its sources with a bundled JavaScript API and type checks
with the project's own compiler.

**Fix.** Install what the message names as a dev dependency of the project, in the version range it
shows: `npm install --save-dev vitest @vitest/coverage-v8 typescript @types/node` is the usual set (add
`jest` or `mocha` if that is your runner). See [Install](usage.md#install).

### Dependencies are not installed

**Symptom.** `Dependencies are not installed: <dir>/node_modules is missing. Run `npm install` in
<dir> first.`

**Cause.** The head checkout has no `node_modules` folder, so nothing can run in it. A fresh clone or
a CI job that skipped the install step looks like this.

**Fix.** Run the package manager's install in the folder the message names (the project folder, or the
workspace root when the project is a workspace member). In CI, add the install step before nitpicker.

### Installing the base dependencies fails

**Symptom.** `Failed to install merge-base dependencies with npm: ...` followed by the package manager's
own output.

**Cause.** When the base's `package.json`, lockfile or package manager config differs from the head's,
the base cannot share your `node_modules` and gets its own frozen install, with scripts disabled
(`npm ci --ignore-scripts` and the equivalents for pnpm, Yarn and Bun). It failed: the lockfile does not
match its `package.json` on the base, the registry is unreachable or needs credentials, the install ran
out of its 4 minute budget (`timed out after 4 minutes`), or it printed more output than nitpicker
keeps. Nothing from your checkout is installed on the base.

**Fix.** Read the package manager's message after the colon. A lockfile mismatch or an unknown version
is a problem of the base commit; registry, proxy and credential settings are those of your environment
and of the base's own `.npmrc`. No install is needed when the base's `package.json`, lockfile and
manager config equal the head's, as they do after a rebase onto the base branch when your change does
not touch dependencies. See [dependencies of the base](usage.md#what-it-compares).

### The package manager is not installed

**Symptom.** `Failed to install merge-base dependencies: this project uses pnpm, which is not
installed.` followed by how to install it, such as `npm install --global corepack && corepack enable
pnpm` or `npm install --global pnpm` (or the Yarn and Bun equivalents).

**Cause.** The base needs its own install and the manager it uses (the `packageManager` field of the
base's `package.json`, else its lockfile) is not on the `PATH`. Node.js 25 and newer no longer bundle
Corepack, so `corepack enable` needs Corepack installed first.

**Fix.** Install the manager the message names with the command it shows.

### Unsupported Yarn setup

**Symptom.** `Dependencies are not installed: .../node_modules is missing. Yarn Plug'n'Play is not
supported: set `nodeLinker: node-modules` in .yarnrc.yml`, `the install created no node_modules folder`,
or `Failed to install merge-base dependencies: the base's .yarnrc.yml lists Yarn plugins, which are
JavaScript files that Yarn runs during an install, and nitpicker does not run repository code there`.

**Cause.** nitpicker reads and runs tools from `node_modules`, so a Yarn Berry project that uses
Plug'n'Play (no `node_modules`) cannot be analyzed. A base whose `.yarnrc.yml` lists `plugins` is
refused too, because Yarn would run the repository's own code during the install.

**Fix.** Set `nodeLinker: node-modules` in `.yarnrc.yml` and run `yarn install`. For plugins, remove
them from the base, or make the base's `package.json` and lockfile equal to the head's so that no
install is needed.

### The lint or type-check engine cannot run

**Symptom.** `The type-aware lint rules need @oxlint-tsgolint/linux-x64, which is not installed`, or a
lint or type-check failure that ends with `Set "tools": { "eslint": { "engine": "eslint" } } in
nitpicker.config.json to lint with ESLint instead.` or `... "typescript": { "engine": "project" } ...`.
Also `TypeScript 7 type check failed: ...`.

**Cause.** By default the lint analyzers run on oxlint and the type check on the native TypeScript 7
compiler, both of which ship a platform-specific binary as an optional dependency. The binary for your
operating system and CPU is not installed (an install with `--no-optional`, `npm install` on a different
platform than the one that runs nitpicker, or a lockfile written elsewhere), or the engine failed on
the project.

**Fix.** Reinstall nitpicker's dependencies on the machine that runs it (and without
`--omit=optional`). Or choose the other engine in `nitpicker.config.json`:

- for lint, `{"tools": {"eslint": {"engine": "eslint"}}}`;
- for the type check, `{"tools": {"typescript": {"engine": "project"}}}`.

Switching engines reports the differences between them as new once; see
[Lint engine](usage.md#lint-engine).

### The TypeScript config cannot be read

**Symptom.** `The TypeScript config could not be read: ...` or a TypeScript diagnostic such as
`error TS5083: Cannot read file '.../tsconfig.json'` or `error TS5057`.

**Cause.** The `tsconfig.json` (or the file `tools.typescript.project` names, or one of the files it
`extends`) is missing, is not valid JSON with comments, or names an option TypeScript rejects.

**Fix.** Fix the config the diagnostic names. `npx tsc --noEmit -p <config>` shows the same error.
If you set `tools.typescript.project`, the path is relative to the project root and must be a JSON
file inside the project. See [TypeScript project config](usage.md#typescript-project-config).

### Mutation testing is skipped for this runner

**Symptom.** `mutation skipped: Stryker's Mocha runner (@stryker-mutator/mocha-runner 10) supports Mocha
up to 11, and this project uses Mocha 12. Coverage and CRAP still run; use Mocha 11 to get mutation
testing.` Mutation testing is skipped and the run cannot exit 0.

**Cause.** Mutation testing runs through a Stryker runner for each test runner, and the Mocha runner
supports Mocha up to the version the message names.

**Fix.** Use a Mocha version it supports, or turn mutation testing off for the project with
`"disable": ["mutation"]`.

### A TypeScript or JavaScript tool fails

**Symptom.** A tool error of a TypeScript or JavaScript analyzer that starts with
`Quality area adapter failed:`, `Static quality adapter failed:`, `ESLint differential adapter
failed:` or `Entry-point differential adapter failed:`, such as `prettier exited with 2: ...`,
`ESLint exited with 2: ...`, `vitest exited 1 without naming a failing test` or `jest exited 1
without a readable test report: ...`. The tools are ESLint, Prettier, `tsc`, dependency-cruiser,
knip, jscpd, Stryker and the test runner.

**Cause.** A tool exited with a status that is neither success nor "findings found", so there is no
usable result. Typical reasons are a project config the tool rejects (a broken ESLint, Prettier,
Jest or Vitest config, or a `tsconfig.json` with an unknown option), a file the tool cannot parse,
a test runner that crashed before it wrote its report (a setup file that throws, a worker that ran
out of memory), or a tool version that does not match the config.

**Fix.** The message ends with the tool's own output: run the same tool in the project
(`npx prettier --check .`, `npx eslint .`, `npx tsc --noEmit`, the project's test command with
coverage) and fix what it reports. When only nitpicker fails, rerun the analyzer alone with
`--analyzer <name>` to see its full output in `reports/quality/diff/tool-errors.json`. When the
tool timed out, see [An analyzer times out](#an-analyzer-times-out).

## Python

### The Python environment cannot be found

**Symptom.** `uv has no environment at <dir>/.venv: run \`uv sync\` first`, `poetry has no environment for
<dir>: run \`poetry install\` first`, `pipenv has no virtualenv for <dir>`, `hatch has no environment
for <dir>`, `hatch has not created its environment at <dir>`, `conda has no environment named <name>`,
`No conda environment at <dir>`, `No Python environment at <dir> (<dir>/bin does not exist): create it,
or set "python.environment"`, `No <kind> environment found for <dir>`, `poetry is not installed, so its
environment for <dir> cannot be found`, or `poetry could not run for <dir>` (or pipenv, hatch or conda). The tool error has the
rule `environment-failed`.

**Cause.** The Python tools run inside the environment your project already has, detected from its
files in a fixed order (`python.environment` first, then `uv.lock`, `poetry.lock`, a `Pipfile`, hatch,
conda, a `.venv/` directory, and finally the `PATH`). nitpicker never creates or syncs your
environment. The environment its detection picked does not exist yet, or its manager is not installed.

**Fix.** Create the environment the way your project does (`uv sync`, `poetry install`,
`pipenv install --dev`, `hatch env create`, or `python -m venv .venv`), in CI before nitpicker runs.
Or point nitpicker at an environment with `python.environment` in `nitpicker.config.json`: `uv`, `poetry`,
`pipenv`, `hatch`, `conda`, `path` (the tools on the `PATH`), or a virtualenv directory. See
[the project's own environment](python-preset.md#the-projects-own-environment).

### A Python tool is missing

**Symptom.** `ruff was not found in the uv environment: install it there (for example as a dev
dependency), or set "python.environment" to the environment that has it`, and the same for `coverage`,
`mypy`, `pyright`, `pytest`, `mutmut` or `black`. For the test runner:
`pytest is used by this project but cannot be imported in the <name> environment`,
`<runner> runs the tests of this project but is not installed in the <name> environment`, or
`the tests run with Django's manage.py test, but there is no manage.py at <path>`.

**Cause.** The environment was found, but a tool nitpicker needs is not in it and not on the `PATH`.
`coverage`, the type checker and the test runner must be in the project's environment because they
import its code; `mutmut` and `pytest` are needed for mutation testing.

**Fix.** Add the tool as a dev dependency and install (`uv add --dev coverage`, `poetry add --group dev
coverage`, `pip install coverage`). Or set `python.environment` to an environment that has it. If you
do not want mutation testing, `"disable": ["mutation"]` removes the need for `mutmut`. When the runner
nitpicker detected is not the one the tests use, set `python.testRunner` (`pytest`, `unittest`,
`django` or `nose2`); a Django project needs its `manage.py` at the project root or one folder below.

### The base needs its own Python environment

**Symptom.** `uv sync --frozen --no-install-project --no-install-workspace failed for the base snapshot
<dir> (exit 1): ...`, `uv is not installed` with the reason `the base snapshot has other dependencies than
the head, so it needs an environment of its own`, or `<lock> of the base installs local packages, whose setup code
the base environment must not run`. The rule is `environment-failed` on `base`.

**Cause.** When the dependency files of the base differ from the head's (a lock file, `requirements*.txt`
or the dependency tables of `pyproject.toml`), the base would import head's packages, so nitpicker builds
a separate `.venv` in the base's work tree with the project's own tool (`uv`, `poetry`, `pdm`, `pipenv`,
or `pip` for requirements files). That install failed: the tool is missing, the packages cannot be
downloaded or built, or the lock file installs local or editable packages, which nitpicker will not run
because their setup code is the repository's.

**Fix.** Read the command's output after the colon. Install the tool the message names, or make the
packages installable on the base. If the base installs local packages, create an environment of your own
and point `python.environment` at it: the base then uses it as it is. If the dependency files are the
same on both sides, no base install happens, so rebasing onto the latest main avoids it.

### A Python tool fails

**Symptom.** A tool error of the `python` analyzer such as `ruff check exited 2 in the uv environment:
...`, `coverage ... exited 1`, `mypy ...`, with a rule like `ruff-failed`, `format-failed`, `types-failed`,
`coverage-failed`, `rules-failed` or `structure-failed`.

**Cause.** A tool exited with a status that is neither success nor "findings found", so there is no
usable result. Typical reasons are a config the tool rejects (an unknown option, a TOML error in
`pyproject.toml`, a pyright or mypy configuration error), a tool version that is too old for the config,
or an import error while the type checker or the test runner loads the project.

**Fix.** The message ends with the tool's own output: run the same tool in the project's environment
and fix what it reports. `python.typeChecker`, `python.formatter` and `python.testRunner` choose a
tool when detection picks the wrong one. When the tool is timed out, see
[An analyzer times out](#an-analyzer-times-out).

### mutmut fails

**Symptom.** A tool error of the `mutation` analyzer with the rule `mutation-failed`: `mutmut was not
found in the uv environment`, `mutmut 2.5.1 is not supported`, `mutmut run exited 1 in the uv environment`, or
`failed to collect stats` followed by a hint about `also_copy`.

**Cause.** Mutation testing runs mutmut 3.x after the `python` analyzer, with pytest. It needs the
`mutmut` package in the project's environment and a project whose tests pass, and it is skipped when
the `python` analyzer had a tool error. mutmut works on a copy of the sources, so tests that read
files outside the source roots fail there while they pass in a normal run.

**Fix.** Install `mutmut` 3.x and `pytest` in the project's environment (a Django project also needs
`pytest-django`) and check that the tests pass on their own. List the files the tests read outside the
sources under `also_copy` in `[tool.mutmut]` of `pyproject.toml`. If mutation testing is not wanted,
set `"disable": ["mutation"]`. On native Windows mutmut does not run; see
[Windows and WSL](#windows-and-wsl). See also
[mutation testing for Python](python-preset.md#slice-6-mutation-testing).

## Java and Kotlin

### The Gradle build fails

**Symptom.** A `gradle-failure` tool error of the `java` (or `kotlin`) analyzer holding the build's
diagnostic output, up to 4000 characters, on `base` or `head`. Exit code 2 when there are no new
findings.

**Cause.** nitpicker runs the build through an init script, and the build failed on that snapshot. Common
reasons: a compile error, a missing dependency or repository, a Gradle or JDK version the build does not
support, a plugin that needs a network the runner does not have, or a failing test (see
[Tests fail](#tests-fail)).

**Fix.** The output holds the cause. Run the project's own build and tests (`./gradlew build`,
`./gradlew test`) on that commit; if the same error shows, fix the project. On `base`, the commit is
the merge base, so check it out to reproduce. A runner without network access needs the Gradle
distribution that the snapshot's `gradle-wrapper.properties` names, and the dependencies, in its cache.
If the build passes by itself and only fails under nitpicker, open an issue with the output.

### The Maven build fails

**Symptom.** A `maven-failure` tool error of the `java` analyzer holding Maven's `[ERROR]` lines (up to
4000 characters) on `base` or `head`, possibly with `nitpicker needs Maven 3.6.3 or newer`, or
`The kotlin preset needs a Gradle build, and this project builds with Maven`.

**Cause.** The same as for Gradle: the Maven build failed on that snapshot, one module at a time. A
surefire or Failsafe configuration with `<testFailureIgnore>false</testFailureIgnore>`, or a
`jacoco:check` with `<haltOnFailure>true</haltOnFailure>`, makes a violated rule stop the build. A
multi-module build that depends on a `test-jar` of another module cannot resolve it in the `test` phase.
Maven older than 3.6.3 is not supported, and the `kotlin` preset runs on Gradle builds only.

**Fix.** Run `mvn test` (or `./mvnw test`) in the project at that commit and fix the error it
reports. Upgrade Maven if it is older than 3.6.3. For a Maven project with Kotlin sources, use
`"preset": "java"`, which checks its Java sources. For a failing test, see [Tests fail](#tests-fail).

### Gradle, Maven or Java is not found

**Symptom.** `gradlew was not found. Add the Gradle wrapper (gradlew) to the project, put gradle on the
PATH, or set NITPICKER_GRADLE`, `mvn was not found. Add the Maven wrapper (mvnw) to the project, put
mvn on the PATH, or set NITPICKER_MAVEN`, or `java not found (java): set JAVA_HOME to a JDK, or put its
bin directory on the PATH`.

**Cause.** nitpicker runs the project's wrapper when it has one (`gradlew`, `mvnw`; run with `sh` when it
is not executable), else `gradle` or `mvn` from the `PATH`, and the JDK tools from `JAVA_HOME` or the
`PATH`. None was found. A wrapper is looked up in each snapshot, so a base that predates the wrapper
has none even when the head does.

**Fix.** Commit the wrapper, install Gradle or Maven on the machine, or set `NITPICKER_GRADLE` or
`NITPICKER_MAVEN` to the command to run. Install a JDK (the Java preset needs Java 21) and set
`JAVA_HOME` or put it on the `PATH`. When only the base lacks a wrapper, rebasing onto a base with the
wrapper helps.

### Gradle or Maven times out

**Symptom.** `Gradle did not finish within 15 minutes and was stopped. Set NITPICKER_GRADLE_TIMEOUT_MINUTES
to allow more time`, `Maven did not finish in <dir> within 15 minutes and was stopped`, or
`NITPICKER_GRADLE_TIMEOUT_MINUTES must be a whole number from 1 to 17895 (minutes)`.

**Cause.** Each Gradle command has a 15 minute budget (two commands per analyzer, the optional
Checkstyle export and the analysis), and each Maven command 15 minutes. A cold Gradle cache, a wrapper
that is downloading a distribution, a large test suite, or mutation testing with PIT exceed it. Maven's
message warns that its post-integration-test steps may not have run, so containers or servers the build
started may still be running.

**Fix.** Set `NITPICKER_GRADLE_TIMEOUT_MINUTES` to a positive whole number of minutes, for example
`NITPICKER_GRADLE_TIMEOUT_MINUTES=45 npx nitpicker`. It applies to base and head alike, and empty
values, fractions, units such as `45m` and numbers above 17895 are refused. Warm the Gradle cache in CI
and run on a faster runner. Maven's budget is fixed; check for and stop leftover containers or servers
after a Maven timeout.

### Error Prone cannot find a JDK

**Symptom.** `Error Prone needs at least JDK 21 (JDK 21 or newer, and at least the project's own JDK),
and java is JDK 17. nitpicker found no such JDK in JAVA_HOME, the JAVA_HOME_<N>_X64 variables,
~/.m2/toolchains.xml, SDKMAN, /usr/lib/jvm or /Library/Java/JavaVirtualMachines.`

**Cause.** On Maven, the Error Prone and NullAway compile runs on a JDK 21 or newer, and one that is at
least as new as the project's own JDK, while the project keeps compiling for its own release. The JDK
Maven runs on is older, and no suitable one is installed in the places nitpicker looks.
(`--enable-preview` projects need exactly the project's JDK.)

**Fix.** Install a JDK 21 or newer on the runner, in a place from the message: set `JAVA_HOME_21_X64`
(hosted CI images set it), add a `jdkHome` entry in `~/.m2/toolchains.xml`, or install it with SDKMAN or
the system package. Or run Maven itself on JDK 21. On Gradle, the toolchain service finds or downloads
the JDK.

## Platforms

### Windows and WSL

**Symptom.** `Failed to install merge-base dependencies: installing the base dependencies is not
supported on native Windows`, or a Python mutation run that reports `mutation-skipped` and says it
needs WSL.

**Cause.** nitpicker is developed and tested on Linux (its continuous integration runs on Ubuntu), and
some steps do not work on native Windows:

- Installing the base's dependencies runs the package managers' `.cmd` shims, which Node.js refuses to
  start without a shell, so a base that needs its own install fails.
- mutmut forks processes, so Python mutation testing does not run on native Windows; the analyzer
  reports a skipped finding.

**Fix.** Run nitpicker inside WSL (Windows Subsystem for Linux), with the repository in the Linux file
system (`~/project`, not `/mnt/c/...`, for speed and correct file modes). Install Node.js, Git and the
project's toolchains inside WSL. The base install is the only TypeScript step that refuses to run on
Windows, and it happens only when the base's `package.json`, lockfile or manager config differ from the
head's.
