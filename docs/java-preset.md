# Java preset

Status: slices 1 (ticket X11), 2 (ticket J2), 3 (ticket J3), 4 (ticket J4), 5 (ticket J5), 6 (ticket J6), 7 (ticket J7) and 8 (ticket J8) implemented; later slices are planned below. The scope is a proposal
pending owner review.

The Java preset runs the same differential gate as the TypeScript preset on a Gradle project: run
the tools on the merge base and on head, turn each report into findings
([`spec/findings.schema.json`](../spec/findings.schema.json)), and fail only on new enforceable
findings. The comparison is the language-neutral core (`compareFindings`, rename map from git),
which the conformance suite in [`spec/conformance`](../spec/conformance/README.md) covers. The Java
side contributes only two things: producing reports, and converting them into findings.

## How it works

```
gradle -I languages/java/gradle/nitpicker.init.gradle nitpickerJava   (per snapshot: base, head)
  -> build/nitpicker/{pmd.sarif, spotbugs.sarif, format.txt, jacoco.xml, checkstyle.xml, checkstyle-test.xml, archunit/*.xml, spring-arch.json, structure.json, duplicates.json, pit/mutations.xml, jdeps.txt, jdeps-classes.txt, manifest.json}
  -> languages/java/adapters/java-reports.mjs          (readJavaFindings, via the ingesters)
  -> languages/java/adapters/spring/java-spring.mjs    (spring findings read straight from application*.properties/yml, no Gradle report; only when manifest.json says spring: true)
  -> compareFindings(base, head, renames)               (languages/java/adapters/java-diff.mjs)
```

- **Gradle side: `languages/java/gradle/nitpicker.init.gradle`.** (It lives inside the npm package
  directory so that `files` can ship it; slice 1 had it at `java/` in the repository root.)
- **Gradle side, continued.** An init script, not a plugin: the consumer build is
  not edited, and the base snapshot (a git worktree of the merge base) is analyzed with exactly the
  same tools and versions as head, even if the base predates any adoption. It registers
  `nitpickerJava` in every project that applies the `java` plugin. Every tool version is pinned
  exactly in one map at the top of the file (PMD 7.7.0, SpotBugs 4.9.3, google-java-format 1.25.2,
  JaCoCo 0.8.12, Checkstyle 10.21.1). Tools run from their own configurations (`nitpickerPmd` and so on), so they never
  touch the consumer's compile classpath. The task writes only below `build/nitpicker/`; that
  directory is the contract between the two sides.
- **Nitpicker side: `languages/java/adapters/`.** `runJavaPreset` runs the task,
  `readJavaFindings` converts the reports, `runJavaDiff` does worktrees, rename map, comparison.
  `languages/java/adapters/java-analyzer.mjs` wraps all of it as one analyzer named `java` for the CLI (slice
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
| 3   | Checkstyle               | Checkstyle XML via the Gradle `checkstyle` plugin                | `ingestCheckstyle` (X6) as is                                                                            | done    |
| 4   | ArchUnit                 | ArchUnit rules as JUnit tests; JUnit XML failures                | new small ingester: one enforceable finding per violated rule and offending class                        | done    |
| 5   | CRAP                     | structure metrics for complexity, JaCoCo for per-method coverage | new `crap` ingester joining both; same rules as the TypeScript `crap` check (limit 9)                    | done    |
| 6   | Duplicates               | jscpd with the `java` format, JSON report                        | new ingester: `duplicate-clone` and `duplicate-clone-size`, as in the TypeScript `duplicates` check      | done    |
| 7   | Mutation                 | PIT, XML report                                                  | new ingester: `mutant-survived`, `mutant-nocoverage` enforceable, summary descriptive (see X10)          | done    |
| 8   | Gate on changed coverage | JaCoCo with changed line ranges from git                         | `changed-branch-coverage` equivalent (needs a head-vs-base line mapping, not a per-report ingester)      | this PR |

PMD and SpotBugs appear before the other tools because both emit SARIF 2.1.0 and need no new
ingester. Slices 4 to 7 need Java-specific tooling (Gradle test task wiring, Node
for jscpd, a long-running PIT) and each is expensive enough to deserve its own review. Slices 5 and
8 depend on slice 1's JaCoCo output.

## Slice 4: ArchUnit

- **What runs.** The project's own ArchUnit rules, executed as JUnit tests by the init script's
  `nitpickerArchunit` task (a `Test` task on the project's test classes and runtime classpath,
  JUnit Platform, `ignoreFailures`). The project must have `archunit-junit5` (or any ArchUnit
  setup running on the JUnit Platform) on its test classpath; Nitpicker adds no dependency and so
  pins no ArchUnit version (the version map is unchanged). Test classes named `*ArchTest` or
  `*ArchitectureTest` are selected; `-Pnitpicker.archunit.includes=<Gradle class patterns,
comma-separated>` changes that. Those classes are excluded from the regular `test` task in
  Nitpicker runs, so a violated rule produces findings instead of failing the JaCoCo step. No
  matching classes means no `build/nitpicker/archunit` directory and no findings.
- **Report.** Gradle's JUnit XML, one file per test class, in `build/nitpicker/archunit/`.
  `manifest.json` additionally lists `testSourceRoots`.
- **Ingester.** `languages/java/ingest/archunit.mjs` (`ingestArchunit`). Per failed test case it parses
  the violation lines of the assertion message (`Method <a.B.run()> calls ... in (B.java:12)`) and
  groups them by the offending class, the class owning the first `<...>` element. One enforceable
  finding per rule and offending class. Findings are anchored at that class's source file
  (project-relative, found in the main or test source roots), else at the test class that declares
  the rule.
- **Identity.** Rule: the test case name (the `@ArchTest` field or method name). Identity: the
  fully qualified offending class (nested classes as `a.B$C`). Line numbers (`in (B.java:12)`), the
  number of violations and the violation text never take part, so edits above a violation keep it
  baselined. The message carries the count and the first violation, without its line.
- **Failures that are not violations.** A failed or errored test case without ArchUnit violation
  lines (the rule could not run, classes could not be imported) becomes one enforceable
  `test-failure` finding for that rule, identity `<test class>:test-failure`.
- **Known limit.** Because the finding is per class, a second violation of the same rule in a class
  that already violated it on the base is not new. This follows the slice definition (one finding
  per rule and offending class); a per-dependency identity would catch it but would make identities
  depend on the exact violation text.
- **Tests.** `ingesters.test.mjs` (sample report `fixtures/archunit-junit.xml`, schema validity,
  line-shift stability), `java-reports.test.mjs` (glue, path resolution), and a gated e2e case
  (`adapters/java`: a class and a nested class using `java.util.Date` against the fixture's
  `ArchitectureTest` rule).

## Slice 7: mutation with PIT

- **Profile.** As decided in [`mutation-testing.md`](mutation-testing.md) (X10): one default
  profile, no wider scope, no score gate. Every main class of the Gradle project is mutated (the
  packages found in the compiled main classes), against the project's own tests. The only profile
  can produce enforceable findings.
- **What runs.** `nitpickerPit` runs the pinned `pitest-command-line` (1.17.4) with the
  `pitest-junit5-plugin` (1.2.1), default mutators, XML output, two threads, to
  `build/nitpicker/pit/mutations.xml`. Tests are named class by class (`--targetTests`), and
  `--mutableCodePaths` limits mutation to the main classes. The JUnit Platform is not pinned by
  Nitpicker: the plugin's own platform dependencies are excluded and the project's are used, with a
  launcher of the project's engine version added when the project does not declare one. PIT
  requires a green test run: a failing test suite fails the task, which is a Gradle failure
  (`tool-error` on the CLI path). Projects without main classes produce no report and no findings.
  JUnit 5 (Jupiter) projects are the tested case; JUnit 4 projects are not covered by the e2e test.
- **Ingester.** `languages/java/ingest/pit.mjs` (`ingestPit`). PIT statuses map to the names the
  Stryker-based area uses: `SURVIVED` and `NO_COVERAGE` give enforceable `mutant-survived` and
  `mutant-nocoverage`; `TIMED_OUT`, `MEMORY_ERROR`/`RUN_ERROR`, `NON_VIABLE` and `STARTED` give
  descriptive `mutant-timeout`, `mutant-runtimeerror`, `mutant-compileerror`, `mutant-ignored`;
  killed mutants produce no finding. `mutation-summary` carries one descriptive count per status
  (`path` `.`, identity `status:<Status>`).
- **Identity.** `<mutated class>|<method><descriptor>|<mutator>|<description>#<n>`. There is no
  line number: `n` is the mutant's position among those with the same key and status, ordered by
  line and then block index, so the numbering follows source order and not PIT's (multi-threaded)
  report order. Edits above a mutant keep it; a second identical mutation in the same method is a
  new occurrence. Removing the first of two identical mutants renumbers the second, which the gate
  then shows as one resolved and one new; this mirrors the TypeScript area's occurrence counter.
  Unlike Stryker, PIT's report has no source text for the mutant, so the key cannot include a hash
  of the mutated expression.
- **Path.** The source file of the mutated class, found under the manifest's source roots from the
  class's package and PIT's `sourceFile`. Mutants of classes without a source file there
  (generated code) are skipped.
- **Tests.** `ingesters.test.mjs` (sample report `fixtures/pit-mutations.xml`), `java-reports.test.mjs`
  (glue), and gated e2e cases: a tested change with a surviving boundary mutant fails; the clean
  change now adds a test for its new method, because new untested code is a new `mutant-nocoverage`.

## Slice 2: CLI and reporter integration

- **Selection.** Explicit only: `"preset": "java"` in `nitpicker.config.json`. There is no
  auto-detection of `build.gradle`: a repository with both a `package.json` and a Gradle build
  would otherwise change meaning silently. Without the key, nitpicker runs the TypeScript preset as
  before. The key is read from the head checkout and applies to both snapshots, like the rest of
  the config.
- **One analyzer, several tools.** The preset is a single analyzer, `java` (one Gradle run per
  snapshot), whose findings carry the tool names `pmd`, `spotbugs`, `google-java-format`, `jacoco`,
  `checkstyle` (slice 3), `archunit` (slice 4), `crap` (slice 5), `duplicates` (slice 6), `pit` (slice 7) and `spring` (configuration files, below). The analyzer declares them as
  `reportedTools` (a finding for a tool that is neither the analyzer nor a declared one is an error).
  Its version is the pinned tool versions from the init script, its configuration hash covers the
  init script and the Java adapter files, so a tool bump invalidates the base cache.
- **Everything else is shared.** `nitpicker`, `--all`, `--base`, `--output`, `--defer-exit`,
  `cache publish` and `nitpicker aggregate` take the same path as for TypeScript, so the exit codes
  (0 pass, 1 new enforceable findings, 2 tool error), the console summary, `new-findings.json`,
  `summary.json`, `report.sarif` and `report.junit.xml` are the ones described in the CLI README.
- **Gradle failure.** `languages/java/adapters/java-runner.mjs` catches any failure of the preset on a
  snapshot and returns one finding, `java/gradle-failure` with classification `tool-error`, whose
  message is Gradle's diagnostic output. The comparison turns it into a tool error for that
  snapshot (`base` or `head`), skips the comparison for the analyzer and exits with 2; nothing
  throws and no partial result is compared.
- **Gradle binary.** The command in `NITPICKER_GRADLE` when it is set; otherwise the analyzed
  project's own wrapper (`gradlew`, or `gradlew.bat` on Windows) when the project root has
  one (a `gradlew` without the executable bit runs as `sh gradlew`); otherwise `gradle` from the PATH
  (through the shell on Windows, where it is `gradle.bat`). The wrapper is looked up in each snapshot's
  project root (base and head are separate worktrees), so each side runs the Gradle version it pins.
  The wrapper downloads the Gradle distribution named in the head snapshot's
  `gradle-wrapper.properties`, and base and head each use their own wrapper.
- **Config keys.** `base`, `disable` and `analyzers` work as before. `thresholds`, `exclude` and
  `legacyInventory` are shared with the TypeScript preset (`shared/config.mjs`,
  `head-policy.mjs`, `legacy-inventory.mjs`) and reach the Java runner as arguments, so they are
  part of the analyzer's configuration hash:
  - `thresholds.crapLimit` replaces the default CRAP limit (from `shared/policy.mjs`), and
    `fileLines`, `testFileLines` and `folderFiles` the file limits, which count the `.java` files of
    the main and test source sets (branch coverage and duplicates have fixed limits). Line length
    is Checkstyle's; `thresholds.lineLength` is a config error.
  - `exclude` drops findings whose project-relative path matches a glob (`**`, `*`, `?`, `{a,b}`);
    the tools still run on those files.
  - `legacyInventory` (default `nitpicker.legacy.json`) lists existing sites as
    `{ "file", "rule", "source", "count" }`, where `source` is the finding's `identity`. Up to
    `count` enforceable findings per site are baselined on both snapshots, read from the head's
    inventory. Head fails with `baseline-expansion` for any site whose count is higher than on base
    (a new site counts as 0 before).
  - `exceptions` lifts one rule for some paths: `{ "rule", "paths", "reason" }`, where `rule` is the
    finding as printed, `<tool>/<rule>` (for example `pmd/UnusedPrivateField`), and `tool` is one of
    the tools the Java analyzer reports. Matching findings are dropped on both snapshots. The shared
    `file-lines-limit` and `folder-files-limit` rules are named as they are. Each exception is listed
    in the report and changes the configuration hash.
  - `layout` and `tools` configure TypeScript source roots and tool configs; they have no Java
    meaning and stay a config error with `"preset": "java"` instead of being ignored.
- **Packaging.** The init script moved to `languages/java/gradle/` and `languages/**` is in the npm `files`;
  the packed-contents test and the installed-package test assert that `languages/java/gradle/nitpicker.init.gradle`
  ships.
- **Tests.** `core/java-cli.test.mjs` drives the CLI with a fake `gradle` (`languages/java/adapters/fixtures/fake-gradle.mjs`),
  so it runs without Java: pass, new finding in text/JSON/SARIF/JUnit, Gradle failure on head and
  on base, missing binary, `--all`. The real Gradle run stays behind `NITPICKER_JAVA_E2E=1`
  (`npm run test:java`), unchanged.

## Slice 1: tools, reports and identities

Identity is how a finding is matched between base and head. It never contains a line number, so a
finding that only moves stays baselined. The comparison key is already
`tool, rule, path, symbol, identity, classification, metric name`; "identity" below is what each
tool adds on top of rule and path.

| Tool                                      | Report                     | Ingester                                                            | Classification                                          | Identity                                                                                                            |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PMD (`pmd`)                               | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                             | enforceable: every reported violation                   | The rule's message text (PMD names the offending field, method or variable in it). Repeats get `#2`, `#3` in order. |
| SpotBugs (`spotbugs`)                     | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                             | enforceable: every reported bug                         | SpotBugs' message arguments (class, method or field, called method). Repeats get `#2`, `#3` in order.               |
| google-java-format (`google-java-format`) | file list from `--dry-run` | `ingestFormatCheck` (new, `languages/java/ingest/format-check.mjs`) | enforceable                                             | The constant `format`; the file path is the key. One finding per unformatted file.                                  |
| JaCoCo (`jacoco`)                         | XML                        | `ingestJacoco` (X6)                                                 | descriptive: `line-coverage` metric, `uncovered-method` | As in X6: class and method name plus descriptor.                                                                    |

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

## Slice 3: Checkstyle

- **Gradle side.** The init script applies the Gradle `checkstyle` plugin (version pinned in the
  map, `checkstyle: 10.21.1`) and makes `nitpickerJava` depend on `checkstyleMain` and
  `checkstyleTest`. `ignoreFailures` is on and the XML reports are written to
  `build/nitpicker/checkstyle.xml` (main sources) and `build/nitpicker/checkstyle-test.xml` (test
  sources, absent without any); the HTML report is off.
- **Configuration.** The preset uses `google_checks.xml` from the pinned
  Checkstyle jar, which matches google-java-format, with `MissingJavadocMethod` and
  `MissingJavadocType` suppressed (`languages/java/gradle/checkstyle-suppressions.xml`): Javadoc is
  allowed on public API but not required, the same rule as the TypeScript preset. Javadoc that is
  there still has to be well formed. Decision to review: google_checks is noisy on
  code that was never written for it, but the gate is differential, so existing violations stay
  baselined and only new ones fail.
- **Ingestion.** `ingestCheckstyle` (X6) unchanged, `tool` `checkstyle`, absolute file paths made
  project-relative. Severities `error` and `warning` are enforceable, `info` is descriptive.

| Tool                      | Report         | Ingester           | Classification                                         | Identity                                                                                                                                                                                                                   |
| ------------------------- | -------------- | ------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkstyle (`checkstyle`) | Checkstyle XML | `ingestCheckstyle` | enforceable (`error`, `warning`); descriptive (`info`) | Hash of check class (rule), path and message text; repeats of the same message in a file get `#2`, `#3` in order. No line number; the path is part of the hash, so a renamed file shows its findings as resolved plus new. |

Messages that embed a measured value (for example "found 120" in a line-length violation) change
identity when the value changes: editing such a line counts as a resolved plus a new finding.

## Slice 5: CRAP

- **Complexity source.** `StructureMetrics.java` (the `nitpickerStructure` task, see
  [Structure limits (SH5)](#structure-limits-sh5)) writes the
  cyclomatic complexity of each method and constructor into `build/nitpicker/structure.json`
  (`complexity`), so the CRAP check needs no tool beyond the JDK that runs Gradle. It is
  McCabe's count: 1 plus each `if`, `for`, enhanced `for`, `while`,
  `do`, `catch`, `?:`, `&&`, `||` and each `case` that is not a default one (an arrow case and a case with
  several constants count once; `default` and `case null, default` count 0). Lambda bodies count towards the
  enclosing method; members of nested and anonymous classes are methods of their own.
- **Ingester.** `ingestCrap` (`languages/java/ingest/crap.mjs`) joins those methods with the JaCoCo
  report (same `jacoco.xml` as slice 1). A JaCoCo method belongs to a method of `structure.json` when
  the file, the method name (`<init>` is the class name) and the line match: the method's first line
  lies in the method's line range. This also joins methods of anonymous classes. Lambdas and
  `<clinit>` have no entry of their own and stay out of the join (a lambda body counts
  toward its enclosing method's complexity but not toward its coverage).
- **Private empty constructors.** `private Util() {}` (also with an explicit `super();`), the
  utility-class idiom, is flagged `privateEmptyConstructor` in `structure.json` and left out of the
  join. JaCoCo leaves such a constructor out of its report only in some cases (inner classes, enums,
  classes with field initializers, and a superclass other than `Object`), so it would often be
  `crap-coverage-unknown`. Dropping it when JaCoCo does report it is harmless: its complexity is 1,
  which can never exceed the CRAP limit.
- **Rules, as in the TypeScript `crap` check.** `crap = ccn^2 * (1 - coverage)^3 + ccn`, where
  coverage is the lower of the method's JaCoCo line coverage and branch coverage (whichever have
  counters). `crap-score-limit` (enforceable) when `crap >= 9`: a method at exactly the limit
  fails, as it does for TypeScript. `crap-coverage-unknown` (enforceable) when no JaCoCo method
  matches or the method has neither line nor branch counters. Only violations are findings; the
  per-function metric findings of the TypeScript check are not produced.
- **Identity.** `function:<signature>`, for example `function:Calc.classify(int, int, String)`:
  enclosing classes, method and parameter types (`signature` in `structure.json`), never a line.
  Repeats (anonymous classes) get `#2`, `#3` in report order. The path
  is part of the comparison key, so, as with the hashed identities of slice 1, a renamed file shows
  its findings as resolved plus new. Changing a method's parameters is a different function, as in
  the TypeScript check, where an edit that moves a function changes its identity too.
- **Tests.** `languages/java/ingest/crap.test.mjs` against the committed samples
  `fixtures/structure.json` and `fixtures/jacoco-crap.xml`; `java-reports.test.mjs` covers the glue;
  the gated e2e test has a case adding a ten-branch untested method.

## Slice 6: duplicates

- **Where it runs.** jscpd is a Node tool, so it is not in the Gradle init script (which this slice
  does not touch). After the Gradle task has written `build/nitpicker/manifest.json`,
  `languages/java/adapters/java-duplicates.mjs` runs the package's own pinned jscpd (the one the TypeScript
  `duplicates` check uses; its version is appended to the analyzer version as `jscpd@x.y.z`) once
  per existing main source root with `--format java --mode mild` and a nitpicker-owned `--config`
  (a project's `.jscpd.json` is not read), ignoring `build`, `generated`, `target` and `out`. Reports go to `build/nitpicker/jscpd/<n>/` and are merged into
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

## Slice 8: gate on changed coverage

- **Tool and report.** No new tool: the JaCoCo XML of slice 1 already has, per source line, the
  covered and missed branch outcomes (`<line nr mb cb>`). The init script is unchanged.
- **Findings.** `ingestJacocoBranches` (`languages/java/ingest/jacoco-branches.mjs`) emits one enforceable
  `jacoco` / `changed-branch-coverage` finding per source line whose covered branch outcomes are
  below 95% (the TypeScript check's minimum); lines without branches are never reported. It runs on
  both snapshots, so a branch that is uncovered on the base is baselined like any other finding.
- **What makes it "changed": the head-vs-base line mapping.** The differential comparison already
  maps head lines to the merge base through `git diff --unified=0` (`readChangedLines`, used for
  the strict-preset rules). `touchedCode.isStrictRule(rule, finding)` now also answers true for
  this rule when the finding comes from `jacoco` (`languages/java/adapters/touched-rules.mjs`), so an
  uncovered branch whose head line lies in a changed range, or in an added file, is new even if
  the base had it. An uncovered branch on an unchanged line stays baselined. The library entry
  `runJavaDiff` passes the same `touchedCode` as the CLI path. The TypeScript check of the same
  rule name is unaffected (its identity keys on branch source; the predicate is tool-scoped).
- **Identity.** A hash of the line's source text (trimmed, whitespace collapsed), `branch-source:<16 hex>`,
  with `#2`, `#3` for identical lines in one file, in order. No line number: inserting code above
  keeps the finding baselined (the lines around it are not in a changed range), and a renamed file
  follows the rename map because the path is not part of the hash. Editing the line changes both
  the identity and the changed range, so it is new.
- **Granularity and limits.** JaCoCo reports branch outcomes per line, so a line with several
  branches (`a && b || c`) is judged on all of its outcomes together; a method-level view is not
  used. A line that is only reformatted counts as changed. Lines whose source text is empty after
  trimming are ignored. Coverage comes from the tests of the snapshot being analyzed, so a test
  that is added or removed changes which branches are covered on head.
- **Tests.** `languages/java/ingest/jacoco-branches.test.mjs` (sample report, identity stability,
  baselined / touched / added / moved cases through `compareFindings`); `java-reports.test.mjs`
  for the glue; the gated e2e test adds three cases (moved line baselined, edited line fails, new
  uncovered branch fails while the old one stays baselined).

## Structure limits (SH5)

- **Rules.** The shared structure rule (`shared/rules/structure.mjs`) runs on Java too, so a method
  over 50 lines, 15 statements, control nesting 2 or 3 parameters fails with the same rule ids
  (`function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`,
  `function-parameters-limit`) and the same messages (`{name} has {value} {metric}; limit is
{limit}`, and for nesting `{name} nests control flow {value} deep (limit {limit})`) as TypeScript. `shared/policy.mjs` marks the four rules as enforced for Java; the
  catalog in `spec/checks.md` is generated from it.
- **Metric source (decision to review).** `languages/java/gradle/StructureMetrics.java` parses the main sources
  (parse only, no compilation) with the JDK's compiler tree API (`jdk.compiler`) in single-file
  source mode, run by the JVM that runs Gradle (task `nitpickerStructure`, report
  `build/nitpicker/structure.json`). It needs no dependency and no pin beyond the JDK. A syntax error (for
  example syntax newer than the JVM that runs Gradle) is not skipped: the program prints `file:line` and
  the compiler message of up to five errors and exits with status 1, so the task fails and the run is a
  tool error instead of a report with missing or shortened methods. All four
  metrics come from this one source so they are consistent (the cyclomatic complexity of the CRAP check
  too); a second tool would make two counters disagree. PMD's metrics were rejected (not in the SARIF output, and
  its rules do not expose per-method statements). A small JavaParser step was the alternative; it would add a
  pinned artifact for nothing the JDK does not already provide.
- **Definitions** (the TypeScript analyzer's, so both languages gate the same way). Unit: each
  method and constructor with a body. `lines`: last line - first line + 1, annotations and
  modifiers included, Javadoc not. `statements`: every statement in the body except blocks (`for`
  initializers and updates, `catch` parameters and `try` resources are not statements).
  `maxControlNesting`: deepest nesting of `if`, `for`, enhanced `for`, `while`, `do`, `switch`
  (statement or expression) and `catch`; an `else if` nests like in TypeScript. `parameters`:
  declared parameters. Anonymous, local and member class bodies are separate units and do not count
  towards the method that contains them; lambda bodies count towards the enclosing method.
- **Findings.** `languages/java/adapters/java-structure.mjs` hands the metrics to `evaluateStructure` and keeps
  the enforceable limit findings only (tool `structure`); the per-method descriptive metrics of the
  TypeScript check are not emitted, since they would add four findings per method to every report.
  Name: `Outer.Inner.method` (constructors use the class name; anonymous classes `<anonymous>`),
  identity: name, occurrence among equal names in the file and a hash of the method text with
  indentation removed, no line number. A moved or re-indented method stays baselined; editing a
  method that already violates produces a new finding, as in TypeScript.
- **Cache invalidation.** `StructureMetrics.java`, `java-structure.mjs` and the shared structure
  rule files are in the Java analyzer's configuration hash.
- **Tests.** `java-structure.test.mjs` (fast: limits, messages, identity stability);
  the gated e2e adds a branch with a method over the parameter limit (fails) and keeps a legacy
  oversize method baselined.

## Coupling and stability (ticket SH6)

- **What runs.** The init script's `nitpickerJdeps` task (a dependency of `nitpickerJava`) runs the
  JDK's `jdeps -verbose:class -filter:none` over the main class directories and writes
  `build/nitpicker/jdeps.txt` plus `jdeps-classes.txt` (the main classes, one binary name per line).
  jdeps comes with the JDK that runs Gradle; nothing is downloaded and no version is pinned. The
  block is delimited by `// --- coupling (SH6)` comments in the init script.
- **Conversion.** `languages/java/adapters/java-coupling.mjs` parses the class graph, folds nested classes
  into their top-level class, keeps only edges between two main classes, computes the metrics and
  hands the neutral report to `evaluateCoupling` in `shared/rules/coupling.mjs`. The findings are
  the TypeScript ones: report-only `coupling`, `module-coupling`, `package-coupling` and
  `stability-direction-metric` metrics, and the enforceable `stability-direction` finding
  (`<package> depends on less stable package <package>`), under the tool name `coupling`. The
  policy (`shared/policy.mjs`) marks `stability-direction` as enforced for Java.
- **Same semantics as TypeScript, at Java granularity.** The TypeScript preset's module is a source
  file and its package the top-level directory under the source root; here a module is a source
  file (a top-level class with its nested classes) and a package a Java package. Fan-in and fan-out
  count distinct files, a package's fan-in and fan-out count distinct files outside the package,
  instability is `fanOut / (fanIn + fanOut)`, and a package pair whose source is more stable than
  its target is reported once.
- **Differences.** (1) Java packages are flat: `a.b` and `a.b.c` are different packages, so a
  `stability-direction` finding can appear between a package and its sub-package; TypeScript groups
  by the top-level directory. The default package is `(root)`. (2) jdeps cannot tell type-only from
  runtime references, so the `runtime*` module metrics and the `runtimeDependencies` and
  `typeOnlyDependencies` summaries are not reported. (3) A second top-level class in a file named
  after another class is attributed to `<package>/<Class>.java`, which may not exist; only the
  metric path is affected. (4) Reflection and other references that are not in the bytecode are
  invisible to jdeps. (5) Test classes and library classes are not part of the graph.
- **Baselining.** Identities are `package-edge:<source>-><target>`, `package:<name>:<metric>` and
  `module:<metric>` with the file path, never a line, so an existing violation stays baselined and
  only a new package edge, or a new instability inversion, fails.
- **Tests.** `languages/java/adapters/java-coupling.test.mjs` (parsing, metrics, stability edges, the
  neutral report through the shared rule), `java-reports.test.mjs` (glue), and two gated e2e cases
  (a package depending on a less stable package fails; the same violation on the base stays
  baselined).

## Spring rules

A Gradle project whose compile classpath has `spring-context` or `spring-boot` gets nitpicker's
Spring ruleset, [`languages/java/gradle/spring-ruleset.xml`](../languages/java/gradle/spring-ruleset.xml),
added to its PMD run, next to nitpicker's rule set `pmd-ruleset.xml` (and the project's own `config/pmd/ruleset.xml` when
`tools.pmd.precedence` lists `"project"` too). Every
project's PMD run now gets the main and test compile classpaths and the main and test classes as
its auxiliary classpath (`build/nitpicker/pmd-aux-classpath.txt`), so the rules match annotation and
supertype names exactly; `nitpickerPmd` therefore compiles the main and test classes first, and a
test compile error stops it. The manifest records `spring` and the
main `resourceRoots`.

Each rule allows one form and its message names it. A finding prints as `pmd/<rule>`, which is also
the `rule` of a config exception.

| Area          | Rules                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beans         | `SpringConstructorInjection`, `SpringImmutableBeans`, `SpringNoServiceLocator`, `SpringNoLazyInjection`, `SpringLiteConfiguration`, `SpringNoComponentScan`                                                                                                                                                                                                            |
| Configuration | `SpringTypedConfiguration` (no `@Value` outside `@Configuration`, no `System.getenv`/`getProperty` or `Environment.getProperty` in beans), `SpringProfileOnConfiguration`                                                                                                                                                                                              |
| Proxies       | `SpringProxyMethodVisibility`, `SpringProxySelfCall` (both for `@Transactional`, `@Async`, the cache annotations, `@Retryable`, `@PreAuthorize`, `@PostAuthorize`, `@Secured`), `SpringTransactionalAnnotation`, `SpringNoTransactionalController`, `SpringNoRequiresNew`, `SpringNoSwallowedTransactionException`, `SpringAsyncExecutor`, `SpringScheduledFixedDelay` |
| Web           | `SpringComposedMapping`, `SpringRestController`, `SpringValidRequestBody`, `SpringNoCrossOrigin`, `SpringPasswordEncoder`                                                                                                                                                                                                                                              |
| JPA           | `JpaLazyFetching`, `JpaEntityClass`, `JpaManyToManyCascade`, `JpaManyToManySet`, `JpaVersion`, `JpaSequenceIds`                                                                                                                                                                                                                                                        |
| Spring Data   | `SpringDataDerivedQuery` (every declared repository method has `@Query`; inherited methods such as `findById` and `save` stay legal), `SpringDataNativeQuery`, `SpringDataModifyingQuery`, `SpringDataNoSaveInLoop`, `SpringDataNoFlush`, `SpringDataNamedParameters`, `SpringDataQueryTextBlock`                                                                      |

**Inline suppressions.** PMD would let a change silence any rule without review. nitpicker runs PMD
with `--suppress-marker` set to a string no code uses, so `// NOPMD` comments do nothing. PMD still
honors `@SuppressWarnings` with `"PMD..."`, `"all"`, `"unused"`, `"serial"` or `"fallthrough"`, and
evaluates constant expressions there, so nitpicker reports each such annotation, and any whose
arguments are not plain string literals, as `pmd/InlineSuppression` (Node side,
`languages/java/adapters/suppressions/java-suppressions.mjs`, for every Java project; unicode escapes are decoded
and strings and comments skipped first). The one accepted marker is
`@SuppressWarnings("PMD.SpringDataNativeQuery")` on a method: native SQL is sometimes needed, and
the decision belongs on that one method rather than in a config exception that covers paths.
Compiler-only warnings such as `"unchecked"` and `"rawtypes"` are not affected.

SpotBugs has no switch to ignore its annotations, so the same scan reports every annotation
SpotBugs honors as `spotbugs/InlineSuppression`: any name ending in `SuppressFBWarnings`, any
prefixed name ending in `SuppressWarnings` (such as a project's own `@AcmeSuppressWarnings`), and
`edu.umd.cs.findbugs.annotations.SuppressWarnings`; a SpotBugs exception names the bug pattern, for example
`spotbugs/EI_EXPOSE_REP`. Checkstyle's bundled `google_checks.xml` honors
`@SuppressWarnings("checkstyle:...")` and `CHECKSTYLE.OFF`, `CHECKSTYLE.SUPPRESS` comments;
nitpicker writes a copy without those filters (and without the optional xpath suppression file
the bundled config would read from the working directory), so they suppress nothing.

**Project configs are an explicit opt-in.** A project's `config/pmd/ruleset.xml` or
`config/checkstyle/checkstyle.xml` used to replace nitpicker's rules silently. Now they are read only
when `nitpicker.config.json` names them in `tools`, for example
`{ "tools": { "pmd": { "precedence": ["project", "nitpicker"] }, "checkstyle": { "precedence": ["project"] } } }`;
see [Your project's tool configs](usage.md#your-projects-tool-configs). A project config chosen
this way is used as written, including its own suppression filters, and every file under
`config/pmd/` or `config/checkstyle/` goes into the cache key, since a config can reference its
neighbors. The init script reads its `nitpicker.*` Gradle properties from the command line only,
so a `gradle.properties` entry cannot opt in on the project's behalf (`nitpicker.archunit.includes`
is the exception: it only picks which test classes run). It sets the Checkstyle config on the
Checkstyle tasks after the build script runs, so a `checkstyle { configFile = ... }` block in the
project's build does not replace it either.

**Test sources are linted too.** PMD, Checkstyle (`checkstyleTest`, reported in
`build/nitpicker/checkstyle-test.xml`), google-java-format and the inline suppression scan cover
`src/test/java` as well as the main sources, the way the TypeScript preset lints its tests; the
file and folder limits already counted test files. PMD runs nitpicker's own rule set,
[`languages/java/gradle/pmd-ruleset.xml`](../languages/java/gradle/pmd-ruleset.xml): the
errorprone and bestpractices categories without `UnitTestAssertionsShouldIncludeMessage` and
`UnitTestContainsTooManyAsserts`, which set an assertion style the TypeScript preset does not have,
plus design's `AvoidCatchingGenericException` (no `catch (Exception e)`, `RuntimeException` or
`NullPointerException`; errorprone already covers `Throwable`), as the TypeScript and Python presets
forbid broad catches. A test with no assertion still fails (`UnitTestShouldIncludeAssert`, which
also counts MockMvc's `andExpect`), and a class named like a test but without test methods fails
(`TestClassWithoutTestCases`), except `*ArchTest` and `*ArchitectureTest` classes, which hold
ArchUnit rules. The Spring rule set reads main sources only: the init script wraps it in
`build/nitpicker/pmd-spring-main.xml` with an exclude pattern per test source directory, since
field injection and package-private test methods are the norm in tests. A PMD rule that flags
legitimate test code, such as `SystemPrintln` in a test of console output, takes an exception like
any other: `{ "rule": "pmd/<rule>", "paths": [...],
"reason": "..." }`. PMD messages that name a line ("first occurrence is on line 12") lose the number
in the finding's identity, so moving code does not re-report them. SpotBugs, the structure limits
and CRAP stay on main code, as in the TypeScript preset.

**Exceptions.** Every Spring message except `SpringDataNativeQuery` ends with the exception to add
when the code is right, for example `{ "rule": "pmd/SpringDataNoSaveInLoop", "paths": [...],
"reason": "..." }`.

**Limits.** Rules are per file. `JpaVersion` checks the root of each entity hierarchy: an `@Entity`
without a superclass, or a `@MappedSuperclass` that declares the `@Id`, so the `@Version` field
belongs next to the `@Id`. An entity with a superclass is skipped, because its `@Version` may be
inherited. The JPA rules match `jakarta.persistence` only; `javax.persistence` code gets none of
them. `SpringDataDerivedQuery` leaves redeclared CRUD methods alone (`findById`, `findAll`, `save`,
`deleteById` and the rest of `ListCrudRepository`, `ListPagingAndSortingRepository`,
`JpaRepository` and `QueryByExampleExecutor`), since Spring implements those without parsing the
name, and accepts the `@Query` of the JDBC, R2DBC, MongoDB, Neo4j, Cassandra, Couchbase and
Elasticsearch modules; the other Spring Data rules know only the JPA annotations. Proxy annotations
on interface methods are accepted, because Spring reads them for both proxy kinds.
`SpringProxySelfCall` matches by name and argument count, and skips a call from one `@Transactional`
method to another with a plain `@Transactional` (same transaction). `SpringDataNoSaveInLoop` covers
`for`, `while` and `do` loops and `forEach`, `map` and `peek` callbacks, lambdas and method
references (`forEach(repository::save)`) alike. It and `SpringDataNoFlush` skip a loop that also
calls `EntityManager.clear()`, the JPA batch idiom.
`SpringNoSwallowedTransactionException` reports catching `Exception`, `RuntimeException`,
`Throwable`, `DataAccessException`, `TransactionException` or `PersistenceException`, not narrower
exceptions such as `NumberFormatException`. Layering, entities in controller signatures and test
placement need a cross-class view, which PMD does not have; they are nitpicker's own ArchUnit rules,
described next.

**Tests.** `spring/java-spring.e2e.test.mjs` (gated like the other Java e2e tests and part of
`npm run test:java`) runs PMD through the init script on `adapters/fixtures/spring-project`, whose
sources mark every expected violation with a `// violation: <rule>` comment, and asserts the
reported set equals the marked set. The fixture also holds the legitimate forms each rule must
accept.

## Spring architecture rules

Spring projects (same detection as the Spring ruleset: `spring-context` or `spring-boot` on the
compile classpath, `spring: true` in the manifest) also get nitpicker's own ArchUnit rules. They are
separate from the project's own `*ArchTest` classes of slice 4 and need nothing from the project:
the init script's `nitpickerSpringArch` task resolves ArchUnit 1.5.1 (Apache-2.0, pinned in the
`pinned` map) into its own configuration, compiles the rule classes in
[`languages/java/gradle/archunit/`](../languages/java/gradle/archunit/) with the JDK that runs Gradle
and runs them once, in one separate JVM, over the compiled main and test classes. That is one extra
JVM per side (base and head), a few seconds. The compiled rule classes are cached in the Gradle
user home (`caches/nitpicker/spring-arch/<hash>`, keyed by the rule sources, the ArchUnit version
and the JDK), so `javac` runs only the first time. The report is `build/nitpicker/spring-arch.json`
(format in [internals.md](internals.md)); a Spring project without it is a tool error.

Findings print as `archunit/<rule>`, one per rule, offending class and dependency, on the class's
source file (a nested class counts as its outermost class). The identity is the simple class name
plus the simple name of the dependency or method involved, never a package or a line: a second bad
dependency in an already violating class is new, while moving code, or moving the file to another
package (the move `spring-layout` asks for, tracked as a rename), keeps its legacy findings matched. Every message names the allowed form and ends with the
exception route: `{ "rule": "archunit/<rule>", "paths": [...], "reason": "..." }` in
`nitpicker.config.json`.

**Layout: package by feature, as in the TypeScript preset.** The root package is the package of the
`@SpringBootApplication` class (the common prefix when there are several; without one the layout
rules are skipped and the rest still runs). Its direct sub-packages are features, plus `shared` for
pure utilities. Every root sub-package that is not `shared` and not a layer name counts as a
feature, including technical ones such as `web`, `config`, `security` or `exception`: their
sub-packages are internal to them, and messages name the package ("another root package
`com.shop.web`") rather than calling it a feature. The layout mirrors the TypeScript one: `features/<f>/` with an `index.ts` becomes
`<root>.<feature>` whose top-level classes are the feature's public face, and `shared` is the
TypeScript `shared/` folder.

| Rule                      | Fails when                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring-layout`           | a class sits directly in the root package (only `@SpringBootApplication`, `@Configuration` and `@ConfigurationProperties` classes and a `SpringBootServletInitializer` subclass may), or in a root sub-package named by layer: `controller(s)`, `service(s)`, `repository`/`repositories`, `entity`/`entities`, `model(s)`, `dto(s)`, `dao`, `util(s)`, `common` |
| `spring-feature-boundary` | a class uses a class from a sub-package of another root package (`orders.internal.X` from `billing`); the classes directly in the other package are fine                                                                                                                                                                                                         |
| `spring-shared-pure`      | a `shared` class is a Spring bean (`@Component` and its stereotypes, `@Configuration`) or an `@Entity`, or depends on a class in any other root package                                                                                                                                                                                                          |

**Layering.**

| Rule                           | Fails when                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spring-controller-repository` | a `@Controller` or `@RestController` depends on a repository (`@Repository`, or a type extending Spring Data's `Repository`), in a field, parameter, return type or call                                                                                                                                                                                                             |
| `spring-controller-entity`     | a request-mapping or `@ModelAttribute` method of a controller takes or returns an `@Entity` type, also inside a generic such as `List<Customer>`; methods declared on implemented interfaces (the OpenAPI-generator layout) and inherited from base controllers count                                                                                                                |
| `spring-service-web`           | a `@Service` or repository depends on the web layer: a controller or `@ControllerAdvice`, `ResponseEntity` in its own field, method or constructor signatures (not a `RestTemplate` or `RestClient` result it unwraps), or the `jakarta.servlet`, `javax.servlet`, `org.springframework.web.bind`, `org.springframework.web.servlet` or `org.springframework.web.multipart` packages |

**Tests that start a Spring context.** A concrete test class counts when it, an enclosing class or
one of its superclasses (`class X extends AbstractIntegrationTest`) is annotated, directly or
through a composed annotation, with `@SpringBootTest`, any slice test (`@DataJpaTest`, `@WebMvcTest`, ...; all carry
`@BootstrapWith`), `@ContextConfiguration`, `@SpringJUnitConfig`, `@Testcontainers`, or
`@ExtendWith(SpringExtension.class)`. Annotation types (a composed `@IntegrationTest`) and abstract
base classes are not tests themselves and are never placed.

| Rule                        | Fails when                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring-test-placement`     | such a test is in a package without an `integration` or `it` segment (`shop.orders.integration`, `shop.it`); plain unit tests live anywhere |
| `spring-no-dirties-context` | a test class or method has `@DirtiesContext`, anywhere                                                                                      |

Sources in a separate Gradle source set (`src/integrationTest/java`) are not part of the `test`
source set and are not read at all. A test that sleeps is covered by the test-honesty rules for
Java, not here.

**Limits.** The rules read bytecode, so generated classes without a source file are skipped (no
finding can be placed), and a use of another package's compile-time constant (`static final` of a
primitive or `String`) is invisible, because `javac` inlines its value. A controller that uses the
`EntityManager` directly is not a repository use for `spring-controller-repository`, and a service
reaching the request through the static `RequestContextHolder` is not caught by
`spring-service-web`. Only classes of the `main` and `test` source sets are checked, and only in
the root project. Kotlin modules run the same rules on their compiled classes.

## Spring configuration files

Findings with tool `spring`, produced in Node from the project's `application.properties`,
`application.yml`, `application.yaml` and `application-<profile>.(properties|yml|yaml)`. No JVM and
no new dependency: `spring-config-parser.mjs` flattens properties and YAML (nested maps, dotted
keys, comments, quotes, single-line flow maps and sequences, multi-document files) to dotted keys
with their line, `spring-config-files.mjs` finds the files and their profiles, `spring-secrets.mjs`
decides what counts as a literal secret, and `java-spring.mjs` applies the rules (all in
`languages/java/adapters/spring/`).

- **Spring projects only.** The checks run only when `manifest.json` says `spring: true` (the
  compile classpath has `spring-context` or `spring-boot`, see Spring rules above). Quarkus,
  Micronaut and plain projects also have `application.*` files with other meanings, so they get no
  `spring` findings; a manifest without the key counts as not Spring.
- **Where.** Files directly in a resource root (`manifest.json`'s `resourceRoots` when present, else
  `src/main/resources`) or in its `config/` directory. Without such files there are no findings; a
  file that cannot be read is skipped.
- **Keys.** Compared in relaxed form (lowercase, `-` and `_` removed, `[0]`-style list indexes
  removed), so `open-in-view`, `openInView` and `open_in_view` are the same key and
  `management.endpoints.web.exposure.include[0]=*` is the key `...include`.
- **Profiles.** A document's profile is the file name's (`application-test.yml`) or the
  `spring.config.activate.on-profile` (legacy `spring.profiles`) of its document: a `---` document in
  YAML, a `#---` or `!---` document in a properties file. The plain `application.*` main document has
  none. The expression is split on `, | & ! ( )` and spaces. A document is exempt from a rule only
  when it has at least one profile, every positive token is exempt for that rule, and the expression
  has no `!`. Test profiles are `test` or a name starting with `test`, `it` and `integration-test`;
  local profiles are `local`, `dev` and `development`.
- **True.** Wherever a rule needs `true`, Spring's spellings `true`, `on`, `yes` and `1` count, in
  any case.
- **Rules**, all enforceable. Each message ends with the exception line to add to
  `nitpicker.config.json`.

| Rule (`spring/<rule>`) | Fires on                                                                                                                                          | Exempt profiles  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `open-in-view`         | JPA in the main sources (`jakarta.persistence` or `javax.persistence` import) and `spring.jpa.open-in-view` unset, or true                        | test             |
| `ddl-auto`             | `spring.jpa.hibernate.ddl-auto` or `spring.jpa.properties.hibernate.hbm2ddl.auto` other than `none`/`validate`, or `spring.jpa.generate-ddl` true | test, local, dev |
| `risky-startup-flags`  | `spring.main.allow-circular-references`, `allow-bean-definition-overriding` or `lazy-initialization` true                                         | test             |
| `actuator-exposure`    | `management.endpoints.web.exposure.include` containing `*`                                                                                        | test, local, dev |
| `error-details`        | `server.error.include-stacktrace` set to `always` or `on-param`                                                                                   | test, local, dev |
| `literal-secret`       | a literal value under a key whose last segment is, or ends in a separate word that is, a secret word (below)                                      | test, local, dev |

- **Literal secrets.** The last key segment, split into words at `-`, `_` and case changes, must
  end in `password`, `secret`, `token`, `credentials`, `api-key` (or `apikey`), `private-key`,
  `secret-key` or `access-key`, so `db-password`, `client-secret` and `jwtSecret` match while
  `password-file`, `token-validity-seconds` and `passwords` do not. Settings
  such as `app.require-password=true` are not judged, because booleans (`true`, `false`, `on`,
  `off`, `yes`, `no`) and numbers never count. Also not judged: empty values, YAML `null` and `~`,
  aliases (`*ref`), Maven filtering (`@db.password@`), Jasypt (`ENC(...)`), encrypted or hashed
  prefixes (`{cipher}`, `{bcrypt}`, `{pbkdf2}`, `{scrypt}`, `{argon2}`, `{sha256}`), SpEL
  (`#{...}`) and placeholders: `${DB_PASS}` and `${DB_PASS:}` pass while `${DB_PASS:hunter2}` fires
  on its default. For keys ending in `token`, a single lowercase word such as `header` is read as a
  setting, not a token (`feature.reset-token=header`), so a real token that is one lowercase word
  is missed; `{noop}secret` and every other literal fire. The message names the key and the
  environment variable Spring binds to it (`spring.datasource.password` reads
  `SPRING_DATASOURCE_PASSWORD`), or asks to drop a placeholder's literal default; never the value.
- **Anchor and identity.** Findings sit at the offending key's line (`location`). A missing
  `open-in-view` is one finding at the main `application.*` file with no line; a directory with only
  profile files (`application-test.yml`, `application-prod.yml`) has none. Identity is the relaxed
  key (plus `#2`, `#3` for repeats in one file); never the line, and never a secret's value.
- **Exceptions.** The printed id works in `exceptions`, for example
  `{ "rule": "spring/open-in-view", "paths": ["src/main/resources/**"], "reason": "..." }`.
- **Limits.** Placeholders (`${...}`) are not judged, except the default of a literal-secret
  value. YAML anchors and aliases are not resolved: `base: &b` followed by a nested map keeps
  its nesting, but `<<: *b` merges and `*ref` values are not expanded. A flow map or sequence that
  continues on later lines (`include: [` ... `]`), multi-line quoted or plain scalars (their
  continuation lines are skipped) and `? ` complex keys are not read; a YAML list of maps is
  skipped. Profile groups, `spring.config.import` files and `spring.profiles.active` are not
  followed.
- **Tests.** `spring-config-parser.test.mjs` (properties and YAML parsing, line endings, byte
  order mark, continuations, escapes, indexes, flow collections, anchors), `spring-secrets.test.mjs`
  (key words, value judgement), `java-spring.test.mjs` (relaxed keys, open-in-view, ddl-auto,
  profile expressions, line stability, exceptions, the configuration hash), `java-spring-rules.test.mjs`
  (the other rules) and `java-reports.test.mjs`
  (glue, the `spring: true` gate).

## Slice 1: what is deliberately not included

- Nothing from the proposed slices 4 to 8 is left out: ArchUnit, CRAP, jscpd, PIT and the changed-line
  branch-coverage gate are described in their own sections.
- Multi-module reporting beyond "each project writes its own `build/nitpicker`": the e2e test and
  the ingestion cover a single project. `nitpickerJava` is registered in subprojects, but the Nitpicker
  side reads one project root.
- Kotlin sources (see [kotlin-preset.md](kotlin-preset.md)), Groovy sources, Maven.

## Tests

- `languages/java/adapters/java-reports.test.mjs`: fast, always on. Report conversion, project-relative paths,
  classification, line-shift stability.
- `languages/java/adapters/java-preset.e2e.test.mjs`: gated behind `NITPICKER_JAVA_E2E=1` (`npm run test:java`, which also runs `java-spring.e2e.test.mjs`, `spring-arch/spring-arch.e2e.test.mjs` and `escape-hatches.e2e.test.mjs`, one file at a time because each stops the Gradle daemons when it ends). Needs Java 21, Gradle and network access to Maven Central; about 85 seconds
  warm. On a tiny Gradle project (`languages/java/adapters/fixtures/gradle-project`, one legacy PMD and
  SpotBugs violation on the base) it checks: a clean change passes; a change that only moves the
  legacy violation stays baselined; a change adding an empty catch block (PMD), a default-charset
  `String` (SpotBugs) and misformatted code fails with exactly those three findings as new.
- The conformance suite (`npm run test:conformance`) already covers the comparison itself. The
  Java-specific part of X11's done criterion ("passes the conformance suite") is that the findings
  produced here satisfy the findings schema, which `collectJavaFindings` enforces on every run via
  `parseAnalyzerReport`.
