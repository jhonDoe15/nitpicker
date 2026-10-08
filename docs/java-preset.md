# Java preset

Status: slices 1 (ticket X11), 2 (ticket J2) and 6 (ticket J6) implemented; later slices are planned below. The scope is a proposal
pending owner review.

The Java preset runs the same differential gate as the TypeScript preset on a Gradle project: run
the tools on the merge base and on head, turn each report into findings
([`spec/findings.schema.json`](../spec/findings.schema.json)), and fail only on new enforceable
findings. The comparison is the language-neutral core (`compareFindings`, rename map from git),
which the conformance suite in [`spec/conformance`](../spec/conformance/README.md) covers. The Java
side contributes only two things: producing reports, and converting them into findings.

## How it works

```
gradle -I typescript/java/nitpicker.init.gradle nitpickerJava   (per snapshot: base, head)
  -> build/nitpicker/{pmd.sarif, spotbugs.sarif, format.txt, jacoco.xml, manifest.json}
  -> typescript/adapters/java/java-reports.mjs          (readJavaFindings, via the ingesters)
  -> compareFindings(base, head, renames)               (typescript/adapters/java/java-diff.mjs)
```

- **Gradle side: `typescript/java/nitpicker.init.gradle`.** (It lives inside the npm package
  directory so that `files` can ship it; slice 1 had it at `java/` in the repository root.)
- **Gradle side, continued.** An init script, not a plugin: the consumer build is
  not edited, and the base snapshot (a git worktree of the merge base) is analyzed with exactly the
  same tools and versions as head, even if the base predates any adoption. It registers
  `nitpickerJava` in every project that applies the `java` plugin. Every tool version is pinned
  exactly in one map at the top of the file (PMD 7.7.0, SpotBugs 4.9.3, google-java-format 1.25.2,
  JaCoCo 0.8.12). Tools run from their own configurations (`nitpickerPmd` and so on), so they never
  touch the consumer's compile classpath. The task writes only below `build/nitpicker/`; that
  directory is the contract between the two sides.
- **Nitpicker side: `typescript/adapters/java/`.** `runJavaPreset` runs the task,
  `readJavaFindings` converts the reports, `runJavaDiff` does worktrees, rename map, comparison.
  `adapters/java/java-analyzer.mjs` wraps all of it as one analyzer named `java` for the CLI (slice
  2, below).
- **Base snapshot dependencies.** Gradle resolves from its own cache, so unlike npm no install step
  is needed, and the X7 dependency hook (`dependency-hooks.mjs`) is not used by slice 1. If a
  project vendors dependencies in the tree, a `gradleDependencyHook` with the manifests
  `build.gradle(.kts)`, `settings.gradle(.kts)`, `gradle/libs.versions.toml` and `gradle.lockfile`
  fits the X7 interface.
- **Failure policy.** If Gradle fails on either snapshot (does not compile, tests fail, tool
  crashes, no `gradle` on the PATH, unreadable reports), nothing is silently skipped. `runJavaDiff`
  (the library entry) throws; the CLI path maps the failure to a `tool-error` finding, see slice 2.

## Slices

Order: each slice is one PR, adds one tool, and changes only the init script, one ingester or
mapping, tests, and this document.

| #   | Slice                    | Tool and report                                                  | Findings                                                                                                 | Status  |
| --- | ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Base                     | PMD, SpotBugs, google-java-format, JaCoCo; init script, e2e test | see below                                                                                                | done    |
| 2   | Integration              | none new                                                         | Wire into the CLI and reporters (text, JSON, SARIF from X4); `tool-error` on Gradle failure; npm `files` | done    |
| 3   | Checkstyle               | Checkstyle XML via the Gradle `checkstyle` plugin                | `ingestCheckstyle` (X6) as is                                                                            | later   |
| 4   | ArchUnit                 | ArchUnit rules as JUnit tests; JUnit XML failures                | new small ingester: one enforceable finding per violated rule and offending class                        | later   |
| 5   | CRAP via lizard          | lizard CSV for complexity, JaCoCo for per-method coverage        | new `crap` ingester joining both; same rules as the TypeScript `crap` check (limit 9)                    | later   |
| 6   | Duplicates               | jscpd with the `java` format, JSON report                        | new ingester: `duplicate-clone` and `duplicate-clone-size`, as in the TypeScript `duplicates` check      | this PR |
| 7   | Mutation                 | PIT, XML report                                                  | new ingester: `mutant-survived`, `mutant-nocoverage` enforceable, summary descriptive (see X10)          | later   |
| 8   | Gate on changed coverage | JaCoCo with changed line ranges from git                         | `changed-branch-coverage` equivalent (needs a head-vs-base line mapping, not a per-report ingester)      | later   |

PMD and SpotBugs appear before the other tools because both emit SARIF 2.1.0 and need no new
ingester. Slices 4 to 7 need Java-specific tooling (Gradle test task wiring, Python for lizard, Node
for jscpd, a long-running PIT) and each is expensive enough to deserve its own review. Slices 5 and
8 depend on slice 1's JaCoCo output; 5 additionally needs lizard installed, which is the first tool
that is not a JVM artifact, so it needs a decision on how tools are provisioned.

## Slice 2: CLI and reporter integration

- **Selection.** Explicit only: `"preset": "java"` in `nitpicker.config.json`. There is no
  auto-detection of `build.gradle`: a repository with both a `package.json` and a Gradle build
  would otherwise change meaning silently. Without the key, nitpicker runs the TypeScript preset as
  before. The key is read from the head checkout and applies to both snapshots, like the rest of
  the config.
- **One analyzer, several tools.** The preset is a single analyzer, `java` (one Gradle run per
  snapshot), whose findings carry the tool names `pmd`, `spotbugs`, `google-java-format` and
  `jacoco` (and, from slice 6, `duplicates`). The analyzer declares them as `reportedTools`, the one scheduler change this slice
  needed (a finding for a tool that is neither the analyzer nor a declared one is still an error).
  Its version is the pinned tool versions from the init script, its configuration hash covers the
  init script and the Java adapter files, so a tool bump invalidates the base cache.
- **Everything else is shared.** `nitpicker`, `--all`, `--base`, `--output`, `--defer-exit`,
  `cache publish` and `nitpicker aggregate` take the same path as for TypeScript, so the exit codes
  (0 pass, 1 new enforceable findings, 2 tool error), the console summary, `new-findings.json`,
  `summary.json`, `report.sarif` and `report.junit.xml` are the ones described in the CLI README.
- **Gradle failure.** `adapters/java/java-runner.mjs` catches any failure of the preset on a
  snapshot and returns one finding, `java/gradle-failure` with classification `tool-error`, whose
  message is Gradle's diagnostic output. The comparison turns it into a tool error for that
  snapshot (`base` or `head`), skips the comparison for the analyzer and exits with 2; nothing
  throws and no partial result is compared.
- **Gradle binary.** `gradle` from the PATH, or the command in `NITPICKER_GRADLE` (as the e2e test
  already allowed). The Gradle wrapper is not used; a consumer who needs it sets
  `NITPICKER_GRADLE=./gradlew`.
- **Config keys.** `base`, `disable` and `analyzers` work as before. `thresholds`, `exclude`,
  `layout`, `exceptions` and `legacyInventory` tune the TypeScript analyzers and have no Java
  counterpart yet; with `"preset": "java"` they are a config error instead of being ignored.
- **Packaging.** The init script moved to `typescript/java/` and `java/**` is in the npm `files`;
  the packed-contents test and the installed-package test assert that `java/nitpicker.init.gradle`
  ships.
- **Tests.** `core/java-cli.test.mjs` drives the CLI with a fake `gradle` (`adapters/java/fixtures/fake-gradle.mjs`),
  so it runs without Java: pass, new finding in text/JSON/SARIF/JUnit, Gradle failure on head and
  on base, missing binary, `--all`. The real Gradle run stays behind `NITPICKER_JAVA_E2E=1`
  (`npm run test:java`), unchanged.

## Slice 1: tools, reports and identities

Identity is how a finding is matched between base and head. It never contains a line number, so a
finding that only moves stays baselined. The comparison key is already
`tool, rule, path, symbol, identity, classification, metric name`; "identity" below is what each
tool adds on top of rule and path.

| Tool                                      | Report                     | Ingester                                                      | Classification                                          | Identity                                                                                                            |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PMD (`pmd`)                               | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                       | enforceable: every reported violation                   | The rule's message text (PMD names the offending field, method or variable in it). Repeats get `#2`, `#3` in order. |
| SpotBugs (`spotbugs`)                     | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                       | enforceable: every reported bug                         | SpotBugs' message arguments (class, method or field, called method). Repeats get `#2`, `#3` in order.               |
| google-java-format (`google-java-format`) | file list from `--dry-run` | `ingestFormatCheck` (new, `adapters/ingest/format-check.mjs`) | enforceable                                             | The constant `format`; the file path is the key. One finding per unformatted file.                                  |
| JaCoCo (`jacoco`)                         | XML                        | `ingestJacoco` (X6)                                           | descriptive: `line-coverage` metric, `uncovered-method` | As in X6: class and method name plus descriptor.                                                                    |

Notes on the glue in `java-reports.mjs`:

- **Paths.** PMD writes absolute `file://` URIs; SpotBugs writes paths relative to a source root
  (`demo/Bad.java`); JaCoCo writes package-relative paths. All become project-relative
  (`src/main/java/demo/Bad.java`). `manifest.json` lists the project's source roots, and a relative
  report path is attached to the root where the file exists.
- **Identity injection.** Neither tool emits `partialFingerprints`. The glue sets one
  (`nitpicker/subject`) from the message text (PMD) or message arguments (SpotBugs), so the SARIF
  ingester's `fp:` identity path is used and the line is never involved. The alternative, the
  ingester's default hash of rule, path and symbol, would treat two different unused fields in one
  file as indistinguishable repeats; matching by what the finding is about is more precise.
- **SpotBugs level.** SpotBugs marks lower-confidence findings with SARIF level `note`, which the
  SARIF ingester would classify as report-only. The preset instead fixes the threshold in the init
  script (`-medium`) and treats everything the tool reports as enforceable.
- **Sources of weakness.** Identity from message text breaks if a tool version changes a message
  (pinned versions make this a deliberate bump, and the bump shows up as old findings resolved and
  new ones appearing, which the gate then flags: re-baseline on a tool bump). Hashed identities
  (JaCoCo, Checkstyle, SARIF hash fallback) include the path, so the rename map from git cannot
  remap them: a renamed file with such findings shows them as resolved plus new. `format` and
  `fp:` identities carry no path, so they follow renames.

## Slice 6: duplicates

- **Where it runs.** jscpd is a Node tool, so it is not in the Gradle init script (which this slice
  does not touch). After the Gradle task has written `build/nitpicker/manifest.json`,
  `adapters/java/java-duplicates.mjs` runs the package's own pinned jscpd (the one the TypeScript
  `duplicates` check uses; its version is appended to the analyzer version as `jscpd@x.y.z`) once
  per existing main source root with `--format java --mode mild`, ignoring `build`, `generated`,
  `target` and `out`. Reports go to `build/nitpicker/jscpd/<n>/` and are merged into
  `build/nitpicker/duplicates.json`. Clones across two source roots are not detected. A jscpd
  failure is a tool error like a Gradle failure.
- **Findings.** The same normalizer as the TypeScript check (`normalizeDuplicates`), tool name
  `duplicates`: `duplicate-clone` (enforceable, one per clone) and `duplicate-clone-size`
  (descriptive metrics `lines` and `tokens`). There is no extra threshold:
  jscpd's defaults (5 lines, 50 tokens) apply, as for TypeScript.

| Tool                 | Report                      | Ingester                                              | Classification                                                    | Identity                                                                                                                                                  |
| -------------------- | --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jscpd (`duplicates`) | jscpd JSON, per source root | `normalizeDuplicates` (TypeScript `duplicates` check) | `duplicate-clone` enforceable; `duplicate-clone-size` descriptive | Sorted file pair, a hash of the cloned text, and the n-th occurrence of that pair; the size metrics use pair, occurrence and metric name. No line number. |

Editing the cloned text changes its hash, so a clone that was changed (not only moved) counts as a
resolved plus a new finding, as in the TypeScript check.

## Slice 1: what is deliberately not included

- ArchUnit, CRAP via lizard, jscpd, PIT: slices 4 to 7.
- Multi-module reporting beyond "each project writes its own `build/nitpicker`": the e2e test and
  the ingestion cover a single project. `nitpickerJava` is registered in subprojects, but the Nitpicker
  side reads one project root.
- Custom PMD rules: the default ruleset is `category/java/errorprone.xml` plus
  `category/java/bestpractices.xml`; a consumer can place `config/pmd/ruleset.xml` in the root
  project. A `layout`-style config key for this is still open (slice 2 did not add one).
- Kotlin or Groovy sources, Maven.

## Tests

- `adapters/java/java-reports.test.mjs`: fast, always on. Report conversion, project-relative paths,
  classification, line-shift stability.
- `adapters/java/java-preset.e2e.test.mjs`: gated behind `NITPICKER_JAVA_E2E=1` (`npm run test:java`
  in `typescript/`). Needs Java 21, Gradle and network access to Maven Central; about 85 seconds
  warm. On a tiny Gradle project (`adapters/java/fixtures/gradle-project`, one legacy PMD and
  SpotBugs violation on the base) it checks: a clean change passes; a change that only moves the
  legacy violation stays baselined; a change adding an empty catch block (PMD), a default-charset
  `String` (SpotBugs) and misformatted code fails with exactly those three findings as new.
- The conformance suite (`npm run test:conformance`) already covers the comparison itself. The
  Java-specific part of X11's done criterion ("passes the conformance suite") is that the findings
  produced here satisfy the findings schema, which `collectJavaFindings` enforces on every run via
  `parseAnalyzerReport`.
