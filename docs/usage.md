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

Requirements: Node.js 22.14 or newer, a Git repository, and a project whose dependencies are
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
  adds or edits on the head side, so every surviving mutant it reports is new. Python's mutmut
  works per function, not per line: head reuses the base results for the modules the change did
  not edit and that import no edited module, and runs every other mutant (all of them when a test
  or any other file changed). Only mutants that are new on head fail, whichever way the results
  were obtained. `--all` mutates every source file.

The base ref is the first match of:

1. `--base <ref>`
2. the pull request target branch from CI (`CHANGE_TARGET`, `GITHUB_BASE_REF` or
   `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`)
3. `base` in `nitpicker.config.json` (not `HEAD`, the branch you are on, or its commit)
4. the remote's default branch (`refs/remotes/<remote>/HEAD`, using `upstream` if it exists and
   `origin` otherwise)
5. `origin/main`, then `origin/master`

In CI, fetch enough history to contain the merge base (for example `fetch-depth: 0`).

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

Reports are written to `reports/quality/diff/` (`reports/quality/snapshot/` for `--all`):
`report.txt`, `report.junit.xml`, `summary.json`, `new-findings.json`, `resolved-findings.json`,
`changed-metrics.json` and `tool-errors.json`. The summary records every config override, a
policy hash, the `policyChanges` the head config makes against the base and any `notices`. A notice
is information that never fails the run. Today there is one: changed TypeScript files that lie
outside `layout.sourceRoots` and `layout.testRoots` (move them under a root or add their folder to
`layout.sourceRoots`; to leave them unchecked, list them in `exclude`). Choose another directory
with `--output <dir>`. Set `NO_COLOR` to disable colored console output.

## Exit codes

| Code | Meaning                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 0    | Completed with no new enforceable findings.                                                                      |
| 1    | At least one new enforceable finding (`--all`: any violation), even if a tool also errored.                      |
| 2    | A tool error and no new enforceable findings, invalid arguments, invalid config, or any other failure to decide. |

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
```

- `--all`: report every finding in the current checkout, with no baseline. Exits 1 on any violation.
  Cannot be combined with `--base`, `--fix`, sharding or `--defer-exit`.
- `--fix`: apply ESLint and Prettier fixes to the changed files in your checkout, using the gate's
  own configs, then run the comparison. A fixer that fails is reported as a tool error; the other
  fixer and the comparison still run. Cannot be combined with `--all`.
- `--base <ref>`: the ref to compare against.
- `--analyzer <name>`: run only this analyzer (repeatable). Cannot be combined with sharding.
- `--rule <substring>`: list the findings whose rule matches, after the summary (repeatable).
- `--output <dir>`: where reports go.

- `--no-cache`: do not read or write the findings cache for this run (local and remote).
- `--accept-policy-change=<digest>`: accept the loosenings of `nitpicker.config.json` whose digest
  the `nitpicker-config/policy-loosened` findings name (see [Configuration](#configuration)). It is
  for the person reviewing the change, never for a coding agent, so it is honoured only at an
  interactive terminal (stdin and stdout both terminals); in CI, where `CI` is set, a person sets
  `NITPICKER_ACCEPT_POLICY_CHANGE=<digest>` instead, and that variable is ignored anywhere else. An
  ignored acceptance is named on stderr and the run still fails. The digest covers every loosening
  in full and the content (git blob id) of each file it names, and `summary.json` records it as
  `policyDigest`: editing a named file or adding a loosening changes it and fails again.
- `nitpicker cache publish`: analyze the committed `HEAD` tree and upload its findings to the remote
  cache so later branches reuse them as their base. Requires `NITPICKER_CACHE_URL`; exits 0 when
  everything was uploaded and 2 otherwise.

### Findings cache

The base side of a comparison is cached per analyzer; the head side always runs. The key covers the
merge-base commit, project path, analyzer name and version, the analyzer's configuration hash, the
config-file overrides and the head policy (`exclude`, `layout`, `exceptions`, `thresholds`, `react`, `i18n`, `testConsole`) with the
legacy inventory path, so changing any of them is a miss. Only clean reports are stored.

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
`disable`, `exceptions` or `python.exceptions` entry the head drops is dropped; and each threshold
is the lower of the two sides. Code that was already there stays baselined when a change brings it
under the gate or tightens the policy. A finding is new only if the change added it. With no config on the base, or an identical one, the head's config applies to
both sides; a base config that does not load is ignored the same way, and the head's config is then
compared with the defaults. Because the head controls its own config, every change to it is printed
in the console summary and in `report.txt` as "Policy changed in this change" and listed in
`summary.json` under `policyChanges`. A change that checks less fails the run with one
`nitpicker-config/policy-loosened` finding per loosening. The finding names the allowed form first:
keep the base's policy and change the code until it passes (new code under the source roots, findings
fixed rather than excluded, excepted or reclassified). If the change is intended, a coding agent
stops and asks a person reviewing the change, who accepts it with the `--accept-policy-change=<digest>`
the finding names (in CI, `NITPICKER_ACCEPT_POLICY_CHANGE=<digest>`). A project's first `nitpicker.config.json` is compared with the
defaults. These changes are loosening:

- an added `exclude`, `layout.excludedGlobs`, `layout.entryPoints`, `exceptions` or
  `python.exceptions` glob that covers a code file the base config did not already cover (every
  tracked code file of the preset, wherever it is: `.ts`/`.js` family files for TypeScript and
  JavaScript, `.py` files for Python, `.java`, `.kt` and `.kts` files for Java and Kotlin, so
  excluding a folder outside the roots that production code imports is loosening too). `exclude`
  and `layout.excludedGlobs` are one set: a glob respelled to cover the same files, or moved from
  one key to the other, is listed but does not fail. Files moved with `git mv` keep their base
  path, so updating a glob after a move is not loosening; a glob that covers no new code file is
  listed but does not fail;
- a removed `layout.sourceRoots`, `layout.testRoots` or `python.sourceRoots` entry that still has
  checked files under it (Python's detected default counts when the setting is absent), and an
  added `layout.testRoots` entry that turns production code the base checked into test code;
- a code file the change adds or moves to a path the head hides, decided per file: by `exclude`
  and `layout.excludedGlobs` (one set), by the exception paths of one rule (`exceptions`,
  `python.exceptions`), or by a test root inside a source root. It passes only when the base config
  hid the same path in the same set and a base glob or root that hid it there already covered
  code of the base (an established `vendor/**` or `**/fixtures/**`): otherwise an idle glob is
  listed when it is added, and the code that later arrives under it fails then, however the glob
  is spelled. Even under an established exclusion or test root the file fails when production code
  reaches it: imports from files under the source roots that are neither tests nor hidden, followed
  through other hidden files (a barrel re-exporting a new file), plus the `main`, `bin` and
  `exports` targets of any `package.json` and the `layout.entryPoints` files. So a feature cannot be
  written under an excluded folder and used from the checked code. Exceptions under an established
  glob do not fail on imports, because the file is still checked by every other rule, and the
  import walk reads TypeScript and JavaScript only, so under the Python, Java and Kotlin presets an
  established glob does not fail;
- a `tsconfig.json` removed, or `checkJs` turned off in any of the project's tsconfig files (the root
  one, per-package ones and the configs they reference), with the TypeScript preset;
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
  `"nitpicker"` (for `pmd`, which runs both rule sets, only dropping `"nitpicker"` counts).

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

| Key               | Type                                                               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`            | string                                                             | Base ref used when neither `--base` nor a CI target branch is given. It must not follow the commit you are on: `HEAD`, `@`, an expression that resolves through them (`HEAD~0`, `@{0}`), the branch you are on, or a SHA equal to `HEAD` is a config error, because the change would be compared with itself. Another branch such as `origin/main` is accepted even when it points at the commit you are on, so uncommitted work on an up-to-date branch is still checked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `preset`          | `"typescript"`, `"javascript"`, `"java"`, `"kotlin"` or `"python"` | The preset; default `typescript`. `javascript` gates a plain JavaScript project; see [JavaScript preset](#javascript-preset). `java` and `kotlin` gate a Gradle project and `python` a Python project; none of them is auto-detected. Without `preset`, a project whose source roots hold no TypeScript or JavaScript but that has `pom.xml`, `build.gradle(.kts)` or `settings.gradle(.kts)` (Java, or Kotlin when `.kt` files outnumber `.java`), or `pyproject.toml`, `setup.py` or `setup.cfg` (Python), stops with a config error (exit 2) naming the preset to set. The check is best-effort: files under `resources`, `static`, `public`, `assets`, `webapp` or `wwwroot` folders and `*.min.js` files are bundled assets and do not count as TypeScript or JavaScript; see [Java preset](#java-preset), [Kotlin preset](#kotlin-preset) and [Python preset](#python-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `disable`         | string[]                                                           | Analyzer names to turn off, without duplicates. An unknown name is an error. Disabling an analyzer also turns off every analyzer that depends on it, and a note on stderr names them (`coverage` is needed by `crap` and `test-console`, so `"disable": ["coverage"]` turns off all three; a config written before `test-console` existed keeps working).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `thresholds`      | object                                                             | `crapLimit`: a positive number. A function whose CRAP score is at or above it is a finding. The default is 9. TypeScript, JavaScript, Java, Kotlin and Python. Whole numbers for the file limits: `fileLines` (lines per source file, default 300), `testFileLines` (per test file, default 500), `lineLength` (characters per line, default 120; imports, URLs and the text inside string literals are not counted) and `folderFiles` (source files, and separately test files, directly in one folder, default 6; only code files of the language count, so config and asset folders are never checked, and test files under a `fixtures` folder are skipped). A file or folder already over a limit on the base fails only when it grows, and a folder moved to a new path is matched to its old path. Every preset, except `lineLength` with Java and Kotlin, where setting it is a config error: nitpicker checks the `.java` files at the width of the Java formatter (100 for google-java-format, 120 for palantir-java-format) or at the width of the project's Checkstyle `LineLength`, and a `java.lineLength` convention pins any width from 10 to 999 (text blocks are not counted), and detekt's `MaxLineLength` checks the Kotlin files. Java and Kotlin only: `unitTestSeconds` (default 5) and `integrationTestSeconds` (default 30), the seconds one test the change adds or edits may take (see [slow tests](java-preset.md#slow-tests)); with another preset they are a config error. Generated sources a build registers (Java, Kotlin) belong in `exclude`. The size thresholds are below the table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `exclude`         | string[]                                                           | Globs relative to the project root (`**`, `*`, `?`, `{a,b}`), added to the built-in exclusions: the project-root folders `dist`, `build`, `generated`, `coverage`, `reports` and `target`, and `node_modules` at any depth (a folder such as `src/build/` is analysed). Generated code needs no `exclude`: a file named like generated code (`*.gen.*`, `*.generated.*`, `*.pb.*`, `*_pb.*`, under `__generated__/`) or a tracked code file in one of those root folders counts as generated, skipped by the layout checks and importable from the source roots, when one of its first five lines carries a generator marker such as `// @generated`; any code file counts when its leading comments carry the exact header a known generator writes (OpenAPI Generator's `auto generated by OpenAPI Generator (https://openapi-generator.tech)`, protoc's, Thrift's, or `// Code generated by <tool>. DO NOT EDIT.`). That marker is the allowed form for generated code; without it the file is checked like any other. Hand-written `*.d.ts` files under the source roots are linted, and the type check reads their declarations, but it runs with `skipLibCheck`, so it reports no errors inside any `.d.ts` file; coverage, CRAP and mutation skip them. Excluded files are skipped by every analyzer and are absent from the dependency graph. With the Java and Python presets the built-in list does not apply and findings whose path matches a glob are dropped (Python also keeps those files away from ruff and black).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `layout`          | object                                                             | Both the TypeScript and JavaScript presets; a config error with `java`, `kotlin` and `python`. `sourceRoots` (default `["src"]`) and `testRoots` (default `["test", "tests", "__tests__", "e2e"]`; a missing folder is ignored): non-empty arrays of directories inside the project, with no absolute paths, `..` or globs. `excludedGlobs`: an array of globs that replaces the built-in exclusions. `entryPoints`: an array of globs of files that are started or loaded by path (a spawned script, a worker, a config read by another tool) and so are never imported; the dead-code check treats them as entries and the module-load-effects check skips them. A root `e2e/` of Playwright or Cypress specs is linted and type-checked like tests but needs no production import, is never mutated and is not run by the default quality test run (a `testRoots` you list yourself is always run). A Jest project whose root `__tests__/` the quality test run cannot execute lists its own `testRoots` or adds `__tests__/**` to `exclude`. Other keys are an error. The strict preset puts features under `<sourceRoot>/main/features/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `exceptions`      | object[]                                                           | The TypeScript, JavaScript, Java and Kotlin presets; with `python`, only for the file limits (`file-lines-limit`, `folder-files-limit` and `line-length-limit`), and `python` has `python.exceptions` for its other rules. Lifts a strict rule for some paths: `{ "rule", "paths", "reason" }`, all required. `rule` must be a rule the preset configures (with `java`: the finding as printed, `<tool>/<rule>`; with `kotlin`: one of the one-way rules, see [Kotlin preset](#kotlin-preset)) or one of the file limits `file-lines-limit`, `line-length-limit` and `folder-files-limit` (and the size rules below; the TypeScript preset also takes `component-story-missing` and the reuse rules `shared-used-by-one-feature`, `duplicate-definition`, `sibling-copy-edit`, `exported-name-collision`, `redefined-library-component` and `new-icon-asset`, and a `domain-*` architecture rule, whose `paths` are the importing files); `paths` a non-empty glob array, `reason` a non-empty text. A file matching a file-limit exception is not checked and not counted in its folder; a `folder-files-limit` path may also name the folder itself. Each exception is listed in the report and changes the policy hash. See [The strict preset](#the-strict-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `react`           | object                                                             | TypeScript preset only; with `"preset": "javascript"` it is a config error. The React rule scope; see [React](#react). `enabled` (`true` or `false`) forces it on or off; without it the scope is on when `react` is in the project's `package.json` `dependencies` or `devDependencies`. `styling` (`"class-names"`, `"css-in-js"`, `"inline-style"` or `"style-sheet"`; inferred from what the source files use when unset) is the one styling approach the project uses. Other keys are an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `i18n`            | object                                                             | TypeScript preset. The i18n rule scope for `react-intl`; see [Internationalized messages](#internationalized-messages). `enabled` (`true` or `false`) forces it on or off; without it the scope is on when `react-intl` or `@formatjs/intl` is in the head checkout's `package.json` `dependencies` or `devDependencies`. `functionNames` and `componentNames` (string arrays) name wrappers of `formatMessage` and `FormattedMessage` that are checked too. Other keys are an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `testConsole`     | object                                                             | TypeScript, JavaScript, Java and Kotlin presets (not Python yet). The allowlist of the `test-console` check (`test-runtime/test-console-output` on Java and Kotlin, see [java-preset.md](java-preset.md)); see [Console output from tests](#console-output-from-tests). `allow` is an array of `{ "contains", "paths"?, "reason" }`: `contains` is a message fragment that keeps at least three characters once it is normalized (`404` alone, which becomes `<n>`, is refused), `paths` a non-empty list of test file globs that limits the entry, and `reason` is required. Other keys are an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `python`          | object                                                             | Python preset only: `environment`, `formatter`, `testRunner`, `typeChecker` and `sourceRoots` overrides for what nitpicker detects, and `exceptions` (the Python counterpart of `exceptions`); see [Python preset](#python-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `kotlin`          | object                                                             | Kotlin preset only. `formatter`: `"ktlint"`, `"ktfmt"` or `"none"`, the format check to run; detected from the build files and `.editorconfig` when absent. `detektConfig`: path of the detekt config inside the project; detected when absent. See [Kotlin preset](#kotlin-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `analyzers`       | object[]                                                           | Custom analyzers; see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `legacyInventory` | string                                                             | Path of the legacy inventory, inside the project. Default `nitpicker.legacy.json`. Every preset; see [Adopting nitpicker on existing code](#adopting-nitpicker-on-existing-code) [Java preset](#java-preset) and [Python preset](#python-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tools`           | object                                                             | Which config each tool uses: `{ "prettier": { "precedence": [...] } }`. See [Your project's tool configs](#your-projects-tool-configs). `prettier`, `eslint` and `typescript` with the TypeScript and JavaScript presets (`{ "eslint": { "engine": "oxlint" } }`; see [Lint engine](#lint-engine); `{ "typescript": { "engine": "native" } }`; see [Type check engine](#type-check-engine)), `pmd` and `checkstyle` with `java` and `kotlin`, `ktlint`, `ktfmt` and `detekt` with `kotlin`, and `ruff`, `black`, `pyright` (it also covers basedpyright), `mypy` and `mutmut` with `python`; any other name is an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `conventions`     | object                                                             | Pins a style nitpicker otherwise takes from the project. When two conventions are equally valid, nitpicker counts which one most files use and checks with that: a comparison measures the merge base (so a branch cannot flip it), or the branch when the base has no files of that kind yet; `--all` measures the checkout. A tie, or nothing to measure, keeps the preset default, and the run prints what it followed. Java and Kotlin presets (Java sources): `"java.formatter"`, `"google"` (google-java-format, the default), `"palantir"` (palantir-java-format) or `"none"` (no Java format check); `"java.indentation"`, `"2"` (google-java-format), `"4"` (google-java-format `--aosp`; palantir-java-format is always 4) or `"tab"`; `"java.lineLength"`, a whole number of columns from 10 to 999 (`"100"`, `"120"` and `"140"` are the measured ones; it drives `line-length-limit` for Java files; google-java-format wraps at 100 and palantir-java-format at 120, so a pin that disagrees with a pinned or build-declared formatter is a config error, and with a default or measured one it turns the formatter into `"none"`); `"java.wildcardImports"` `"explicit"`/`"wildcard"` (wildcard turns off Checkstyle `AvoidStarImport` and Error Prone `WildcardImport`); `"java.testStaticImports"` `"explicit"`/`"wildcard"` (the same for `import static ...*` in test sources only); `"java.assertionHelpers"` and `"kotlin.assertionHelpers"`, a list of method names (a helper is followed when it ends tests that have no other assertion in at least three test files and is defined as a method or function in a test or test-support source whose body calls an assertion or throws; PMD's `UnitTestShouldIncludeAssert` and the Kotlin `test-without-assertion` rule then accept it as an assertion; `[]` pins none). Kotlin and Python presets: the `kotlin.*` and `python.*` ids and values are under [Formatter and detekt configs](#formatter-and-detekt-configs-python-and-kotlin-presets); a project's own tool config sets them only when `tools.<tool>.precedence` lists `"project"`. TypeScript and JavaScript presets (Prettier options): `"prettier.quotes"` `"single"`/`"double"`, `"prettier.semicolons"` `"always"`/`"never"`, `"prettier.indentation"` `"2"`/`"4"`/`"tab"`, `"prettier.printWidth"` `"80"`/`"100"`/`"120"` or any number of columns, `"prettier.trailingCommas"` `"all"`/`"es5"`/`"none"`, `"prettier.arrowParens"` `"always"`/`"avoid"`, `"prettier.bracketSpacing"` `"spaced"`/`"tight"`, `"prettier.endOfLine"` `"lf"`/`"crlf"`, `"prettier.jsonIndentation"` `"2"`/`"4"`/`"tab"` and `"prettier.yamlIndentation"` `"2"`/`"4"` (measured from the JSON and YAML files themselves, only the ones the Prettier check covers: JSON at the project root and under the source and test roots, YAML under the source roots; fixtures and generated files do not count). TypeScript preset only (React): `"prettier.jsxQuotes"` `"double"`/`"single"` (Prettier `jsxSingleQuote`, measured from string attribute values in `.tsx`/`.jsx` files) and `"prettier.bracketSameLine"` `"newLine"`/`"sameLine"` (where the `>` of a multi-line opening tag is, compared with its last attribute); and, beyond Prettier, `"typescript.typeImports"` (TypeScript preset only) `"separate"` (`import type { A }`)/`"inline"` (`import { type A }`), which sets the `consistent-type-imports` fix style, and `"typescript.assertionHelpers"` a list of function names (for example `["assertOk", "verifyCalled"]`): a function the project defines in a test file or a `test-support`, `test-utils`, `testing` or `testkit` folder whose body calls `expect` or `assert` (or throws), and that is the last call of a test (`it`, `test` and their `.only`, `.skip`, `.each`, `.for` and similar forms, not hooks or `describe`) containing no `expect` in at least three test files, counts as an assertion for `vitest/expect-expect`, next to `expect`, `assert`, `expectTypeOf` and `assertType`. A pin is a list of plain identifiers (letters, digits, `_`) and replaces the measured list. `"typescript.fileNames"` `"kebab-case"`/`"camelCase"`/`"snake_case"`, the casing `nitpicker/file-name-casing` expects of source and test file names (the part before the first dot, so `foo.min.js` is judged as `foo`). Only files under the source and test roots count; fixtures and generated files neither count nor fail. PascalCase names always pass (components, classes) and cast no vote, as do names that fit every casing (`index`, `utils`, `404`, `fr-CA`), React hook files (a file named `useX` that exports a function or constant named exactly `useX`; `useCase.ts` exporting something else is judged like any other name), Next.js and Remix names (`not-found`, `[id]`, `posts_.$id`, `_app`, `+page`), `*.config.*` files and names with a hash segment (`chunk-3f9a1c2b`). When a folder has at least three other files that vote, their plurality decides for that folder (a tie keeps the project casing); a pin in `conventions` overrides this, so every file follows the pin. |

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
two, `python` and `mutation`.

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

### Internationalized messages

A TypeScript project with `react-intl` or `@formatjs/intl` in `dependencies` or `devDependencies`
gets an i18n rule scope on top of the strict preset, from `eslint-plugin-formatjs`: every message
has a literal `defaultMessage` and a `description` that tells the translator where it appears, no
untranslated text in JSX, placeholders that match their values, valid ICU syntax, `#` in plurals and
messages that are whole sentences. Detection works like the React scope's: `package.json` of the
head checkout, `dependencies` and `devDependencies` (a peer dependency alone does not count), read
once for both sides. Set `"i18n": { "enabled": true }` to force the scope on (a monorepo whose
manifest is elsewhere) or `false` to turn it off, for instance while a project is not translated
yet. A project that wraps `formatMessage` or `FormattedMessage` lists the wrappers in
`i18n.functionNames` and `i18n.componentNames` so their messages are checked too. A rule that flags
legitimate code (a brand name in JSX text) is lifted for some paths with an entry in `exceptions`
(`formatjs/no-literal-string-in-jsx`); an exception that names an i18n rule is skipped while the
scope is off, and one that names an i18n rule nitpicker does not run is an error. Story files
(`*.stories.*`, `*.story.*`) are not checked. The rules, the ones left off and why are in
[The strict preset](typescript-strict-preset.md#internationalized-messages).

### Console output from tests

The `test-console` check fails a change when the project's tests print `console.error` or
`console.warn` output that the base run did not print. The usual cause is work that outlives a test:
a React "state update on an unmounted component" warning from a timer that survives unmount, a
"unique key" warning from a list that changed, an error logged by a handler that now fails. The
check reads the `coverage` run, so it starts no tests of its own; it costs a small reporter in that
run and a file read per side.

The check runs on Vitest projects, since only Vitest reports console output per test. What it sees is
what Vitest sends to standard error from the console: `console.error`,
`console.warn`, `console.trace` and a failed `console.assert`. A message the project's own
`onConsoleLog` returns `false` for is skipped, because that is the project saying it is expected.
`silent: true` does not hide anything from the check, because it silences the terminal, not the
output. It does not see:

- `console.log`, `console.info` and `console.debug`, which go to standard output;
- `process.stderr.write`, output of child processes and `process.emitWarning`;
- output printed after a test file has finished, such as a dangling timer that fires later;
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
the base did not print can fail. The check follows the project's Vitest, the only runner the presets
support (see the [JavaScript preset](#javascript-preset) for Jest and `node:test`).

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
at a time (findings carry the module path); a Maven failure or a failing test is a
`java/maven-failure` tool error naming the cause. Maven runs through `mvnw` when the project has
one, else `mvn` from the PATH; `NITPICKER_MAVEN=<command>` overrides both. See
[Maven builds](java-preset.md#maven-builds).

Needs Java 21. Gradle is run through the project's own wrapper (`gradlew`, `gradlew.bat` on Windows) when the
project root has one (run with `sh` when it is not executable), else `gradle` from the PATH; `NITPICKER_GRADLE=<command>` overrides both.
Config keys with this preset: `base`, `disable`, `analyzers`, and the keys shared with the other
presets, `thresholds` (`crapLimit`, `fileLines`, `testFileLines`, `folderFiles`, `folderDepth`,
`classMethods`, `classFields`, `inheritanceDepth`, `unitTestSeconds` and `integrationTestSeconds`),
`exclude` (findings under the globs are dropped), `exceptions`, `legacyInventory` and `conventions`.
A Java exception names the finding as printed, `<tool>/<rule>` (for example
`pmd/UnusedPrivateField`), or a size rule (`file-lines-limit`,
`line-length-limit`, `folder-files-limit`, `folder-depth-limit`, `class-methods-limit`,
`class-fields-limit`, `inheritance-depth-limit`), and drops it under its `paths` on both snapshots. The
inventory has the same format as
the TypeScript one, `{ "sites": [{ "file", "rule", "source", "count" }] }`, where `source` is the
finding's `identity` as printed in `new-findings.json`: up to `count` occurrences of that site are
baselined, and raising a `count` (or adding a site) on head over the base fails as
`baseline-expansion`. `layout`, `react` and `i18n` describe TypeScript source roots, React and message libraries, have no Java
meaning, and stay a config error with this preset. `testConsole.allow` applies to the console output
of the JUnit tests. `tools` takes `pmd` and `checkstyle`; see
[Your project's tool configs](#your-projects-tool-configs). Details: [java-preset.md](java-preset.md).

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

## JavaScript preset

Set `"preset": "javascript"` to gate a project of plain `.js`, `.mjs` and `.cjs` files with the same
checks, rules and exit codes as the TypeScript preset; the keys `layout`, `exceptions` and `tools` work the same.
It is never auto-detected. Types are written as JSDoc and checked by TypeScript with `allowJs` and
`checkJs`: nitpicker generates the tsconfig, layered over your `tsconfig.json` or `jsconfig.json` when you
have one. `typescript` and `vitest` are peers as for TypeScript.

What the preset does not support:

- **Test runner.** Vitest is the only runner, for both presets. A Jest or `node:test` project cannot
  pass yet: coverage, CRAP and mutation run Vitest, and `vitest/no-import-node-test` fails a
  `node:test` import (its message points to an exception for that rule, which silences the lint
  finding only). Support for both runners is tracked in issue #162. `test-console` reads the same
  Vitest run; the Jest and `node:test` adapters will have to write its report (see
  docs/internals.md).
- **CommonJS tests.** Production code may be CommonJS, but a test file must `import` Vitest, because
  `require('vitest')` fails at run time. Import `.cjs` production code from an ESM test, as the fixture does.
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
environment, failing tests, a crashing tool), the failure is reported as a tool error of the
analyzer that ran it, never thrown: `python` for `ruff-failed`, `format-failed`, `tests-failed`,
`coverage-failed`, `types-failed`, `rules-failed`, `structure-failed` or a plain one when the environment is missing, and `mutation` for
`mutation-failed` (exit 2 when there are no new findings). A mutation failure keeps the lint,
format and coverage findings, and mutation testing is skipped when the `python` analyzer had a tool
error.

The environment is detected: `uv.lock` (also the one of a uv workspace above a member) runs the
tools with `uv run --no-sync`, `poetry.lock` uses the environment poetry reports, a `.venv/`
directory is used as is, otherwise the tools come from the `PATH`; `python.environment` can also be
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
test can tell from the original (an equivalent mutant) is lifted with a `python.exceptions` entry
for `mutant-survived`, or by listing the path in `exclude`, which drops its findings; code hidden
with `# pragma: no mutate` or a `do_not_mutate` in your `[tool.mutmut]` is reported as
`mutant-ignored`, whatever `tools.mutmut` says. mutmut needs
`fork`, so on native Windows the analyzer is skipped with a note: run nitpicker in WSL. Add
`mutants/` to your ignore file. See [python-preset.md](python-preset.md).

Config keys with this preset: `base`, `disable` (`python` and `mutation` are the analyzer names), `analyzers`, `thresholds` (`crapLimit`), `exclude` (findings
under the globs are dropped), `legacyInventory` (same format as the Java one; `source` is the
finding's `identity`) and `python`, whose keys all override a detection: `environment` (`"uv"`,
`"poetry"`, `"path"` or a virtualenv directory in the project), `formatter` (`"ruff"` or
`"black"`), `testRunner` (`"pytest"`, `"unittest"`, `"django"` for `manage.py test` or `"nose2"`; detected from the project),
`typeChecker` (`"mypy"`, `"pyright"` or `"basedpyright"`), `importLinter` (`true` or `false`; by default the import-linter
contracts run when the project configures them) and `sourceRoots` (default `src`, else the top-level
packages). The gate also reports new duplicates (`duplicates/duplicate-clone`), package coupling
(`coupling/stability-direction`; an import under `if TYPE_CHECKING:` is never the reported dependency, though it still counts toward instability) and broken import-linter contracts (`import-linter/contract-broken`);
their messages name the file to add to `exclude` when the repetition or dependency is intended.
`layout` describes TypeScript and stays a config error; the top-level `exceptions` is accepted only
for the file limits (`file-lines-limit`, `line-length-limit`, `folder-files-limit`).

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
  "python": {
    "exceptions": [
      {
        "rule": "T201",
        "paths": ["src/cli/**"],
        "reason": "Command line entry points print their result."
      }
    ]
  }
}
```

`rule` is the id printed in the finding; `exclude` drops every finding under a path instead. The rules most likely to flag code that is right for its place are `T201` (`print` in a command-line tool), `PERF203` (`try` in a loop) and `F401` (an `__init__.py` that re-exports). Inline `# pragma: no cover` and `# pragma: no branch` are not honored either. Changed-branch coverage (`coverage-py`, from the branch data of the same coverage.py
run) fails an untested branch on a changed line, as for Java: `if`, `while`, `for` and `match`
arms are judged, an untested `except` handler is not. The project's own coverage configuration is
ignored (`exclude_lines`, `exclude_also`, `partial_branches`, `omit`, plugins, subprocess
measurement): nitpicker's rcfile measures branches, skips test files and excludes only
`if TYPE_CHECKING:`, `if __name__ == "__main__":`, `@overload` and `raise NotImplementedError`.
A file that cannot be tested is lifted with `exclude`. A change that leaves the project with no test at all fails as `python/no-tests-ran`. Details: [python-preset.md](python-preset.md).

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
  or `<Type>value`. `nitpicker/no-partial-output-assertion` also rejects `toMatchObject` and
  `expect.objectContaining`, `expect.stringContaining` and `expect.arrayContaining` inside
  `toEqual`/`toStrictEqual`: assert the whole value.
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
  aliases and plugins apply. nitpicker adds the `*.test.*` and `*.spec.*` files under the source and
  test roots, ignores the project's `test.dir`, and owns the coverage settings, so the project's
  coverage thresholds never decide nitpicker's findings.

Without a project `tsconfig.json` or Vitest config, nitpicker uses its own defaults.

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

For Prettier, "the project's config" is what Prettier itself resolves for each file
(`.prettierrc*`, `prettier.config.*`, the `prettier` key in `package.json`, and `.editorconfig`),
and the project's `.prettierignore` applies too. The version is still the one nitpicker pins. The
project's config is read from the head checkout and applies to both sides of the comparison, so
editing it never turns unchanged code into new findings; `--fix` formats with the same merged
config. The setting is listed under "Config overrides" in the report.

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

#### Formatter and detekt configs (python and kotlin presets)

The format checks and detekt follow the project's code, not its tool configs, so a setting in
`[tool.ruff]`, `[tool.black]`, `.editorconfig`, a ktfmt style in the build or a `detekt.yml` cannot
loosen the gate. A project whose ruff or black config set the line length or quote style, whose
`.editorconfig` set ktlint properties, or whose `detekt.yml` set rules is checked with the measured
conventions (and detekt's defaults) until it opts in. The run prints, once at the start, the exact
command that formats the code the way nitpicker checks it (`Format with ruff: ruff format ...`), and
one line per ignored config, such as `Ignoring [tool.ruff] in pyproject.toml; opt in with "tools": {
"ruff": { "precedence": ["project", "nitpicker"] } }`. Each format finding points to that command.

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
comparison; they are part of the cache key, so editing one invalidates cached results. A project
listed without its file is a tool error for `ruff`, `black`, `ktlint` and `detekt`, and the message
says to create the file or remove `"project"` from `tools.<tool>.precedence`.

Without the opt-in, ruff and black still keep the project's scope: its `exclude`, `extend-exclude`
and `force-exclude` (paths resolved against the config file) and its `target-version` or
`requires-python`, so a project-excluded generated file gets no format finding and both formatters
infer the same target. The other keys the project sets (`skip-magic-trailing-comma`, `line-ending`,
`docstring-code-format`, `preview`) take effect only with the opt-in.

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

### Lint engine

The lint analyzers apply nitpicker's ESLint policy, but by default they run it on
[oxlint](https://oxc.rs), which is several times faster. Rules oxlint has its own port of run
natively, type-aware rules run on its TypeScript 7 checker, and every other rule (nitpicker's own,
and plugins oxlint lacks) runs inside oxlint through the original ESLint plugin. The few type-aware
plugin rules oxlint cannot run still run on ESLint, for those rules only.

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
much faster than TypeScript 5 and 6. nitpicker installs and pins TypeScript 7 itself. The project's
own `typescript` package (5.7 to 6.x) is still needed, because nitpicker reads source files with it
to name the enclosing symbol of each finding. A run uses the project's TypeScript instead, as
before, when the config uses an option TypeScript 7 removed or no longer knows (such as `baseUrl`,
`moduleResolution: "node"` or `target: "ES5"`), or when TypeScript 7's compiler is not installed
for the platform. The report does not say which engine a run used; set the engine to choose one.

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
