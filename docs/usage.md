# Using nitpicker

The full reference: install, how the comparison works, reports, exit codes, every command-line
option, configuration, the presets, adopting nitpicker on existing code, and running it in CI.
For a short introduction, see the [README](../README.md).

## Install

Add nitpicker as a dev dependency, together with the peers it needs from your project:

```sh
npm install --save-dev nitpicker vitest @vitest/coverage-v8 typescript @types/node
```

Requirements: Node.js 22.14 or newer, a Git repository, and a single-package npm project (the
tested setup). nitpicker brings its own pinned ESLint, Prettier, dependency-cruiser, knip, jscpd,
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
3. `base` in `nitpicker.config.json`
4. the remote's default branch (`refs/remotes/<remote>/HEAD`, using `upstream` if it exists and
   `origin` otherwise)
5. `origin/main`, then `origin/master`

In CI, fetch enough history to contain the merge base (for example `fetch-depth: 0`).

### Reports

Reports are written to `reports/quality/diff/` (`reports/quality/snapshot/` for `--all`):
`report.txt`, `report.junit.xml`, `summary.json`, `new-findings.json`, `resolved-findings.json`,
`changed-metrics.json` and `tool-errors.json`. The summary records every config override and a
policy hash. Choose another directory with `--output <dir>`. Set `NO_COLOR` to disable colored
console output.

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
          [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache] [--help]
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
- `nitpicker cache publish`: analyze the committed `HEAD` tree and upload its findings to the remote
  cache so later branches reuse them as their base. Requires `NITPICKER_CACHE_URL`; exits 0 when
  everything was uploaded and 2 otherwise.

### Findings cache

The base side of a comparison is cached per analyzer; the head side always runs. The key covers the
merge-base commit, project path, analyzer name and version, the analyzer's configuration hash, the
config-file overrides and the head policy (`exclude`, `layout`, `exceptions`, `thresholds`, `react`, `i18n`) with the
legacy inventory path, so changing any of them is a miss. Only clean reports are stored.

- `NITPICKER_CACHE_DIR`: local cache directory (relative to the project root). Default:
  `node_modules/.cache/nitpicker`.
- `NITPICKER_CACHE_URL`: remote cache prefix; an entry is `GET`/`PUT` at `<url>/<key>.json`.
  Optional `NITPICKER_CACHE_AUTH_HEADER` and `NITPICKER_CACHE_TIMEOUT_MS`. Comparison runs only
  read the remote; give write credentials only to the job that runs `cache publish` on `main`.

See [typescript-single-command.md](typescript-single-command.md) for the full model.

## Configuration

Optional. Put `nitpicker.config.json` at the project root. It is read from the head checkout and
applied to **both** sides of the comparison, so base and head are measured with the same policy. A
branch cannot weaken the check by editing the base. Unknown keys and invalid values are an error
(exit 2). Every override is listed in the report and changes the policy hash, so a weakened check
is visible in review.

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

| Key               | Type                                                               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `base`            | string                                                             | Base ref used when neither `--base` nor a CI target branch is given.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `preset`          | `"typescript"`, `"javascript"`, `"java"`, `"kotlin"` or `"python"` | The preset; default `typescript`. `javascript` gates a plain JavaScript project; see [JavaScript preset](#javascript-preset). `java` and `kotlin` gate a Gradle project and `python` a Python project; none of them is auto-detected; see [Java preset](#java-preset), [Kotlin preset](#kotlin-preset) and [Python preset](#python-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `disable`         | string[]                                                           | Analyzer names to turn off, without duplicates. An unknown name is an error, and so is disabling an analyzer another one depends on (`coverage` is needed by `crap`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `thresholds`      | object                                                             | `crapLimit`: a positive number. The CRAP score above which a function is a finding. The default is 9 (from `shared/policy.mjs`). TypeScript, JavaScript, Java and Python. Whole numbers for the file limits: `fileLines` (lines per source file, default 300), `testFileLines` (per test file, default 500), `lineLength` (characters per line, default 120; imports, URLs and the text inside string literals are not counted) and `folderFiles` (source files, and separately test files, directly in one folder, default 6; only code files of the language count, so config and asset folders are never checked, and test files under a `fixtures` folder are skipped). A file or folder already over a limit on the base fails only when it grows, and a folder moved to a new path is matched to its old path. Every preset, except `lineLength` with Java and Kotlin: their line length is Checkstyle's and detekt's, and setting it with `"preset": "java"` or `"kotlin"` is a config error. Java and Kotlin only: `unitTestSeconds` (default 5) and `integrationTestSeconds` (default 30), the seconds one test the change adds or edits may take (see [slow tests](java-preset.md#slow-tests)); with another preset they are a config error. Generated sources a build registers (Java, Kotlin) belong in `exclude`. |
| `exclude`         | string[]                                                           | Globs relative to the project root (`**`, `*`, `?`, `{a,b}`), added to the built-in exclusions (`dist`, `build`, `generated`, `node_modules`, `coverage`, `reports`, `target` and `*.d.ts`). Excluded files are skipped by every analyzer and are absent from the dependency graph. With the Java and Python presets the built-in list does not apply and findings whose path matches a glob are dropped (Python also keeps those files away from ruff and black).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `layout`          | object                                                             | Both the TypeScript and JavaScript presets; a config error with `java`, `kotlin` and `python`. `sourceRoots` (default `["src"]`) and `testRoots` (default `["test", "tests"]`): non-empty arrays of directories inside the project, with no absolute paths, `..` or globs. `excludedGlobs`: an array of globs that replaces the built-in exclusions. `entryPoints`: an array of globs of files that are started or loaded by path (a spawned script, a worker, a config read by another tool) and so are never imported; the dead-code check treats them as entries and the module-load-effects check skips them. Other keys are an error. The strict preset puts features under `<sourceRoot>/main/features/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `exceptions`      | object[]                                                           | The TypeScript, JavaScript, Java and Kotlin presets; with `python`, only for the file limits (`file-lines-limit`, `folder-files-limit` and `line-length-limit`), and `python` has `python.exceptions` for its other rules. Lifts a strict rule for some paths: `{ "rule", "paths", "reason" }`, all required. `rule` must be a rule the preset configures (with `java`: the finding as printed, `<tool>/<rule>`; with `kotlin`: one of the one-way rules, see [Kotlin preset](#kotlin-preset)) or one of the file limits `file-lines-limit` and `folder-files-limit` (the TypeScript preset also takes `component-story-missing` and the reuse rules `shared-used-by-one-feature`, `duplicate-definition`, `exported-name-collision`, `redefined-library-component` and `new-icon-asset`, and a `domain-*` architecture rule, whose `paths` are the importing files); with the other presets also `line-length-limit`; `paths` a non-empty glob array, `reason` a non-empty text. A file matching a file-limit exception is not checked and not counted in its folder; a `folder-files-limit` path may also name the folder itself. Each exception is listed in the report and changes the policy hash. See [The strict preset](#the-strict-preset).                                                                           |
| `react`           | object                                                             | TypeScript and JavaScript presets. The React rule scope; see [React](#react). `enabled` (`true` or `false`) forces it on or off; without it the scope is on when `react` is in the project's `package.json` `dependencies` or `devDependencies`. `styling` (`"class-names"`, `"css-in-js"` or `"inline-style"`; inferred from `package.json` when unset) is the one styling approach the project uses. Other keys are an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `i18n`            | object                                                             | TypeScript preset. The i18n rule scope for `react-intl`; see [Internationalized messages](#internationalized-messages). `enabled` (`true` or `false`) forces it on or off; without it the scope is on when `react-intl` or `@formatjs/intl` is in the head checkout's `package.json` `dependencies` or `devDependencies`. `functionNames` and `componentNames` (string arrays) name wrappers of `formatMessage` and `FormattedMessage` that are checked too. Other keys are an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `python`          | object                                                             | Python preset only: `environment`, `formatter`, `testRunner`, `typeChecker` and `sourceRoots` overrides for what nitpicker detects, and `exceptions` (the Python counterpart of `exceptions`); see [Python preset](#python-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `kotlin`          | object                                                             | Kotlin preset only. `formatter`: `"ktlint"`, `"ktfmt"` or `"none"`, the format check to run; detected from the build files and `.editorconfig` when absent. `detektConfig`: path of the detekt config inside the project; detected when absent. See [Kotlin preset](#kotlin-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `analyzers`       | object[]                                                           | Custom analyzers; see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `legacyInventory` | string                                                             | Path of the legacy inventory, inside the project. Default `nitpicker.legacy.json`. Every preset; see [Adopting nitpicker on existing code](#adopting-nitpicker-on-existing-code) [Java preset](#java-preset) and [Python preset](#python-preset).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tools`           | object                                                             | Which config each tool uses: `{ "prettier": { "precedence": [...] } }`. See [Your project's tool configs](#your-projects-tool-configs). `prettier`, `eslint` and `typescript` with the TypeScript and JavaScript presets (`{ "eslint": { "engine": "oxlint" } }`; see [Lint engine](#lint-engine); `{ "typescript": { "engine": "native" } }`; see [Type check engine](#type-check-engine)), `pmd` and `checkstyle` with `java` and `kotlin`; any other name is an error, and `python` has no `tools`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `conventions`     | object                                                             | Pins a style nitpicker otherwise takes from the project. When two conventions are equally valid, nitpicker counts which one most files use and checks with that: a comparison measures the merge base (so a branch cannot flip it), or the branch when the base has no files of that kind yet; `--all` measures the checkout. A tie, or nothing to measure, keeps the preset default, and the run prints what it followed. Java and Kotlin presets (Java sources): `"java.indentation"`, `"2"` (google-java-format) or `"4"` (google-java-format `--aosp`). TypeScript and JavaScript presets (Prettier options): `"prettier.quotes"` `"single"`/`"double"`, `"prettier.semicolons"` `"always"`/`"never"`, `"prettier.indentation"` `"2"`/`"4"`/`"tab"`, `"prettier.printWidth"` `"80"`/`"100"`/`"120"`, `"prettier.trailingCommas"` `"all"`/`"es5"`/`"none"`, `"prettier.arrowParens"` `"always"`/`"avoid"`, `"prettier.bracketSpacing"` `"spaced"`/`"tight"`, `"prettier.endOfLine"` `"lf"`/`"crlf"`.                                                                                                                                                                                                                                                                                                                        |

These are the analyzer names you can pass to `disable` and `--analyzer`.
The built-in set: `eslint-lint`, `eslint-errors`, `eslint-logging`, `eslint-module-effects`,
`entry-points`, `prettier-format`, `typescript-typecheck`, `dependency-architecture`,
`coding-standards`, `coupling`, `test-runtime`, `structure`, `duplicates`, `dead-code`, `coverage`,
`crap` and `mutation`. The Java and Kotlin presets have one analyzer each, and the Python preset has
two, `python` and `mutation`.

### React

A TypeScript project with `react` in `dependencies` or `devDependencies` gets a React rule scope on
top of the strict preset: function components only, the rules of hooks and exhaustive dependencies,
no state derived from props or state in an effect, no data fetching in an effect, no array index as a
`key`, one styling approach, the `jsx-a11y` accessibility rules and Testing Library rules for
component tests (query by role, `userEvent` over `fireEvent`, no implementation details). Detection
reads the package.json of the head checkout once and uses the result for both sides, so a pull
request that adds React does not turn the whole project into new findings.
Set `"react": { "enabled": true }` to force the scope on (a monorepo whose manifest is elsewhere) or
`false` to turn it off. `react.styling` picks the approach: `class-names` flags inline `style`
objects and CSS-in-JS imports, `css-in-js` flags stylesheet imports and inline `style` objects,
`inline-style` flags stylesheet imports and CSS-in-JS imports. Unset, it is `css-in-js` when
`package.json` lists styled-components, Emotion or another CSS-in-JS library, else `class-names`. A
rule that flags legitimate code is lifted for some paths with an entry in `exceptions` (for example
`react-hooks/exhaustive-deps`); an exception that names a React rule is skipped while the scope is
off, so adding or removing React in a PR does not break either side of the comparison. The rules and
their allowed forms are in [The strict preset](typescript-strict-preset.md#react).

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
presets, `thresholds` (`crapLimit`, `fileLines`, `testFileLines`, `folderFiles`, `unitTestSeconds` and
`integrationTestSeconds`), `exclude`
(findings under the globs are dropped), `exceptions`, `legacyInventory` and `conventions`. A Java exception names
the finding as printed, `<tool>/<rule>` (for example `pmd/UnusedPrivateField`), or a file limit
(`file-lines-limit`, `folder-files-limit`), and drops it under its `paths` on both snapshots. The
inventory has the same format as
the TypeScript one, `{ "sites": [{ "file", "rule", "source", "count" }] }`, where `source` is the
finding's `identity` as printed in `new-findings.json`: up to `count` occurrences of that site are
baselined, and raising a `count` (or adding a site) on head over the base fails as
`baseline-expansion`. `layout`, `react` and `i18n` describe TypeScript source roots, React and message libraries, have no Java
meaning, and stay a config error with this preset. `tools` takes `pmd` and `checkstyle`; see
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
`runBlocking`, and plain classes that only hold data. Every message names the allowed form.
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
  finding only). Support for both runners is tracked in issue #162.
- **CommonJS tests.** Production code may be CommonJS, but a test file must `import` Vitest, because
  `require('vitest')` fails at run time. Import `.cjs` production code from an ESM test, as the fixture does.
- **`.jsx` and `.tsx`.** React and JSX belong to the TypeScript preset. A `.jsx` or `.tsx` file is outside
  the JavaScript layout: no analyzer reads it.

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

CRAP is measured on `.js`, `.mjs`, `.cjs` and `.ts` files like on TypeScript ones.

## Python preset

Set `"preset": "python"` in `nitpicker.config.json` to gate a Python project the same way: ruff, a
format check (ruff format or black, whichever the project uses), a strict type check (mypy or
pyright or basedpyright, whichever the project uses), a few small checks of nitpicker's own, the test suite under
coverage.py, function size limits (lines, statements, control nesting, parameters) and the CRAP
score (lizard at the version pinned in languages/java/gradle/nitpicker.init.gradle, plus per-function coverage; it must be installed
as `lizard` in the environment or on the `PATH`, or named by `NITPICKER_LIZARD`; nothing is downloaded) run on the merge base and on head, inside the project's own environment, and only new
enforceable findings fail. Exit codes, console summary, `new-findings.json`, `report.sarif` and
`report.junit.xml` are the same as for TypeScript. If a tool fails on either snapshot (no
environment, failing tests, a crashing tool), the failure is reported as a tool error of the
analyzer that ran it, never thrown: `python` for `ruff-failed`, `format-failed`, `tests-failed`,
`coverage-failed`, `types-failed`, `rules-failed`, `structure-failed`, `lizard-failed` or a plain one when the environment is missing, and `mutation` for
`mutation-failed` (exit 2 when there are no new findings). A mutation failure keeps the lint,
format and coverage findings, and mutation testing is skipped when the `python` analyzer had a tool
error.

The environment is detected: `uv.lock` (also the one of a uv workspace above a member) runs the
tools with `uv run --no-sync`, `poetry.lock` uses the environment poetry reports, a `.venv/`
directory is used as is, otherwise the tools come from the `PATH`; `python.environment` can also be
an absolute virtualenv directory. The environment has to exist already (`uv sync`, `poetry install`, or your CI's
install step) and needs `coverage`, a type checker (`mypy`, `pyright` or `basedpyright`) and `pytest`, and `mutmut` unless mutation is disabled (mutmut runs every suite with pytest, which also runs `unittest` tests); `ruff` (or `black`) may come
from the `PATH`. The base snapshot runs against the same environment with its own sources first on
`PYTHONPATH`, so an editable install does not make base tests exercise head code.

Mutation testing is the `mutation` analyzer and runs mutmut 3.x after the `python` analyzer: a new
surviving or uncovered mutant fails (`mutant-survived`, `mutant-nocoverage`), there is no score
gate, and mutants that survived on the base stay baselined. `"disable": ["mutation"]` turns it off
(`python` cannot be disabled alone, because `mutation` depends on it), and it is also what to do
when mutmut cannot be installed. A project's own `[tool.mutmut]` is used as it is; without one
nitpicker mutates the source roots, skipping test files and the `exclude` globs. A mutant that no
test can tell from the original (an equivalent mutant) is lifted in `[tool.mutmut]` with
`do_not_mutate`, or by listing the path in `exclude`, which drops its findings. mutmut needs
`fork`, so on native Windows the analyzer is skipped with a note: run nitpicker in WSL. Add
`mutants/` to your ignore file. See [python-preset.md](python-preset.md).

Config keys with this preset: `base`, `disable` (`python` and `mutation` are the analyzer names), `analyzers`, `thresholds` (`crapLimit`), `exclude` (findings
under the globs are dropped), `legacyInventory` (same format as the Java one; `source` is the
finding's `identity`) and `python`, whose keys all override a detection: `environment` (`"uv"`,
`"poetry"`, `"path"` or a virtualenv directory in the project), `formatter` (`"ruff"` or
`"black"`), `testRunner` (`"pytest"` or `"unittest"`; default `pytest` when the project uses it),
`typeChecker` (`"mypy"`, `"pyright"` or `"basedpyright"`), `importLinter` (`true` or `false`; by default the import-linter
contracts run when the project configures them) and `sourceRoots` (default `src`, else the top-level
packages). The gate also reports new duplicates (`duplicates/duplicate-clone`), package coupling
(`coupling/stability-direction`; an import under `if TYPE_CHECKING:` is never the reported dependency, though it still counts toward instability) and broken import-linter contracts (`import-linter/contract-broken`);
their messages name the file to add to `exclude` when the repetition or dependency is intended.
`layout` describes TypeScript and stays a config error; the top-level `exceptions` is accepted only
for the file limits (`file-lines-limit`, `line-length-limit`, `folder-files-limit`).

The one-way rules (pathlib, f-strings, no mutable defaults, no bare `except`, no `except` that only passes, continues, returns or assigns a constant, no `contextlib.suppress(Exception)`, no
`import *`, logging instead of `print`, frozen dataclasses, pydantic only in `adapters/`, enums
instead of string constants) and the strict type check name the allowed form in every failure
message. Inline `# type: ignore`, `# noqa`, `# pyright: ignore` and `# fmt: off` are findings themselves, and so are `@no_type_check`, `if not TYPE_CHECKING:` and a `.pyi` beside its `.py`. A project's own mypy, pyright or basedpyright config cannot weaken the check. The way out of a finding that flags legitimate code (including a comment, with the rule `no-inline-suppression`) is `python.exceptions`; a rule id that nitpicker does not report is a config error. Code
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

- **Everywhere in production code**: `type`, never `interface`; no `enum` or `namespace`; classes
  only as `Error` subclasses; named functions use the `function` keyword (arrow functions only as
  callbacks); named exports only (config files may default-export); early returns, no `else` after
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
  parse untrusted input once at the boundary with [zod](https://zod.dev), validating every field
  (no `z.unknown()` or `z.any()` fields in `z.object`). zod is
  an expectation of the preset, not a dependency of nitpicker: install it in your project.
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
  `no-restricted-syntax` is one rule, an exception for it lifts all the syntax bans for those paths.
- **Layout overrides**: `layout.sourceRoots` moves the whole structure (`<root>/main/features/...`).

A small project that follows all of this is kept in `languages/typescript/preset/fixtures/strict-clean` of the nitpicker
repository, and its tests assert that `nitpicker --all` reports no enforceable findings for it.

### Upgrading from the earlier rules

Strict replaced the earlier ESLint rules in a single release. nitpicker analyzes the base checkout
with the head's policy, so the existing violations appear on both sides and stay baselined; the
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
  `title?: string | undefined`). The files checked are the source and test roots.
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
| `["project"]`              | the project's only                                                   |
| `["project", "nitpicker"]` | both merged; the project's value wins where both set the same option |
| `["nitpicker", "project"]` | both merged; nitpicker's value wins where both set the same option   |

For Prettier, "the project's config" is what Prettier itself resolves for each file
(`.prettierrc*`, `prettier.config.*`, the `prettier` key in `package.json`, and `.editorconfig`),
and the project's `.prettierignore` applies too. The version is still the one nitpicker pins. The
project's config is read from the head checkout and applies to both sides of the comparison, so
editing it never turns unchanged code into new findings; `--fix` formats with the same merged
config. The setting is listed under "Config overrides" in the report.

Without a `tools` entry, nitpicker's own Prettier layer still follows the code: the options under
`conventions` are measured from the project's files (not read from its Prettier config), so a
project written with double quotes or without semicolons isn't told to switch. They apply to code files;
JSON and YAML keep nitpicker's settings. A `.editorconfig` counts as the project's Prettier
config, so it is read only when `precedence` lists `"project"`.

With the `java` and `kotlin` presets the tools are `pmd` (the project's `config/pmd/ruleset.xml`) and
`checkstyle` (the project's `config/checkstyle/checkstyle.xml`). Both files are read from the head
checkout, and naming `"project"` without the file is a tool error. PMD runs both rule sets when both
layers are listed, so the order makes no difference; nitpicker's Spring rules run whenever
`"nitpicker"` is listed. Checkstyle runs one config, so its `precedence` is `["nitpicker"]` or
`["project"]`. Without a `tools` entry these files are not used.

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
`exclude` generated or vendored code, and set `layout` if your sources are not under `src/`. Each
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
container user; add `--user "$(id -u):$(id -g)"` to own them yourself.

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
      - run: docker run --rm -v "$PWD":/work -e GITHUB_BASE_REF nitpicker
```

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
