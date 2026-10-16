# Java preset

Status: slices 1 (ticket X11), 2 (ticket J2), 3 (ticket J3), 4 (ticket J4), 5 (ticket J5), 6 (ticket J6), 7 (ticket J7) and 8 (ticket J8) implemented; later slices are planned below. The scope is a proposal
pending owner review.

The Java preset runs the same differential gate as the TypeScript preset on a Gradle or Maven
project (see [Maven builds](#maven-builds)): run
the tools on the merge base and on head, turn each report into findings
([`spec/findings.schema.json`](../spec/findings.schema.json)), and fail only on new enforceable
findings. The comparison is the language-neutral core (`compareFindings`, rename map from git),
which the conformance suite in [`spec/conformance`](../spec/conformance/README.md) covers. The Java
side contributes only two things: producing reports, and converting them into findings.

## How it works

```
gradle -I languages/java/gradle/nitpicker.init.gradle nitpickerJava   (per snapshot: base, head; Maven builds: see below)
  -> <report dir>/modules.json and, per Gradle project that applies java, <report dir>/<key>/{pmd.sarif, spotbugs.sarif, format.txt, jacoco.xml, checkstyle.xml, checkstyle-<source set>.xml, archunit/*.xml, structure.json, pit/mutations.xml, jdeps.txt, jdeps-classes.txt, javac-lint.txt, forbidden-apis.txt, cpd.xml, dependencies.json, permits.txt, manifest.json}
  -> languages/java/adapters/reporting/java-reports.mjs       (readJavaFindings, via the ingesters)
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
  touch the consumer's compile classpath. Nitpicker passes `-Pnitpicker.reportDir=<dir>`, a
  temporary directory outside the project, and the task writes only below it, one subdirectory per
  Gradle project (layout in [internals.md](internals.md#java-report-directory)). A build script
  that writes to `build/nitpicker` therefore changes nothing nitpicker reads. Run by hand without the property, the task
  writes to `build/nitpicker/` of each project.
- **Multi-project builds.** Every project that applies the `java` plugin is analyzed, the root
  included when it applies it; paths in findings are relative to the directory Gradle runs in, so a
  subproject's findings carry its folder (`lib/src/main/java/...`). A build where no project applies
  the plugin, or a project whose reports are missing, is a tool error, never a pass. Projects of
  an `includeBuild` composite build and `buildSrc` are separate builds and are not analyzed. Each project
  runs every tool (tests, JaCoCo, PIT included) in the one Gradle invocation, so a build of several
  projects costs about the sum of single-project runs; Gradle's own `--parallel` setting applies.
  File limits, coupling (with the stability direction) and package cycles are evaluated once over
  all projects, as for Maven modules, so a package dependency from one project to another counts
  and a cycle through two projects is one cycle. Packages and classes of a project other than the
  root are named with its folder (`lib/demo.lib`), so two projects that share a package or class
  name stay apart, and a dependency goes to the project that declares the class (its own first).
  The `permits.txt` of every project is merged with the same names, so a sealed type's `permits`
  edge is left out whichever project declares it. The root's names and identities are as in a
  one-project build, which reads its own jdeps reports unmerged.
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

## Maven builds

A project is built with Maven when its root has a `pom.xml` and no Gradle build file
(`settings.gradle(.kts)`, `build.gradle(.kts)`); with both, a lone `mvnw` (no `gradlew`) picks Maven,
anything else Gradle. Nothing is configured and the choice is never a finding: both builds are valid,
so nitpicker follows the one the project uses (`detectJavaBuild` in
`languages/java/builds/java-build.mjs`). Maven 3.6.3 or newer is needed.

The Maven side produces the same reports as the init script, one set per module in
`<module>/target/nitpicker/`, so the same ingesters read them and the findings are identical: the
end-to-end suite builds one source tree with Gradle and with Maven and compares the findings
field by field. Per snapshot:

1. `mvn help:effective-pom` (help plugin pinned): the modules, their source, test, resource and
   output directories (plus `build-helper-maven-plugin` `add-source`/`add-test-source` roots), the
   surefire reports directory, a JaCoCo `destFile` the project configures, and the
   `nitpicker.archunit.includes` property (read from the POM's `<properties>` only, not from `-D`
   or `settings.xml`). Module directories come from following the effective `<modules>` (active
   profiles included) from the root `pom.xml`. Each module's `pom.xml` is matched to its effective
   project by `groupId:artifactId`, or, when the raw coordinates use a property, by the effective
   build directory inside the module directory. A declared module that matches nothing, a module
   outside the project root, or two modules in one directory is a tool error.
2. One build: `mvn jacoco:prepare-agent test dependency:list` (JaCoCo at the init script's version,
   dependency plugin pinned), with `-Dmaven.test.failure.ignore=true` and the project's own
   Checkstyle, PMD, CPD, SpotBugs and Spotless checks skipped. `dependency:list` writes every
   module's resolved classpath (reactor modules as their `target/classes`). Our coverage file
   (`target/nitpicker-jacoco.exec`) and a project `destFile` inside `target` are deleted before the
   build, so coverage never accumulates across runs.
3. The tools resolved once from Maven Central through Maven itself (a generated tools project in
   `$XDG_CACHE_HOME/nitpicker` or `~/.cache/nitpicker`, private to the user, reused while the jars
   exist), so the project's `settings.xml` mirrors apply.
4. Per module, outside Maven: PMD, SpotBugs, google-java-format, Checkstyle (the bundled Google checks
   without inline suppression filters, as in the init script), `StructureMetrics.java`, jdeps, the
   JaCoCo CLI report and PIT, with the same arguments and classpaths as the init script tasks (PMD's
   auxiliary classpath is the main and test compile classpaths plus both class directories). The
   versions are read from the init script's `pinned` map, so both builds always run the same tools.

- **Tests.** Failures of the ArchUnit rule classes (`*ArchTest`, `*ArchitectureTest`, or the
  `nitpicker.archunit.includes` property in the POM) become findings; any other failing test is a
  `java/maven-failure` tool error that names up to ten failing tests. Surefire reports older than
  the build are ignored. Gradle runs the ArchUnit classes in their own task, but Maven only has
  surefire's results: when a module has ArchUnit classes and surefire ran none of them (its
  `<includes>` miss them, as they would `*Rules`, or the module skips tests), that is a tool error
  rather than a silent pass. ArchUnit reads bytecode without running it, so running these classes in
  the covered test run does not change coverage.
- **Slow-test reports.** Per module, the fresh `TEST-*.xml` files of surefire's reports directory
  (`<reportsDirectory>` of maven-surefire-plugin, default `<build directory>/surefire-reports`) are
  copied to `target/nitpicker/test-results/surefire/` and those of maven-failsafe-plugin's (its
  `<reportsDirectory>`, default `<build directory>/failsafe-reports`) to `test-results/failsafe/`,
  without the ArchUnit rule classes (as Gradle leaves out its ArchUnit task). When both plugins
  report to the same directory, it is copied once, as `surefire`, so unit tests keep the unit budget.
  Only files written since the build started are copied, so results left by an earlier run never
  count. The build runs the `test` phase only, so Failsafe (`integration-test`) does not run in it
  and `failsafe` stays empty in practice; the copy is there for a project that binds Failsafe to an
  earlier phase.
- **JaCoCo.** Our `prepare-agent` always runs; a project's own `prepare-agent` replaces it (the agent
  replaces an earlier agent in `argLine`) and writes to its configured `destFile`, which is read
  instead. A module whose tests ran but left no fresh coverage file is a tool error that points at a
  surefire `<argLine>` without `@{argLine}`. A module whose test classes ran no test (only helpers,
  or `*IT` classes surefire skips) gets zero coverage, as on Gradle, and a module without main
  classes gets an empty report.
- **Multi-module.** Each module (packaging other than `pom`) is analyzed on its own and its findings
  are prefixed with the module path (`core/src/main/java/...`). Coupling is computed once over all
  modules, so a dependency from one module to another counts, and file limits are evaluated once
  over every module's roots, so `exceptions` and `exclude` globs are relative to the project root
  (`languages/java/builds/java-modules.mjs`; both builds share `builds/project-wide.mjs`). Duplicate detection runs per module, so
  a clone between two modules is not found, as a clone between two source roots is not.
- **Guards.** The [guards](#guards) run on Maven too, outside Maven and per module
  (`languages/java/maven/guards/`), writing the same reports in `target/nitpicker/`. The javac
  lint pass reads the `maven-compiler-plugin` settings from the effective POM (`release`, `source`,
  `target`, `encoding`, `compilerArgs`, `compilerArgument`, `enablePreview`, the `default-compile`
  execution's configuration first, then the plugin's, then the `maven.compiler.*` properties; a
  value still holding an unresolved `${...}` counts as unset). It compiles with the `javac` of
  `JAVA_HOME` (or the PATH), not a Maven toolchain, against the main compile classpath (compile,
  provided and system scopes), takes Lombok from it, and reads the sources in the project's
  encoding. A POM that sets no release, source or target is linted as Java 8, the compiler
  plugin's default. Sources under a root outside the module directory (a `build-helper` root such
  as `../shared/src`) are not linted; their classes are on the class path, except in a module with
  a `module-info.java`, where such a root can make the lint compile fail (`javac/lint-not-run`). In
  a module with a descriptor, jars that are modules go on `--module-path` and the rest on `-cp`,
  as on Gradle; when that compile fails, it is retried with every jar on `--module-path`, as the
  compiler plugin puts a plain jar there when `module-info.java` requires it. On the head it reuses
  the base's warnings for unchanged files exactly as on Gradle. forbiddenapis reads the module's
  output directory (`target/classes` unless the POM moves it) against the main compile classpath
  and is skipped when the module has no classes; CPD, the guard, code smell and test-honesty PMD rulesets,
  the extra Checkstyle modules and the sealed `permits` edges are the same as on Gradle. The Java
  16 PMD rules are skipped below release 16, with the same Java 8 default. The dependency check
  reads the dependencies the module's own `pom.xml` declares with compile scope (no `<scope>` or
  `compile`) and not `<optional>`; `provided`, `runtime`, `test` and `system` are not checked,
  nor are dependencies on other modules of the reactor or dependencies a parent POM declares (the
  parent has no classes to compare with). A jar that registers an annotation processor
  (`META-INF/services/javax.annotation.processing.Processor`, such as `mapstruct-processor`)
  counts as used, and so does a jar that cannot be read as a zip. Each dependency's own jar comes
  from `dependency:list`, and the finding sits on
  the module's `pom.xml` with Maven's scopes as the alternatives. The end-to-end suite compares
  Gradle and Maven on the guards fixture and lints a reactor with a javac plug-in, preview
  features, a module descriptor and an older release.
- **Binary.** `NITPICKER_MAVEN` when set; otherwise the project's `mvnw` (`mvnw.cmd` on Windows),
  run with `sh` when not executable; otherwise `mvn` from the PATH. A missing `mvn` is a tool error
  that names these three ways. The JDK tools (`java`, `jar`, `jdeps`) come from `JAVA_HOME` when
  set, else the PATH.
- **Not covered.** The Kotlin preset needs Gradle and says so; use the java preset for a Maven
  project's Java sources. A surefire configuration that sets
  `<testFailureIgnore>false</testFailureIgnore>` explicitly overrides the command line, so a
  violated ArchUnit rule stops the build as a tool error. Maven 3 cannot resolve a `test-jar`
  dependency on another module in the `test` phase; such reactors fail as they would with
  `mvn test`. Gradle multi-project builds still read only the root project's reports (see
  [Slice 1](#slice-1-what-is-deliberately-not-included)).

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
  matching classes means no `archunit` report directory and no findings.
- **Report.** Gradle's JUnit XML, one file per test class, in `archunit/` of the report directory.
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
  profile, no wider scope, no score gate. Every main class of the Gradle project is mutated (on each
  path of the compiled main classes, the first package that holds classes: a project rooted in
  `org.example` targets `org.example.*`. PIT refuses `org.*` because it matches PIT's own classes,
  so classes directly in `org` are named one by one), against the project's own tests. The only
  profile can produce enforceable findings.
- **What runs.** `nitpickerPit` runs the pinned `pitest-command-line` (1.17.4) with the
  `pitest-junit5-plugin` (1.2.1), default mutators, XML output, two threads, to
  `pit/mutations.xml` in the report directory. Tests are named class by class (`--targetTests`), and
  `--mutableCodePaths` limits mutation to the main classes. The JUnit Platform is not pinned by
  Nitpicker: the plugin's own platform dependencies are excluded and the project's are used, with a
  launcher of the project's engine version added when the project does not declare one. PIT
  requires a green test run: a failing test suite fails the task, which is a Gradle failure
  (`tool-error` on the CLI path). Projects without main classes produce no report and no findings.
  The `pitest-junit5-plugin` and the launcher are added only when the project's test runtime has
  `junit-platform-engine`; a JUnit 4 project runs PIT's built-in JUnit 4 support.
- **Equivalent mutants.** A survived mutant's message names the common equivalent cases (a
  `compareTo` boundary, a discarded lambda return) and the way out: simplify the code, or add an
  exception for `pit/mutant-survived`.
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
  `checkstyle` (slice 3), `archunit` (slice 4), `crap` (slice 5), `duplicates` (slice 6), `pit` (slice 7), `spring` (configuration files, below) and `comments` (TODOs and commented-out code, in the code smell rules section). The analyzer declares them as
  `reportedTools` (a finding for a tool that is neither the analyzer nor a declared one is an error).
  Its version is the pinned tool versions from the init script, its configuration hash covers the
  init script and the Java adapter files, so a tool bump invalidates the base cache.
- **Everything else is shared.** `nitpicker`, `--all`, `--base`, `--output`, `--defer-exit`,
  `cache publish` and `nitpicker aggregate` take the same path as for TypeScript, so the exit codes
  (0 pass, 1 new enforceable findings, 2 tool error), the console summary, `new-findings.json`,
  `summary.json`, `report.sarif` and `report.junit.xml` are the ones described in the CLI README.
- **Gradle failure.** `languages/java/adapters/java-runner.mjs` catches any failure of the preset on a
  snapshot and returns one finding, `java/gradle-failure` (`java/maven-failure` on a Maven build) with
  classification `tool-error`, whose message is the build's diagnostic output. The comparison turns it into a tool error for that
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
    is Checkstyle's; `thresholds.lineLength` is a config error. `unitTestSeconds` and
    `integrationTestSeconds` are the [slow test](#slow-tests) budgets.
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
- **Tests.** `core/command/java/java-cli.test.mjs` drives the CLI with a fake `gradle` (`languages/java/adapters/fixtures/fake-gradle.mjs`),
  so it runs without Java: pass, new finding in text/JSON/SARIF/JUnit, Gradle failure on head and
  on base, missing binary, `--all`. The real Gradle run stays behind `NITPICKER_JAVA_E2E=1`
  (`npm run test:java`), unchanged.

## Slice 1: tools, reports and identities

Identity is how a finding is matched between base and head. It never contains a line number, so a
finding that only moves stays baselined. The comparison key is already
`tool, rule, path, symbol, identity, classification, metric name`; "identity" below is what each
tool adds on top of rule and path.

| Tool                                      | Report                     | Ingester                                                                       | Classification                                          | Identity                                                                                                            |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PMD (`pmd`)                               | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                                        | enforceable: every reported violation                   | The rule's message text (PMD names the offending field, method or variable in it). Repeats get `#2`, `#3` in order. |
| SpotBugs (`spotbugs`)                     | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                                        | enforceable: every reported bug                         | SpotBugs' message arguments (class, method or field, called method). Repeats get `#2`, `#3` in order.               |
| google-java-format (`google-java-format`) | file list from `--dry-run` | `ingestFormatCheck` (new, `languages/java/ingest/formatting/format-check.mjs`) | enforceable                                             | The constant `format`; the file path is the key. One finding per unformatted file.                                  |
| JaCoCo (`jacoco`)                         | XML                        | `ingestJacoco` (X6)                                                            | descriptive: `line-coverage` metric, `uncovered-method` | As in X6: class and method name plus descriptor.                                                                    |

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
- **Several projects.** Each Gradle project's reports are read on their own and their findings
  joined. A finding about a whole project (path `.`, such as the mutation summary) gets
  `@<project path>` appended to its identity when the build has more than one project.
- **SpotBugs entity associations.** `EI_EXPOSE_REP` and `EI_EXPOSE_REP2` are dropped for a field
  annotated `@ManyToOne` or `@OneToOne`: an entity hands out its associated entity on purpose.
  Collections and other mutable values still fail, and the message names the copy (`List.copyOf`,
  `Map.copyOf`) or a record, and the exception.
- **SpotBugs level.** SpotBugs marks lower-confidence findings with SARIF level `note`, which the
  SARIF ingester would classify as report-only. The preset instead fixes the threshold in the init
  script (`-medium`) and treats everything the tool reports as enforceable.
- **Sources of weakness.** Identity from message text breaks if a tool version changes a message
  (pinned versions make this a deliberate bump, and the bump shows up as old findings resolved and
  new ones appearing, which the gate then flags: re-baseline on a tool bump). Hashed identities
  (JaCoCo, Checkstyle, SARIF hash fallback) include the path, so the rename map from git cannot
  remap them: a renamed file with such findings shows them as resolved plus new. `format` and
  `fp:` identities carry no path, so they follow renames.

**PMD rules tuned by nitpicker.** These rules of the rule set allow a narrower form than PMD's
default, and their messages name it:

| Rule                               | What passes                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AvoidLiteralsInIfCondition`       | `-1`, `0`, `1` and `2`, and any string or char literal (`"abc".equals(s)`); any other number in a condition is a named constant.                                                                   |
| `AvoidFieldNameMatchingMethodName` | `static final` constants, and a method named exactly like its field with at most one parameter: an accessor (`name()`), a fluent setter or builder step (`name(String)`).                          |
| `AssignmentInOperand`              | An assignment in a `while` condition (`while ((line = reader.readLine()) != null)`).                                                                                                               |
| `GuardLogStatement`                | `trace` and `debug` (and JUL `fine` levels) with placeholders whose values are variables, fields, literals or a no-argument call on one (`order.id()`); a guard only when an argument is computed. |
| `LogStringConcatenation` (new)     | `info`, `warn` and `error` with placeholders, for SLF4J, Log4j 2, commons-logging, JUL and `System.Logger`.                                                                                        |
| `GeneratedOnHandWrittenCode` (new) | No `@Generated` annotation on a class, method or constructor: JaCoCo and PIT skip what it marks.                                                                                                   |

## Slice 3: Checkstyle

- **Gradle side.** The init script applies the Gradle `checkstyle` plugin (version pinned in the
  map, `checkstyle: 10.21.1`) and makes `nitpickerJava` depend on the Checkstyle task of every
  source set. `ignoreFailures` is on and the XML reports are written to `checkstyle.xml` (main
  sources) and `checkstyle-<source set>.xml` (`checkstyle-test.xml`, `checkstyle-integration.xml`,
  ...) in the report directory; the HTML report is off.
- **Configuration.** The preset uses `google_checks.xml` from the pinned
  Checkstyle jar, which matches google-java-format, with `MissingJavadocMethod` and
  `MissingJavadocType` suppressed (`languages/java/gradle/checkstyle-suppressions.xml`): Javadoc is
  allowed on public API but not required, the same rule as the TypeScript preset. Member and method
  names may be a single lowercase letter (`x`, `y`), as record components can. Javadoc that is
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
  cyclomatic complexity of each method and constructor into `structure.json` in the report directory
  (`complexity`), so the CRAP check needs no tool beyond the JDK that runs Gradle. It is
  McCabe's count: 1 plus each `if`, `for`, enhanced `for`, `while`,
  `do`, `catch`, `?:`, `&&`, `||` and each `case` that is not a default one (an arrow case and a case with
  several constants count once; `default` and `case null, default` count 0). A flat switch, a switch
  expression or a pattern switch whose cases are all one-expression arrows, counts as one decision
  plus one per `when` guard, at most its case count, so an exhaustive switch over an enum or sealed
  type does not push a method over the limit. Lambda bodies count towards the
  enclosing method; members of nested and anonymous classes are methods of their own.
- **Ingester.** `ingestCrap` (`languages/java/ingest/crap.mjs`) joins those methods with the JaCoCo
  report (same `jacoco.xml` as slice 1). A JaCoCo method belongs to a method of `structure.json` when
  the file, the method name (`<init>` is the class name) and the line match: the method's first line
  lies in the method's line range. This also joins methods of anonymous classes. A constructor is
  also joined by its parameter types (`parameterTypes` in `structure.json` against JaCoCo's
  descriptor), because a class with field initializers starts its `<init>` at the first initializer,
  before the constructor. Lambdas and
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
  fails, as it does for TypeScript; for a fully covered method the message says to split off a
  branchy part. `crap-coverage-unknown` (enforceable) when no JaCoCo method
  matches or the method has neither line nor branch counters; its Java message names the two causes,
  no test runs it or it is annotated `@Generated`.
- **JaCoCo filters.** The project's own JaCoCo settings (`jacocoTestReport.classDirectories`
  excludes, `test.jacoco` includes and excludes) are reset, so a class cannot leave the coverage
  report through `build.gradle`. JaCoCo and PIT still skip code annotated `@Generated`; on
  hand-written code that annotation is the `pmd/GeneratedOnHandWrittenCode` finding. Only violations are findings; the
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
  does not touch). After the Gradle task has written `manifest.json` in the report directory,
  `languages/java/adapters/metrics/java-duplicates.mjs` runs the package's own pinned jscpd (the one the TypeScript
  `duplicates` check uses; its version is appended to the analyzer version as `jscpd@x.y.z`) once
  per existing main source root with `--format java --mode mild` and a nitpicker-owned `--config`
  (a project's `.jscpd.json` is not read), ignoring `build`, `generated`, `target` and `out`. It runs
  once for the whole build, over the source roots of every Gradle project. Reports go to `jscpd/<n>/`
  in the report directory and are merged into its `duplicates.json`. Clones across two source roots, and so across two Gradle projects, are not detected (running jscpd once over all roots would detect them, at the price of changing the identity of every existing Java clone finding). A jscpd
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
- **Findings.** `ingestJacocoBranches` (`languages/java/ingest/coverage-reports/jacoco-branches.mjs`) emits one enforceable
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
- **Tests.** `languages/java/ingest/coverage-reports/jacoco-branches.test.mjs` (sample report, identity stability,
  baselined / touched / added / moved cases through `compareFindings`); `java-reports.test.mjs`
  for the glue; the gated e2e test adds three cases (moved line baselined, edited line fails, new
  uncovered branch fails while the old one stays baselined).

## Slow tests

- **Rule.** `test-runtime/slow-test` fails a test the change adds or edits when it takes more than 5 s
  as a unit test, or more than 30 s as an integration test (`thresholds.unitTestSeconds` and
  `thresholds.integrationTestSeconds`). Integration tests are those of a test task other than `test`
  (Maven's `surefire` counts as `test`), classes named `*IT`, `*ITCase` or `*IntegrationTest(s)`, and
  classes annotated `@SpringBootTest`, also through a superclass or an annotation of their own that
  carries it, when that type's source is in a test root.
  The message names the budget, the measured time, the fixes (no `Thread.sleep` or other waits, a
  smaller Spring context or a test slice, or moving it to an integration test source set; on Maven,
  making it an integration test that Failsafe runs, `*IT`) and the exception route.
  Nitpicker runs only the tests its run needs: on Gradle the `test` task and any test task the build
  makes it depend on, on Maven the `test` phase, so a test moved out of them is not timed.
- **Measurement.** Head only, from the JUnit XML the test tasks already write: the init script copies
  `TEST-*.xml` of every test task in the run (not `nitpickerArchunit`) to
  `test-results/<task>/` in each module's report directory. No extra test run. A rerun test keeps
  its slowest time. Maven builds copy Surefire's `TEST-*.xml` to `test-results/surefire/` and
  Failsafe's to `test-results/failsafe/` (see [Maven builds](#maven-builds)); `surefire` counts as
  the `test` task, `failsafe` as an integration task.
- **Edited or added.** Each test is keyed by class and testcase name (Gradle writes the display name,
  so a parameterized case is keyed by its `[n] ...` name; Surefire writes the method name). The test
  method is found in the source by that name (also `name()[n]` and JUnit 4's `name[n]`) or its
  `@DisplayName`, with its annotations, inside the class the report names: a `@Nested` test
  (`CalcTest$WhenFull`) is looked up in that nested class, and named `CalcTest.WhenFull` in the
  message. `void` and `fun` methods count, and `@TestFactory` methods that return dynamic tests. A
  test is counted when its method text differs from the base, or the file is new. A name that maps
  to no method (a default `[1] 1` or custom parameterized name, a dynamic test) is counted when the
  file is new or one of its class's `@ParameterizedTest`, `@RepeatedTest`, `@TestFactory` or
  `@TestTemplate` methods changed. Slow tests the change does not touch stay baselined, and the base
  snapshot reports none.
- **Module paths.** The reader works in one module's folder, so a Maven submodule's test file is
  found there and compared with the base file under the module path (`core/src/test/java/...`),
  and the exception hint in the message names the project-relative path. `readModuleFindings`
  passes each module's path (`modulePath`, `builds/module-path.mjs`), empty for a single module at the
  project root; a Gradle build reads from the project root and passes none.
- **Tests.** `adapters/test-times/slow-tests.test.mjs` (sample Gradle, Surefire and Failsafe XML,
  module-path baseline), `builds/java-modules.test.mjs`, `maven/results/maven-test-results.test.mjs`
  and the multi-module Maven e2e fixture.

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
  `structure.json` in the report directory). It needs no dependency and no pin beyond the JDK. A syntax error (for
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
  (statement or expression) and `catch`; an `else if` stays on the level of the `if` it continues,
  as in the Python and Kotlin presets. `parameters`:
  declared parameters. Anonymous, local and member class bodies are separate units and do not count
  towards the method that contains them; lambda bodies count towards the enclosing method.
- **Findings.** `languages/java/adapters/metrics/java-structure.mjs` hands the metrics to `evaluateStructure` and keeps
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
  `jdeps.txt` in the report directory plus `jdeps-classes.txt` (the main classes, one binary name per line).
  jdeps comes with the JDK that runs Gradle; nothing is downloaded and no version is pinned. The
  block is delimited by `// --- coupling (SH6)` comments in the init script.
- **Conversion.** `languages/java/adapters/metrics/java-coupling.mjs` parses the class graph, folds nested classes
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
- **Tests.** `languages/java/adapters/metrics/java-coupling.test.mjs` (parsing, metrics, stability edges, the
  neutral report through the shared rule), `java-reports.test.mjs` (glue), and two gated e2e cases
  (a package depending on a less stable package fails; the same violation on the base stays
  baselined).

## Guards

Rules for patterns that coding agents often write. Each one stays on; when one flags code that is
right, add an exception for its rule to `nitpicker.config.json` (`rule`, `paths`, `reason`). Every
PMD message ends with that route, and the guard messages from javac, forbiddenapis, Checkstyle and
the dependency and cycle checks end with it too. Inline suppressions are not a route:
`@SuppressWarnings("unchecked")` and the like are blanked before `javac` lints, so they hide
nothing. The rules read base and head the same way, so only a pattern a change adds fails.

| Guard                                                                                                                                            | Rule as printed                                                                                                                                                        | Allowed form                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Package cycles                                                                                                                                   | `coupling/package-cycle`                                                                                                                                               | Move shared types down, or invert one dependency behind an interface                                               |
| `Optional.get()`; `Optional` as field, parameter or record component; `Optional<List<..>>`                                                       | `pmd/OptionalGet`, `pmd/OptionalAsFieldOrParameter`, `pmd/OptionalOfCollection`                                                                                        | `orElseThrow()`, `orElse`, `map`, `ifPresent`; return an empty collection                                          |
| Raw types, unchecked casts, deprecated and removed APIs, redundant casts                                                                         | `javac/rawtypes`, `javac/unchecked`, `javac/deprecation`, `javac/removal`, `javac/cast`                                                                                | Type arguments, typed APIs, the replacement the Javadoc names                                                      |
| `instanceof` followed by a cast                                                                                                                  | `pmd/InstanceofThenCast`                                                                                                                                               | Pattern matching (`x instanceof Circle c`) or a `switch` over a sealed type                                        |
| Non-private fields, mutable static state, `@SneakyThrows`                                                                                        | `checkstyle/...VisibilityModifierCheck`, `pmd/NonFinalStaticField`, `pmd/MutableStaticCollection`, `pmd/SneakyThrows`                                                  | Private fields, a `record`, immutable `List.of` and `Map.of`, a declared exception                                 |
| Legacy date and time, `now()` without a `Clock`, `Thread.sleep`, `new Thread`, `Runtime.exec(String)`, `ObjectInputStream`                       | `forbiddenapis/legacy-date-time`, `clock-now`, `thread-sleep`, `new-thread`, `runtime-exec`, `java-deserialization`                                                    | `java.time`, an injected `Clock`, an executor, `ProcessBuilder` with a list, JSON                                  |
| Swallowed `InterruptedException`; side effects in `forEach` and `peek`; `collect(Collectors.toList())`; an unclosed `Files.lines/list/walk/find` | `pmd/SwallowedInterruptedException`, `pmd/ForEachSideEffect`, `pmd/CollectorsToList`, `pmd/StreamResourceNotClosed`                                                    | `Thread.currentThread().interrupt()`, `map` and `collect`, `Stream.toList()`, try-with-resources                   |
| `throws Exception`, raw `RuntimeException`                                                                                                       | `pmd/SignatureDeclareThrowsException`, `pmd/AvoidThrowingRawExceptionTypes`                                                                                            | The checked exceptions the method throws; `IllegalArgumentException`, `IllegalStateException`, a project exception |
| SQL built with `+` or `String.format` in JDBC calls; MD5 and SHA-1; nested-quantifier regexes; a path joined from a parameter                    | `pmd/SqlConcatenation`, `pmd/WeakHash`, `pmd/NestedQuantifierRegex`, `pmd/PathFromParameter`                                                                           | `?` parameters, SHA-256, a regex without `(a+)+`, `normalize()` and `startsWith(base)`                             |
| Constant names; magic numbers                                                                                                                    | `checkstyle/...ConstantNameCheck`, `checkstyle/...MagicNumberCheck`                                                                                                    | `UPPER_SNAKE_CASE` (a logger may be `log` or `logger`); a named `private static final`                             |
| Unused imports                                                                                                                                   | `pmd/UnnecessaryImport`                                                                                                                                                | Remove the import                                                                                                  |
| Duplicates with renamed names, and in test sources                                                                                               | `duplicates/duplicate-clone`                                                                                                                                           | One shared method; a helper or `@ParameterizedTest` in tests                                                       |
| Declared but unused dependencies                                                                                                                 | `dependencies/unused-declared-dependency`                                                                                                                              | Remove it, or declare it `runtimeOnly` or `compileOnly` (Maven: `test`, `runtime` or `provided` scope)             |
| Test honesty                                                                                                                                     | `pmd/TestSleep`, `DisabledTest`, `AssertionInControlFlow`, `TryCatchInTest`, `AssertTrueOnEquality`, `TautologicalAssertion`, `MockedValueType`, `TestOrderDependence` | See Tests below                                                                                                    |

A Checkstyle rule prints as its full check class, for example
`checkstyle/com.puppycrawl.tools.checkstyle.checks.coding.MagicNumberCheck`; the message names it.

- **PMD categories.** `performance`, `multithreading` and `security` run next to `errorprone`
  and `bestpractices`, on main and test sources. Messages that do not name the allowed form get
  it appended (for example `StringToString`: "Remove the toString() call."), and every PMD message
  gets the exception route, in one place: `languages/java/guards/advice/pmd-advice.mjs`. Six rules
  are left out because they flag correct code by design, with no general recommendation behind
  them: `AvoidInstantiatingObjectsInLoops` (building result objects in a loop is the normal way
  to fill a list), `UseConcurrentHashMap` (it flags every `HashMap`, and a local map is correct),
  `InsufficientStringBufferDeclaration` (an initial capacity is an optimisation, not a defect),
  `AvoidUsingVolatile` (`volatile` is the correct tool for a flag read by other threads),
  `DoNotUseThreads` (it flags `ExecutorService`, the allowed form; `new Thread` is a
  forbiddenapis finding) and `TooFewBranchesForSwitch` (a pattern `switch` over a sealed type with
  two cases is the preferred form). `AvoidSynchronizedAtMethodLevel` stays, with a message that
  points at a lock, since its stock advice (a `synchronized` block) is what
  `AvoidSynchronizedStatement` forbids.
- **Where they run.** `languages/java/gradle/pmd-ruleset.xml` holds the rules for main and test
  sources. `rules/guards-ruleset.xml` runs on main sources only (the init script writes a wrapper
  ruleset that excludes the test directories), `rules/test-honesty-ruleset.xml` on test sources
  only (its wrapper excludes every file, then includes the test directories back, since PMD lets
  an include pattern override an exclude pattern). A project's own `config/pmd/ruleset.xml`
  replaces all of them unless it opts in as before. `InstanceofThenCast` and `CollectorsToList` are
  left out when the main compile targets a release below 16 (`options.release`, else
  `targetCompatibility`), since pattern matching and `Stream.toList()` need 16.
- **Narrowed rules.** `OptionalAsFieldOrParameter` skips parameters bound by Spring web
  annotations (`@RequestParam`, `@RequestHeader`, `@PathVariable`, `@CookieValue`,
  `@RequestAttribute`, `@SessionAttribute`, `@MatrixVariable`, `@RequestPart`), where an optional
  request value is the framework's form. `StreamResourceNotClosed` skips a stream returned to the
  caller or held in a variable that a later `try (lines)` closes. `InstanceofThenCast` skips a cast
  that adds type arguments the `instanceof` cannot test (`o instanceof List`, then
  `(List<String>) o`). `CollectorsToList` reports `collect(Collectors.toList())` only, not a downstream
  `toList()` inside `groupingBy` or `mapping`. `NestedQuantifierRegex` reports a repeated group
  whose whole body is one quantified item (`(a+)+`, `(\s*)*`, `([a-z]+)*`), not a group of
  several items such as `([A-Z][a-z]+)+`. `SignatureDeclareThrowsException` skips overriding
  methods, a method that takes Spring Security's `HttpSecurity`, `WebSecurity`,
  `AuthenticationConfiguration` or `AuthenticationManagerBuilder` (whose methods declare
  `Exception`), and `getObject()` of a `FactoryBean`. `NonFinalStaticField` skips JUnit's `@TempDir`, `@Container`, `@RegisterExtension`
  and `@ClassRule` fields, Testcontainers containers and fields assigned in `@BeforeAll`;
  `MutableStaticCollection` skips a private static concurrent collection used as a cache.
- **Checkstyle.** `rules/checkstyle-all.xml` (`ConstantName`) is added to the `google_checks.xml`
  rules for main and test sources; `rules/checkstyle-main.xml` (`MagicNumber` with `-1`, `0`, `1`
  and `2` allowed and `hashCode` and annotations ignored, `VisibilityModifier` with public final
  fields allowed) for main sources only. `ConstantName` checks constants of primitive, `String`,
  boxed, `BigDecimal`, `BigInteger` and `Duration` type; a `static final` reference to an object
  such as `mapper` keeps its camel-case name. `VisibilityModifier` allows protected fields of a
  `@MappedSuperclass`. These scopes are `SuppressionXpathSingleFilter` modules inside the
  generated config, not inline suppressions. The messages are rewritten to name the allowed form.
- **javac lint.** The `nitpickerLint` task compiles the main sources once more with
  `-Xlint:rawtypes,unchecked,deprecation,removal,cast` and writes the warnings to
  `javac-lint.txt` in the report directory (tool `javac`, rule = lint category). It compiles a copy in
  which every `@SuppressWarnings(...)` is blanked out (same lines and columns), with the project's
  compiler, release (or `-source`/`-target` from the source and target compatibility when no
  release is set) and compiler arguments (without `-Werror`, `-Xlint`, `-Xplugin` and processor
  options),
  and with the main classes on the classpath, so it runs only Lombok of the annotation processors
  (the classes other processors generate are already compiled) and stops after flow analysis
  without writing classes. With a `module-info.java` the sources compile as that module, with
  the modular jars of the class path on `--module-path`, and every file is linted. On the head, when the base produced a lint report in the same run (kept in
  `<build dir>/nitpicker-lint/javac-lint.txt` of the base checkout), only the source files
  whose content differs from the base are compiled; the base's warnings for the unchanged files
  are kept, so the report matches a full lint. The cost: a warning that appears in an unchanged
  file only because a changed file changed (a method the change deprecated, called from an
  unchanged file) is not reported. Without a base report (the base came from the findings cache,
  or its lint failed) the head lints every file. When the lint compile fails the run goes on: the
  report says so in a descriptive `javac/lint-not-run` notice, and javac warnings are not checked
  in that run. When only the base failed, the head's javac findings are reported but do not fail
  the gate: with no base report, nothing tells which of them the change added, and each one says
  so. When only the head failed, the run fails with a tool error: the change broke the lint
  compile.
- **Run time.** The lint, forbiddenapis, CPD, dependency and permits tasks declare their inputs
  and outputs, so Gradle skips them when nothing they read changed. Measured on the hx repro (31
  main files, Lombok and MapStruct, load about 40), the lint task took 22.0 s before and 13.1 s
  with a one-file change; on the java-base sandbox, 6.2 s before and 3.9 s. Most of what is left is
  starting javac with the processor and class path.
- **forbiddenapis.** [forbiddenapis](https://github.com/policeman-tools/forbidden-apis) 3.10
  (Apache-2.0, one jar from Maven Central, pinned in the init script) reads the main bytecode
  against `rules/forbidden-apis.txt`. Each signature group has a tag that becomes the rule name
  (`thread-sleep`); the report is `forbidden-apis.txt`. Source locations come
  from the class's debug line numbers.
- **Duplicates.** The jscpd check is unchanged. `nitpickerCpd` runs PMD's copy-paste detector
  (BSD-style, already inside the pinned PMD) over main and test sources with identifiers and
  literals ignored and at least 100 tokens, so a copy with renamed variables is found. A clone
  jscpd already reports (same two files, overlapping lines) is not reported twice, overlapping
  windows of one file pair are one finding, a block that overlaps its own copy is dropped, and so
  are clones made only of getters, setters, field declarations and field-assigning constructors
  or only of data rows (enum constants, `Arguments.of(...)` rows, literal lists, and constants
  built from literals with `Map.ofEntries`, `Map.of`, `List.of`, `Set.of`, `Stream.of` or
  `Arrays.asList`). Findings use the
  same tool and rule as jscpd (`duplicates/duplicate-clone`), with identities starting `cpd:` so
  they never match a jscpd finding; between two test files the message points at a helper or a
  `@ParameterizedTest`. The message ends with the exception route for
  `duplicates/duplicate-clone`.
- **Cycles.** `java-coupling.mjs` already has the class graph from jdeps. Each package in a
  strongly connected set of packages is one `package-cycle` finding, identified by the package
  name and placed on its first file, so growing a legacy cycle adds a finding for the new package
  only and shrinking it resolves findings without re-reporting the rest. The edge from a sealed
  type to the subtypes it `permits` is left out (`permits.txt` in the report directory, read from the
  `PermittedSubclasses` attribute of the main classes), since a sealed hierarchy across packages is
  the intended form. Cycles between classes of one package are not reported: two-way references
  such as a parent and its children or JPA associations are normal.
- **Dependencies.** `nitpickerDependencies` writes `dependencies.json`: each
  `implementation` and `api` dependency with the names of its own artifacts (not those it brings
  in transitively) and whether a main class references a class in them. The references are read
  from the class files' constant pools, which include annotation and generic signature types, so
  a library used only for its annotations counts as used. A dependency with artifacts and no
  reference is `unused-declared-dependency`; starters, BOMs and platforms are never reported, and
  `runtimeOnly`, `compileOnly` and test configurations are not checked. The finding sits on the
  build file. On a Maven build see [Maven builds](#maven-builds) for which dependencies count.
  Versions are not checked: how a project pins its versions is its own choice.
- **Tests.** The test rules run on test sources only. `TestSleep` (`Thread.sleep` and
  `TimeUnit.sleep`), `DisabledTest` (`@Disabled`, `@Ignore`), `AssertionInControlFlow` (an
  assertion or `verify` inside an `if` or `switch` of a test method; a loop over results and an
  `if` that only calls `fail` are fine),
  `TryCatchInTest` (use `assertThrows`), `AssertTrueOnEquality` (`assertTrue(a.equals(b))`,
  `assertTrue(a == b)`), `TautologicalAssertion` (`assertThat(true)`, `assertTrue(true)`,
  `assertEquals(1, 1)`; `assertEquals(a, a)` is a reflexivity test and is fine), `MockedValueType` (a `String`, number, date, collection, `Optional` or
  record mocked with `mock` or `@Mock`) and `TestOrderDependence` (`@TestMethodOrder`,
  `@FixMethodOrder`, `@Order` on a test). A test class with `static` non-final fields or a static
  collection it changes is a `pmd/NonFinalStaticField` or `pmd/MutableStaticCollection` finding
  like production code. A test with no assertion at all is still
  `pmd/UnitTestShouldIncludeAssert`. Assumptions (`assumeTrue`) and tests that only `verify` a
  call are not reported: environment guards and verifying a `void` collaborator are legitimate.
- **Fixture.** `languages/java/guards/guards.e2e.test.mjs` runs the Gradle tasks on
  `languages/java/adapters/fixtures/guards-project`, whose sources hold one violating and one clean
  sample per rule with a `// violation: <tool>/<rule>` marker, and expects exactly the marked
  findings (part of `npm run test:java`). The clean samples include a `@RequestParam Optional`
  parameter, an `HttpSecurity` bean method that throws `Exception`, a main-code rule in a test and
  a test rule's pattern in main code, the Spring Security methods that throw `Exception`, a generic
  cast after `instanceof`, a `try (lines)` on a variable, a `fail` guard and `assertEquals(a, a)`.
  The test also checks one message's exception route, and runs `guards-compile-modes`: PMD on its
  `legacy` module, compiled for Java 11, where `InstanceofThenCast` and `CollectorsToList` must
  not fire, and the lint on modules with a javac plug-in (`-Xplugin`), `--enable-preview` and a
  module descriptor with a sealed type across packages. The `lint-not-run` path is unit-tested only: a source that
  breaks the lint compile breaks `compileJava` first.
- **Left out on purpose.** Lombok `@Data` (a record is the allowed form for data, but `@Data` on a
  JPA entity is common enough that blocking it needs its own decision), `java.util.Random`
  (`SecureRandom` is right for tokens, but a plain `Random` for sampling is legitimate and the
  tool cannot tell), and a path join that is checked after the fact in another method.

## Code smell rules

[`languages/java/gradle/code-smells-ruleset.xml`](../languages/java/gradle/code-smells-ruleset.xml) holds nitpicker's
own PMD rules for patterns coding agents repeat. They run on main sources, with or without Spring
(the init script, and on Maven `languages/java/maven/guards/maven-pmd.mjs`, wraps them like the
guard rules: test directories excluded); test sources get `code-smells-test-ruleset.xml` instead (PMD's `AvoidDuplicateLiterals` and its
private-method `UnusedFormalParameter`, with nitpicker's messages). The Java preset is the only Gradle preset with these
rules for now: the Kotlin preset does not run them. Each message names the allowed form and ends
with the exception to add when the code is right: `{ "rule": "pmd/<rule>", "paths": [...], "reason": "..." }`.
Like every PMD finding, they fail a change only when it adds one.

| Rule                            | Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Allowed form                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `RepeatedStringLiteral`         | a string literal of 5+ characters used three times or more in a file, from the third use (annotation values, `case` labels and message keys passed to `getMessage`/`getString` are skipped)                                                                                                                                                                                                                                                                                                                                         | one `private static final String` constant                                      |
| `UnusedFormalParameter`         | an unused parameter of any method or constructor, not only private ones; overrides, `main`, methods with a framework annotation (`@ExceptionHandler`, `@EventListener`, `@GetMapping`, `@Bean`, `@JsonCreator`, ...) and names starting `ignored` or `unused` are skipped                                                                                                                                                                                                                                                           | remove it, or use it                                                            |
| `GenericTypeName`               | a class, interface, enum or record whose name ends in `Util`, `Utils`, `Utility`, `Utilities`, `Helper`, `Manager`, `Common`, `Commons` or `Misc`; a type that extends or implements a type with the same ending (`OrderCacheManager implements CacheManager`) and framework roles such as `AuthenticationManager` or `TransactionManager` are skipped                                                                                                                                                                              | a name for the job (`PriceRounder`)                                             |
| `GenericPackageName`            | a package with a segment `util`, `utils`, `utility`, `helpers`, `manager`, `common`, `commons` or `misc`                                                                                                                                                                                                                                                                                                                                                                                                                            | a package named for what it holds; pure shared logic goes in a `shared` package |
| `HardcodedSecret`               | a secret-looking string (6+ characters with letters and digits, or three character classes) assigned to a variable, field or map key named `*password`, `*secret`, `*token`, `*credentials`, `*apiKey`, `*privateKey` and similar, also through `"...".toCharArray()`, `String.valueOf("...")`, `new String("...")`, a concatenation of literals, `Map.of("password", "...")` or `setProperty("db.password", "...")`; placeholders, environment variable names, URLs and names such as `X-CSRF-TOKEN` or `access_token` are skipped | read it from the environment or a secrets manager                               |
| `CredentialLiteral`             | a string shaped like an AWS access key, a GitHub or Slack token, a `sk_live_`, `sk_test_` or `sk-proj-` key, a private key header, a URL with `user:password@`, a JDBC URL with `password=`, or a `Bearer` or `Basic` header value                                                                                                                                                                                                                                                                                                  | the same                                                                        |
| `SecretInLog`                   | a secret-named variable, field or getter (`getPassword()`) passed to a logger or `System.out`/`System.err` call, directly or in a `+` concatenation; `secret != null`, `token.length()` and `hasToken` are fine                                                                                                                                                                                                                                                                                                                     | log that it is set, or a masked tail                                            |
| `CatchOnlyLogsOrReturnsDefault` | a `catch` that neither throws, nor uses the exception (passes it on, wraps it, returns something made from it), nor answers with an error response (`ResponseEntity.status(...)`, `sendError`); log calls and `printStackTrace` do not count as using it. An `InterruptedException` catch that calls `Thread.currentThread().interrupt()` and the catch of a retry loop are skipped                                                                                                                                                 | rethrow with the cause, or return a failure result that carries the exception   |
| `BooleanFlagParameter`          | a `boolean` or `Boolean` parameter of a public method of a public type that selects between two behaviors (it is the condition of an `if` or `?:`); constructors, setters, `with*` builders, `of`/`from`/`valueOf` factories, overrides and annotated parameters are skipped                                                                                                                                                                                                                                                        | two methods named for each behavior, an enum, or a record                       |
| `IoCallInLoop`                  | a repository, JDBC, `EntityManager`, HTTP client (`RestTemplate`, `WebClient`, `HttpClient`) or `Files` read or write, or a `new FileReader(...)`, inside a `for`, `while` or `do` body or a stream callback (`forEach`, `map`, `filter` and similar)                                                                                                                                                                                                                                                                               | fetch or write all items at once (`findAllById`, `WHERE id IN (...)`)           |

`IoCallInLoop` matches a receiver by its type when the class is on the compile classpath, by its
declared type name (`*Repository`, `*Dao`, `*Client`, `EntityManager`, `JdbcTemplate`,
`RestTemplate`, `Connection`, `Statement`), or by its name as a whole word (`orderRepository`,
`client`, `gateway`, `api`). Paging and polling loops (the loop condition reads a variable the
body assigns, as in `do { page = repository.findAll(pageable); ... } while (page.hasNext())`),
retry loops (a `try` that returns or breaks on success and a `catch` that lets the loop go on),
`Files.exists` and similar checks, and Spring Data `save`/`delete`, which `SpringDataNoSaveInLoop`
reports, are skipped.

**Comments.** The `comments` tool scans every Java source file, main and test, for two problems:
`comments/TodoWithoutIssue` (a `TODO` or `FIXME`, in any case at the start of a line, or `XXX`
or `HACK`, not directly followed by an issue: `TODO(#123)`, `TODO(PROJ-123)`, `TODO PROJ-123` or
a link) and `comments/CommentedOutCode` (a `//` or `/* */` comment with a statement in it, such
as `// int total = compute(items);`, reported at the line the comment starts; a run of `//` lines
counts once). Javadoc is documentation and is only checked for TODOs. Delete the code, or give the
TODO an issue.

**Tests.** `adapters/fixtures/code-smells-project` holds a violating and a legitimate sample per
rule, each violation marked `// violation: <rule>`. `code-smell-rules.test.mjs` checks that every
rule is documented here, names its exception route and has a marked sample, and that the init
script and the Maven PMD run wire both rule sets; the gated `spring/java-spring.e2e.test.mjs` also
runs the fixture through Gradle, and `maven/maven-preset.e2e.test.mjs` through Maven, and both
expect exactly the marked findings in main and test sources.

## Spring rules

A Gradle project whose compile classpath has `spring-context` or `spring-boot` gets nitpicker's
Spring ruleset, [`languages/java/gradle/spring-ruleset.xml`](../languages/java/gradle/spring-ruleset.xml),
added to its PMD run, next to nitpicker's rule set `pmd-ruleset.xml` (and the project's own `config/pmd/ruleset.xml` when
`tools.pmd.precedence` lists `"project"` too). Every
project's PMD run now gets the main and test compile classpaths and the main and test classes as
its auxiliary classpath (`pmd-aux-classpath.txt` in the report directory), so the rules match annotation and
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
`checkstyle-test.xml`), google-java-format, PMD's copy-paste detector and the inline suppression scan cover
`src/test/java` and every other source set (`integrationTest`, `testFixtures`, `jmh`, ...) as well
as the main sources, with the test rules, the way the TypeScript preset lints its tests; the
file and folder limits already counted test files. PMD runs nitpicker's own rule sets.
[`languages/java/gradle/pmd-ruleset.xml`](../languages/java/gradle/pmd-ruleset.xml) covers main
and test sources: the errorprone, bestpractices, performance, multithreading and security
categories (see [Guards](#guards) for the rules left out), without `UnitTestAssertionsShouldIncludeMessage` and
`UnitTestContainsTooManyAsserts`, which set an assertion style the TypeScript preset does not have,
plus design's `AvoidCatchingGenericException` (no `catch (Exception e)`, `RuntimeException` or
`NullPointerException`; errorprone already covers `Throwable`), as the TypeScript and Python presets
forbid broad catches. A test with no assertion still fails (`UnitTestShouldIncludeAssert`, which
also counts MockMvc's `andExpect` and `andExpectAll`, BDDMockito's `then(...).should()`,
`WebTestClient`'s `expectStatus`/`expectBody`/`expectHeader` and `StepVerifier`'s `expectNext`,
`verifyComplete` and friends), and a class in test sources named like a test but without test
methods fails (`TestClassWithoutTestCases`, which runs from `pmd-tests.xml`, excluding the main
source directories, so a main class such as `TestDataGenerator` is not a test), except `*ArchTest`
and `*ArchitectureTest` classes, which hold ArchUnit rules. The guard rules and the code smell rules
read main sources only, and the test-honesty rules and `code-smells-test-ruleset.xml` test
sources only (see [Guards](#guards)). The Spring rule set reads main sources only: the init script wraps it in
`pmd-spring-main.xml` in the report directory with an exclude pattern per test source directory, since
field injection and package-private test methods are the norm in tests. A PMD rule that flags
legitimate test code, such as `SystemPrintln` in a test of console output, or `CloseResource` on a
`PrintStream` handed to `System.setOut`, takes an exception like any other: `{ "rule": "pmd/<rule>", "paths": [...],
"reason": "..." }`. PMD messages that name a line ("first occurrence is on line 12") lose the number
in the finding's identity, so moving code does not re-report them. SpotBugs, the structure limits
and CRAP stay on main code, as in the TypeScript preset.

**Exceptions.** Every Spring message except `SpringDataNativeQuery` ends with the exception to add
when the code is right, for example `{ "rule": "pmd/SpringDataNoSaveInLoop", "paths": [...],
"reason": "..." }`.

**Limits.** `JpaVersion` checks each `@Entity` or `@MappedSuperclass` that declares the `@Id`,
and each entity without a superclass, so the `@Version` field belongs next to the `@Id`. A finding
is dropped when a superclass found in the project's sources declares `@Version`; a superclass from
a library counts as having none. `AbstractClassWithoutAbstractMethod` skips `@MappedSuperclass`
classes, which are abstract to stop instantiation. The JPA rules match `jakarta.persistence` only; `javax.persistence` code gets none of
them. `SpringDataDerivedQuery` leaves redeclared CRUD methods alone (`findById`, `findAll`, `save`,
`deleteById` and the rest of `ListCrudRepository`, `ListPagingAndSortingRepository`,
`JpaRepository` and `QueryByExampleExecutor`), since Spring implements those without parsing the
name, and accepts the `@Query` of the JDBC, R2DBC, MongoDB, Neo4j, Cassandra, Couchbase and
Elasticsearch modules; the other Spring Data rules know only the JPA annotations. Proxy annotations
on interface methods are accepted, because Spring reads them for both proxy kinds.
`SpringProxySelfCall` matches by name and argument count, and skips a call from one `@Transactional`
method to another with a plain `@Transactional` (same transaction). `SpringDataNoSaveInLoop` covers
`for`, `while` and `do` loops and `forEach`, `map` and `peek` callbacks on a stream, an `Iterable`
or a `Map`, lambdas and method references (`forEach(repository::save)`) alike; `Optional.map` and
`ifPresent` run at most once and are not loops. It and `SpringDataNoFlush` skip a loop that also
calls `EntityManager.clear()`, the JPA batch idiom.
`SpringNoSwallowedTransactionException` reports catching `Exception`, `RuntimeException`,
`Throwable`, `DataAccessException`, `TransactionException` or `PersistenceException`, not narrower
exceptions such as `NumberFormatException`. Layering, entities in controller signatures and test
placement need a cross-class view and come with nitpicker's ArchUnit rules.

**Tests.** `spring/java-spring.e2e.test.mjs` (gated like the other Java e2e tests and part of
`npm run test:java`) runs PMD through the init script on `adapters/fixtures/spring-project`, whose
sources mark every expected violation with a `// violation: <rule>` comment, and asserts the
reported set equals the marked set. The fixture also holds the legitimate forms each rule must
accept.

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
- Kotlin sources (see [kotlin-preset.md](kotlin-preset.md)), Groovy sources, Maven (since added, see
  [Maven builds](#maven-builds)).

## Tests

- `languages/java/adapters/reporting/java-reports.test.mjs`: fast, always on. Report conversion, project-relative paths,
  classification, line-shift stability.
- `languages/java/adapters/java-e2e/java-preset.e2e.test.mjs`: gated behind `NITPICKER_JAVA_E2E=1` (`npm run test:java`, which also runs `java-spring.e2e.test.mjs`, `escape-hatches.e2e.test.mjs`, `languages/java/adapters/java-e2e/pit-targets.e2e.test.mjs` and `languages/java/maven/maven-preset.e2e.test.mjs`, one file at a time because each stops the Gradle daemons when it ends). Needs Java 21, Gradle and network access to Maven Central; about 85 seconds
  warm. On a tiny Gradle project (`languages/java/adapters/fixtures/gradle-project`, one legacy PMD and
  SpotBugs violation on the base) it checks: a clean change passes; a change that only moves the
  legacy violation stays baselined; a change adding an empty catch block (PMD), a default-charset
  `String` (SpotBugs) and misformatted code fails with exactly those three findings as new.
  `pit-targets.e2e.test.mjs` runs `nitpickerPit` on a project whose packages sit under `org.acme`
  and a class directly in `org`, and checks that PIT starts and mutates every class.
- The conformance suite (`npm run test:conformance`) already covers the comparison itself. The
  Java-specific part of X11's done criterion ("passes the conformance suite") is that the findings
  produced here satisfy the findings schema, which `collectJavaFindings` enforces on every run via
  `parseAnalyzerReport`.
