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
  -> <report dir>/modules.json and, per Gradle project that applies java, <report dir>/<key>/{pmd.sarif, spotbugs.sarif, errorprone.json, format.txt, jacoco.xml, checkstyle.xml, checkstyle-<source set>.xml, archunit/*.xml, structure.json, pit/mutations.xml, jdeps.txt, jdeps-classes.txt, forbidden-apis.txt, cpd.xml, dependencies.json, guards-plan.json, javac-lint.txt, permits.txt, manifest.json}
     (nitpickerLint runs node languages/java/adapters/gradle-reports/gradle-guards.mjs on its guards-plan.json)
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
  JaCoCo 0.8.12, Checkstyle 10.21.1, Error Prone 2.50.0, NullAway 0.14.2). Tools run from their own configurations (`nitpickerPmd` and so on), so they never
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
  A project's names depend only on its own folder, never on how many projects there are: a lone
  subproject is named with its folder too. The `permits.txt` of every project is merged with the
  same names, so a sealed type's `permits` edge is left out whichever project declares it. The
  root's names and identities are as in a one-project build, which reads its own jdeps reports
  unmerged.
- **Nitpicker side: `languages/java/adapters/`.** `runJavaPreset` runs the task,
  `readJavaFindings` converts the reports, `runJavaDiff` does worktrees, rename map, comparison.
  `languages/java/adapters/java-analyzer.mjs` wraps all of it as one analyzer named `java` for the CLI (slice
  2, below).
- **Base snapshot dependencies.** Gradle resolves from its own cache, so unlike npm no install step
  is needed, and the X7 dependency hook (`dependency-hooks.mjs`) is not used by slice 1. If a
  project vendors dependencies in the tree, a `gradleDependencyHook` with the manifests
  `build.gradle(.kts)`, `settings.gradle(.kts)`, `gradle/libs.versions.toml` and `gradle.lockfile`
  fits the X7 interface.
- **Failure policy.** If Gradle fails on either snapshot (does not compile, tool crashes, no
  `gradle` on the PATH, unreadable reports), nothing is silently skipped. `runJavaDiff` (the library
  entry) throws; the CLI path maps the failure to a `tool-error` finding, see slice 2. Failing tests
  are not a build failure: see [Failing tests](#failing-tests).

## Failing tests

A project whose test suite does not fully pass still gets every analyzer that can work, on Gradle
and on Maven alike:

- **Static analyzers** (PMD, SpotBugs, Error Prone, Checkstyle, google-java-format, forbiddenapis,
  the structure metrics, CPD and the guards) run as usual. Gradle's test tasks get
  `ignoreFailures = true` (`languages/java/gradle/tasks/tests/test-failures.gradle`), and Maven runs
  with `-Dmaven.test.failure.ignore=true`.
- **Coverage and CRAP** come from the tests that ran: JaCoCo records every test that executed,
  passing or failing.
- **The failing tests** are one `tests/tests-failed` tool error per module and snapshot. It names
  each failing test (`Class.method: first line of the failure`), the side and module (`Tests fail in
module lib of the base snapshot`), and says what still ran.
- **Mutation testing** runs with the failing test classes (and their nested classes) left out
  through PIT's `--excludedTestClasses`, so the passing tests still kill mutants; the tool error
  lists the classes left out. When every test class has a failing test, or Gradle reports a failed
  test task without naming a failing test, PIT does not run and a `pit/tests-failed-skipped` tool
  error says why.
- **The contract** between the builds and the reader is `test-failures.json` in each module's report
  directory: `{ "failures": [...], "excludedTestClasses": [...], "skipped": [{ "tool", "reason" }] }`
  (`languages/java/adapters/reporting/outcomes/test-results.mjs`). A tool listed under `skipped` (`jacoco`,
  `crap`, `pit`, `test-runtime`) is not read, and its own tool error names it with the reason.
- **Comparison.** A tool error from one tool leaves out only that tool's findings on both snapshots
  (`skippedTools` in `core/diff/comparison/results.mjs`); every other Java finding is still
  compared. The summary hides a `tests-failed-skipped` notice when the same snapshot has a
  `tests-failed` error, which already lists it.

## Maven builds

A project is built with Maven when its root has a `pom.xml` and no Gradle build file
(`settings.gradle(.kts)`, `build.gradle(.kts)`); with both, a lone `mvnw` (no `gradlew`) picks
Maven, anything else Gradle. Nothing is configured and the choice is never a finding: both builds
are valid, so nitpicker follows the one the project uses (`detectJavaBuild` in
`languages/java/builds/java-build.mjs`). Maven 3.6.3 or newer is needed.

The Maven side produces the same reports as the init script, one set per module in
`<module>/target/nitpicker/`, so the same ingesters read them and the findings are identical: the
end-to-end suite builds one source tree with Gradle and with Maven and compares the findings field
by field. Per snapshot:

1. `mvn help:effective-pom` (help plugin pinned): the modules, their source, test, resource and
   output directories (plus `build-helper-maven-plugin` `add-source`/`add-test-source` roots), the
   surefire and failsafe reports directories (an execution's `<reportsDirectory>` before the
   plugin's), whether Failsafe runs (below), the `destFile` of every JaCoCo `prepare-agent` and
   `prepare-agent-integration` execution the project configures, and the
   `nitpicker.archunit.includes` property (read from the POM's `<properties>` only, not from `-D` or
   `settings.xml`). Module directories come from following the effective `<modules>` (active
   profiles included) from the root `pom.xml`. Each module's `pom.xml` is matched to its effective
   project by `groupId:artifactId`, or, when the raw coordinates use a property, by the effective
   build directory inside the module directory. A declared module that matches nothing, a module
   outside the project root, or two modules in one directory is a tool error.
2. One build: `mvn jacoco:prepare-agent test dependency:list` (JaCoCo at the init script's version,
   dependency plugin pinned), with `-Dmaven.test.failure.ignore=true` and the project's own
   Checkstyle, PMD, CPD, SpotBugs and Spotless checks skipped. `dependency:list` writes every
   module's resolved classpath (reactor modules as their `target/classes`, or as their packaged jar
   in a `verify` build). Our coverage file (`target/nitpicker-jacoco.exec`) and every project
   `destFile` inside `target` are deleted before the build, so coverage never accumulates across
   runs. Maven gets 15 minutes; a build that takes longer is stopped and reported as a
   `java/maven-failure` that names the limit and warns that its post-integration-test steps may not
   have run.
3. The tools resolved once from Maven Central through Maven itself (a generated tools project in
   `$XDG_CACHE_HOME/nitpicker` or `~/.cache/nitpicker`, private to the user, reused while the jars
   exist), so the project's `settings.xml` mirrors apply.
4. Per module, outside Maven: PMD, SpotBugs, google-java-format, Checkstyle (the bundled Google
   checks without inline suppression filters, as in the init script), `StructureMetrics.java`,
   jdeps, the JaCoCo CLI report and PIT, with the same arguments and classpaths as the init script
   tasks (PMD's auxiliary classpath is the main and test compile classpaths plus both class
   directories). The versions are read from the init script's `pinned` map, so both builds always
   run the same tools.

- **Integration tests.** Failsafe runs in a module whose effective POM (`<build><plugins>`, so
  neither `<pluginManagement>` alone nor an inactive profile) binds maven-failsafe-plugin's
  `integration-test` goal in an execution, unless the project keeps it off: a `skipITs` or
  `skipTests` property set to `true`, `<skip>`, `<skipITs>` or `<skipTests>` set to `true` in that
  execution's or the plugin's configuration (the execution's wins), or the execution's phase `none`.
  When any module runs Failsafe, the build runs `verify` instead of `test`, so the project's
  `package`, `pre-integration-test` and `post-integration-test` steps run as they normally do and
  containers it starts are stopped again. `-Dmaven.test.failure.ignore=true` also keeps
  `failsafe:verify` from failing the build. The `verify` build adds `-Djacoco.haltOnFailure=false`,
  so a `jacoco:check` the project binds to `verify` only warns (`haltOnFailure` belongs to `check`
  alone, so our `prepare-agent` is unaffected), and skips the plugins that sign, publish, need the
  network or check a release: `-Dgpg.skip=true`, `-Dmaven.javadoc.skip=true`,
  `-Dmaven.source.skip=true`, `-Dmaven.deploy.skip=true`, `-Djib.skip=true` (all Jib goals,
  `dockerBuild` too), `-Ddependency-check.skip=true`, `-Drat.skip=true`, `-Dlicense.skip=true`
  (com.mycila's license plugin), `-Dlicense.skipDownloadLicenses=true` and
  `-Dlicense.skipAggregateDownloadLicenses=true` (the Codehaus license plugin, which has no single
  skip property), and `-Djapicmp.skip=true`. fabric8's `docker.skip` is not set: it also skips
  `docker:start` and `docker:stop`, which integration tests rely on. A project without Failsafe, or
  with Failsafe kept off in every module, stays on `test`.
- **Tests.** Failures of the ArchUnit rule classes (`*ArchTest`, `*ArchitectureTest`, or the
  `nitpicker.archunit.includes` property in the POM) become findings; any other failing test, from
  Surefire's or Failsafe's reports, is reported as described in [Failing tests](#failing-tests),
  and every analyzer still runs. Reports older than the build are ignored. Gradle runs the
  ArchUnit classes in their
  own task, but Maven only has the Surefire and Failsafe results: when a module has ArchUnit classes
  and neither plugin ran any of them (Surefire's `<includes>` miss them, as they would `*Rules`, or
  the module skips tests), that is a tool error rather than a silent pass. ArchUnit reads bytecode
  without running it, so running these classes in the covered test run does not change coverage.
- **Slow-test reports.** Per module, the fresh `TEST-*.xml` files of surefire's reports directory
  (`<reportsDirectory>` of maven-surefire-plugin, default `<build directory>/surefire-reports`) are
  copied to `target/nitpicker/test-results/surefire/` and those of maven-failsafe-plugin's (its
  `<reportsDirectory>`, default `<build directory>/failsafe-reports`) to `test-results/failsafe/`,
  without the ArchUnit rule classes (as Gradle leaves out its ArchUnit task). When both plugins
  report to the same directory, it is copied once, as `surefire`, so unit tests keep the unit
  budget. Only files written since the build started are copied, so results left by an earlier run
  never count. `failsafe` counts as an integration task, so the tests Failsafe runs in a `verify`
  build get the integration budget.
- **JaCoCo.** Our `prepare-agent` always runs; a project's own `prepare-agent` or
  `prepare-agent-integration` replaces it in `argLine` (the agent replaces an earlier agent there).
  Without a configured `destFile` the project's agent still writes our file, because our
  `-Djacoco.destFile` sets the default of both goals; a configured `destFile` is read as well. Every
  fresh file among ours and the configured ones goes to one JaCoCo report. Failsafe reads the same
  `argLine`, so integration tests append their coverage to the unit tests' file. A module whose
  tests ran but left no fresh coverage file is a tool error that points at a surefire `<argLine>`
  without `@{argLine}`. A module whose test classes ran no test (only helpers, or `*IT` classes
  without a Failsafe that runs them) gets zero coverage, as on Gradle, and a module without main
  classes gets an empty report. Failsafe tests the packaged jar; when that jar is shaded with
  relocated packages, its classes no longer match `target/classes`, so the coverage integration
  tests record for relocated classes is lost.
- **Multi-module.** Each module (packaging other than `pom`) is analyzed on its own and its findings
  are prefixed with the module path (`core/src/main/java/...`). Coupling is computed once over all
  modules, so a dependency from one module to another counts, and file limits are evaluated once
  over every module's roots, so `exceptions` and `exclude` globs are relative to the project root
  (`languages/java/builds/java-modules.mjs`; both builds share `builds/project-wide.mjs`). Duplicate
  detection runs per module, so a clone between two modules is not found, as a clone between two
  source roots is not.
- **Module descriptors.** jdeps reads a class directory with a `module-info.class` as a module and
  must then resolve every module its descriptor `requires`; it stops on a plain jar ("Unable to
  derive module descriptor"), a missing module or a split package. Both builds run jdeps on such a
  module exactly as on one without a descriptor, with no module path: over a temporary copy of the
  class files of the modular class directories, without `module-info.class`, made in the build
  directory (`target/` on Maven, Gradle's build directory) and removed afterwards
  (`languages/java/maven/coupling/maven-jdeps.mjs`, and `tasks/jdeps-task.gradle`). The copy and
  `jdeps-classes.txt` take regular `.class` files only, so a symbolic link inside a class directory,
  to a file or a folder, is left out of both (a class directory that is itself a link is read
  through it), and on Maven it goes to the system
  temporary directory when the class directory is the build directory or holds it, since a copy
  into itself is impossible. A class directory without a descriptor is read in place. Only the
  edges between the module's own classes are read, so coupling is the same. When jdeps fails, the error gives its exit code and up to 10
  lines of its stderr, the `Error`, `Exception` and `Caused by` lines first, without the JVM's
  `Picked up ...` notes.
- **Guards.** The [guards](#guards) run on Maven too, outside Maven and per module
  (`languages/java/maven/guards/`), writing the same reports in `target/nitpicker/`. The javac
  lint pass reads the `maven-compiler-plugin` settings from the effective POM (`release`, `source`,
  `target`, `encoding`, `compilerArgs`, `compilerArgument`, `enablePreview`, the `default-compile`
  execution's configuration first, then the plugin's, then the `maven.compiler.*` properties; a
  value still holding an unresolved `${...}` counts as unset). It compiles with the `javac` of
  `JAVA_HOME` (or the PATH), not a Maven toolchain, against the main compile classpath (compile,
  provided and system scopes), takes Lombok from it, and reads the sources in the project's
  encoding. The runner is the one the Gradle side uses (`languages/java/builds/lint/`), so staging,
  the differential lint and the Lombok handling below are the same on both builds; the annotation
  processors' generated sources for a module with a descriptor come from
  `target/generated-sources/annotations`. A POM that sets no release, source or target is linted
  as Java 8, the compiler plugin's default. Sources under a root outside the module directory (a
  `build-helper` root such as `../shared/src`) are not linted; their classes are on the class path, except in a module with
  a `module-info.java`, where such a root can make the lint compile fail (`javac/lint-not-run`). In
  a module with a descriptor, jars that are modules go on `--module-path` and the rest on `-cp`,
  as on Gradle; when that compile fails, it is retried with every jar on `--module-path`, as the
  compiler plugin puts a plain jar there when `module-info.java` requires it (the Gradle side
  retries the same way). On the head it reuses the base's warnings for unchanged files exactly as
  on Gradle. forbiddenapis reads the module's
  output directory (`target/classes` unless the POM moves it) against the main compile classpath
  and is skipped when the module has no classes; CPD, the guard, code smell and test-honesty PMD
  rulesets, `pmd-tests.xml` (`TestClassWithoutTestCases` with the main source roots excluded, after
  the guard rulesets and before the Spring one, only with Nitpicker's rulesets on),
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
  features, a module descriptor that requires a jar module, and an older release.
- **Binary.** `NITPICKER_MAVEN` when set; otherwise the project's `mvnw` (`mvnw.cmd` on Windows),
  run with `sh` when not executable; otherwise `mvn` from the PATH. A missing `mvn` is a tool error
  that names these three ways. The JDK tools (`java`, `jar`, `jdeps`) come from `JAVA_HOME` when
  set, else the PATH.
- **Not covered.** The Kotlin preset needs Gradle and says so; use the java preset for a Maven
  project's Java sources. A surefire or Failsafe configuration that sets
  `<testFailureIgnore>false</testFailureIgnore>`, or a `jacoco:check` that sets
  `<haltOnFailure>true</haltOnFailure>`, explicitly overrides the command line, so a violated
  ArchUnit rule or coverage rule stops the build as a tool error. Maven 3 cannot resolve a
  `test-jar` dependency on another module in the `test` phase; such reactors fail as they would with
  `mvn test` (a `verify` build packages them first). Gradle multi-project builds still read only the
  root project's reports (see [Slice 1](#slice-1-what-is-deliberately-not-included)).

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
- **What runs.** `nitpickerPit` (`languages/java/gradle/tasks/pit-task.gradle`) runs the pinned `pitest-command-line` (1.17.4) with the
  `pitest-junit5-plugin` (1.2.1), default mutators, XML output, two threads, to
  `pit/mutations.xml` in the report directory. Tests are named class by class (`--targetTests`), and
  `--mutableCodePaths` limits mutation to the main classes. The JUnit Platform is not pinned by
  Nitpicker: the plugin's own platform dependencies are excluded and the project's are used, with a
  launcher of the project's engine version added when the project does not declare one. PIT
  needs a green run of the tests it uses, so it leaves out the test classes that failed
  (`--excludedTestClasses`, see [Failing tests](#failing-tests)). Projects without main classes
  produce no report and no findings.
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
  snapshot), whose findings carry the tool names `pmd`, `spotbugs`, `errorprone` (Error Prone and NullAway, below), `google-java-format`, `jacoco`,
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
  there still has to be well formed. With this bundled config the tasks run on nitpicker's own
  `nitpickerCheckstyle` configuration, so a project that declares its own Checkstyle version in
  `checkstyle` still gets the pinned version and its config; a project config chosen by policy
  keeps the project's Checkstyle classpath. Decision to review: google_checks is noisy on
  code that was never written for it, but the gate is differential, so existing violations stay
  baselined and only new ones fail.
- **Ingestion.** `ingestCheckstyle` (X6) unchanged, `tool` `checkstyle`, absolute file paths made
  project-relative. Severities `error` and `warning` are enforceable, `info` is descriptive. The
  rule is the check's short name (`checkstyle/Indentation`, not the class
  `com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck`), or the `id` the config
  gives the module (`checkstyle/RightCurlySame`); see [Rule messages](#rule-messages).

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

| Tool                 | Report                      | Ingester                                              | Classification                                                    | Identity                                                                                                                                                              |
| -------------------- | --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jscpd (`duplicates`) | jscpd JSON, per source root | `normalizeDuplicates` (TypeScript `duplicates` check) | `duplicate-clone` enforceable; `duplicate-clone-size` descriptive | Sorted file pair, a hash of the cloned text, and the n-th occurrence of that text in the pair; the size metrics use pair, occurrence and metric name. No line number. |

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
  the `test` task, `failsafe` as an integration task. Failsafe runs when the project binds its
  `integration-test` goal and does not keep it off, because nitpicker then builds to `verify`.
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
  and the multi-module and `failsafe` Maven e2e fixtures.

## Error Prone and NullAway

- **What runs.** `nitpickerErrorProne`, a dependency of `nitpickerJava`, compiles the main and
  the test Java sources a second time with javac and Error Prone 2.50.0 (Apache 2.0) as its
  plugin, plus NullAway 0.14.2 (Uber, MIT), an Error Prone plugin for null safety. The task lives
  in `languages/java/gradle/errorprone/` (`error-prone.gradle`, applied by the init script to
  every `java` project, and `ErrorProneReport.java`). It uses the classpath, annotation processors,
  compiler arguments and encoding of `compileJava` and `compileTestJava`, writes classes only to
  the throwaway `build/nitpicker/errorprone/`, and leaves the regular compile and the consumer
  build alone. javac runs in its own JVM through `ErrorProneReport.java` in single-file source
  mode, which writes every diagnostic to `build/nitpicker/errorprone.json`. Error Prone and
  NullAway resolve from a detached configuration with their versions pinned in the init script's
  map, so a dependency-management plugin of the project cannot move them. A compile error in this
  second compile fails the task with javac's errors (a `tool-error` on the CLI path); it never
  becomes an empty report. `module-info.java` is left out, so the sources compile in the unnamed
  module. Kotlin preset: Java sources only, like PMD and SpotBugs.
- **Which JDK.** Error Prone needs JDK 21 or newer. On Gradle the runner uses the JVM that runs
  Gradle when it is at least 21 and at least the JDK of every compile task's toolchain; otherwise
  it asks Gradle's toolchain service for a launcher of the version it needs (found locally or
  downloaded, like the project's own toolchains), and when there is none it fails with a message
  that says which JDK to install or how to let Gradle download it. With `--enable-preview` it runs
  on exactly the project's JDK, since only that JDK compiles its preview features. On Maven the
  runner uses the JDK Maven runs on (`JAVA_HOME`, else `java` on the PATH) when it is 21 or newer
  (with `--enable-preview`, always that JDK); otherwise it takes the installed JDK closest to 21
  from the `JAVA_HOME_<N>_X64`/`_ARM64` variables of hosted CI, the `jdkHome` entries of
  `~/.m2/toolchains.xml`, SDKMAN, `/usr/lib/jvm` and `/Library/Java/JavaVirtualMachines`, so a
  project on JDK 17 keeps working wherever a JDK 21 is installed. With none it fails before
  anything compiles, naming the JDK it needs and where it looked; a missing `java` is reported as
  `java not found`.
- **Language level and options.** The runner mirrors the project's own form: `--release <n>` when
  the build uses `release`, `-source <n> -target <n>` when it uses source and target compatibility
  (a project on `-source 8` stays on 8). A `--release` next to an `--add-exports` of a JDK module
  (`java.*`, `jdk.*`) becomes `-source`/`-target`, which javac requires. Of the build's compiler
  arguments it keeps `--enable-preview`, the `-A` processor options and the module options javac
  takes (`--add-exports`, `--add-modules`, `--add-reads`); `--add-opens`, a runtime option, is
  dropped and so never changes the level. Argument files are
  written as UTF-8.
- **Maven.** Maven builds run the same `ErrorProneReport.java` from `languages/java/maven/errorprone/`
  after `mvn test`. The compiler settings come from the effective POM (`help:effective-pom`), so
  parents, `pluginManagement`, imported BOMs (Spring Boot's parent among them) and `${...}`
  properties are already resolved; the `default-compile` execution's configuration wins over the
  plugin's, and the test pass reads `default-testCompile` and `testRelease`, `testSource` and
  `testTarget` the same way. `compilerArgs`, `compilerArgument` (split at spaces) and
  `enablePreview` give the compiler arguments; an empty element such as `<release/>` counts as
  missing. With no level at all, `maven-compiler-plugin` 3.x compiles for its own default (1.5 to
  1.8, by version), which the runner gives javac as `-source 8 -target 8`, the oldest level JDK
  21's javac takes; plugin 4.x has no such default and javac's own applies. An `annotationProcessorPaths` entry without a version takes it from the effective
  `dependencyManagement`, as `maven-compiler-plugin` does; one with no version there, or an
  unresolved one, is a tool error that names the coordinate, never a guessed version. Without
  `annotationProcessorPaths` the processors come from the classpath, as javac finds them. The main
  classpath ends with `target/classes`, so classes that code generators (protobuf, JAXB, OpenAPI,
  jOOQ, ANTLR) compiled there resolve; the module's own sources are compiled from source and take
  precedence over those classes. The runner turns `checks.json` into Error Prone flags, finds the
  project's packages from its classes, and decides the language level and kept options, so the two
  builds cannot drift apart; the Maven e2e test checks that both give the same findings.
- **Findings.** `languages/java/ingest/errorprone/errorprone.mjs`, through
  `languages/java/adapters/errorprone/java-errorprone.mjs`: tool `errorprone`, rule the check
  name (`errorprone/FutureReturnValueIgnored`, `errorprone/NullAway`), every finding enforceable.
  The message is the diagnostic's first line plus Error Prone's `Did you mean ...` fix when it has
  one, rewritten by `ingest/errorprone/messages.mjs`: NullAway gets the allowed form (annotate with
  the `@Nullable` the project already uses, JSpecify's only when it uses none, and check before
  use, or give a non-null value), so no skill line is needed for it; `CheckReturnValue` says to use
  the result or make the method return void, without Error Prone's `@CanIgnoreReturnValue`,
  `verify(...)` and `var unused` alternatives; `JavaTimeDefaultTimeZone` says to inject a `Clock`
  or `ZoneId`; `DefaultCharset` says the result depends on the runtime and the JDK version (JDK 18
  made UTF-8 the default) and asks for the charset explicitly; a suggestion of punctuation alone
  (`'{'`, `'*'`) is dropped; and where the source set's compile classpath has no Guava
  (`guava`/`testGuava` in `manifest.json`), Guava suggestions are given in their JDK form
  (`IllegalStateException` for `VerifyException`, `List.of` for `ImmutableList.of`) or dropped,
  with the summary's Guava advice too. In the java preset, a finding of a
  check that can flag correct code ends with the exceptions route, in the same words as the other
  tools (`If this is intended, add {"rule":"errorprone/<Check>",...} to "exceptions" ...`, with the
  file as the path). Only findings in main sources of the checks in `certainBugs` in `checks.json` go without it: a
  curated list of ERROR checks whose finding in main code is a bug, not a severity filter (the
  ERROR checks left out, and why, are listed below). Findings in test sources always keep the
  route, since a test can build the broken case on purpose. The route is added after the identity is computed, so it
  does not change it. Diagnostics outside the main and test source roots (annotation-processor
  output) are dropped. Diagnostics with the same check, file, line, column and message are one
  finding, and the `class is an internal JDK API` diagnostic `SunApi` adds at the `.class` of a
  literal it already reported is dropped; different columns or messages on a line stay apart. Identity: a hash of the check and the
  message's first line, with
  `line <n>` removed, and `#2`, `#3` for repeats in one file in source order; no line, no path and
  no `Did you mean` text, so moved or reformatted code stays baselined and a renamed file follows
  the rename map.
- **Policy: every check that catches a bug class or names one allowed form.** All 641 checks of
  2.50.0 were reviewed, including the off-by-default, experimental and suggestion-level ones
  (`reviewedChecks` in `checks.json`, with the reviewed Error Prone and NullAway versions under
  `reviewed`; a unit test fails when the init script or the Maven path pins other versions, and
  the e2e test fails when the jar's checks differ from the reviewed ones). On: every ERROR and
  WARNING check Error Prone enables by default except 10, plus 109 of its off-by-default checks (for
  example `FieldCanBeLocal`, `FieldCanBeFinal`, `IdentifierName`,
  `PrivateConstructorForUtilityClass`, `RedundantThrows`, `CheckedExceptionNotThrown`,
  `ThrowSpecificExceptions`, `NonFinalStaticField`, `BanSerializableRead`,
  `UseCorrectAssertInTests`): 595 checks. A check is off only when another check that is always on
  reports every case it does at the same place, it fights another tool, needs an annotation library a project would add only for it (Error Prone's own
  annotations, Guava, auto-common), flags legitimate code with no allowed form, or picks one of two
  forms that are both valid conventions (`var` or the explicit type, `final` on parameters and
  locals or not, `getClass()` or `instanceof` in `equals`, an if-chain or a `switch`): those are
  never flagged. One-way rules stay on, such as `StatementSwitchToExpressionSwitch`,
  `UnnecessarilyFullyQualified`, `NegativeBoolean`, `UnnecessaryTestMethodPrefix` and
  `UnnecessaryStaticImport`. Checks for libraries a project does not use (Guice, Dagger,
  AutoValue, Flogger, Truth, protobuf, Android) stay on: they cost nothing and fire only where the
  library is used. Error Prone's severities do not matter: everything is reported as a warning
  (`-XepAllErrorsAsWarnings`) and every finding is enforceable. The checks that are off are below.
- **Results of the project's own methods.** `CheckReturnValue` runs with `Packages` set to the
  project's top-level packages (the shortest packages holding its main or test classes; Error
  Prone matches subpackages too), so ignoring the result of any of the project's own methods
  fails, in main and test code, test-only packages included. The message asks to use the result
  or make the method return void; a value dropped on purpose can still be assigned to
  `var unused = ...` (PMD's unused-variable rules skip names starting with `unused`).
- **NullAway.** Main sources only: a test that passes `null` on purpose to check the failure is
  legitimate. `AnnotatedPackages` is the project's main packages: its code is non-null unless
  marked, and a field, parameter or return value that may be null carries a `@Nullable` (NullAway
  accepts any annotation of that simple name, so whichever one the project uses is right and never
  flagged; JSpecify's `org.jspecify.annotations.Nullable` is the one to add when it has none, and
  Spring Framework 7 already depends on it). Libraries without nullness annotations are trusted.
  Fields a framework sets are not reported as uninitialized (the `nullAway` options in
  `checks.json`): `@Autowired`, `@Value`, `@Inject` (javax, jakarta, Guice), `@PersistenceContext`,
  Mockito's `@Mock`, `@InjectMocks`, `@Spy` and `@Captor`, Spring Boot's `@MockBean`, `@SpyBean`,
  `@MockitoBean` and `@MockitoSpyBean`, the fields of a JPA `@Entity`, `@Embeddable` or
  `@MappedSuperclass` class (NullAway's `ExternalInitAnnotations`: its methods are still checked),
  and fields a `@PostConstruct` method sets. A plain bean whose field
  only a setter assigns keeps the finding. Without main classes in a named package,
  `CheckReturnValue` keeps its defaults and NullAway is off.
- **Annotated classes.** The runner records, for every diagnostic, the annotations of every
  class around it (so a nested or anonymous class of an exempt class is exempt too),
  meta-annotations included (`classAnnotations` in `errorprone.json`,
  so `@SpringBootApplication` also lists `@SpringBootConfiguration` and `@Configuration`).
  `classExemptions` in `checks.json` names the checks a class annotation rules out, and those
  diagnostics are dropped; the table below gives the reason for each. `IdentifierName` also spares
  a class named the way Maven's Failsafe plugin finds integration tests (`AdderIT`, `ITAdder`,
  `AdderITCase`; `exemptions/test-class-names.mjs`).
- **No inline escape.** Error Prone honors `@SuppressWarnings`, because Lombok marks the members
  it generates with `@SuppressWarnings("all")` and Error Prone must skip them. The inline
  suppression scan reads the source the project wrote, where Lombok's annotations are not, and
  reports as `errorprone/InlineSuppression`: every `@SuppressWarnings` value that would silence a
  check nitpicker runs (its name or an alternative name such as `"dep-ann"`, the `suppressible`
  list in `checks.json`) or NullAway (`"NullAway"`, `"NullAway.Init"`); `@NullUnmarked`, which
  turns NullAway off for the code under it; and a `@CanIgnoreReturnValue` annotation the project
  declares itself (any one not from `com.google.errorprone.annotations`), which Error Prone honors
  by simple name. `"all"` and `"unused"` are already `pmd/InlineSuppression`. So a suppression
  still fails the gate, as with PMD. Code that is right despite a check takes an exception:
  `{ "rule": "errorprone/<Check>", "paths": [...], "reason": "..." }`.
  `SuppressWarningsWithoutExplanation` stays on, with a message that asks to explain an existing
  suppression in a comment and says it is not a reason to add one.
- **Lombok.** Lombok runs as an annotation processor of the second compile (Gradle's
  `annotationProcessor` path, Maven's `annotationProcessorPaths` or classpath), so `@Data`,
  `@Builder`, `@RequiredArgsConstructor`, `@Slf4j` and the rest compile. Lombok gives generated
  members the position of the annotation that asked for them, and Error Prone 2.50.0 reports one
  position per diagnostic (its start; javac's end position is the same point, so there is no span
  to compare with the annotation's). `languages/java/adapters/errorprone/lombok/` therefore drops a
  diagnostic only when both hold: its position is exactly the `@` of an annotation Lombok
  processes (an explicit list of Lombok's annotations, resolved as javac does: a single-type
  import, then a type of that name declared in the file or its package, then `import lombok.*;`, so
  a project's own `Data` annotation is not Lombok's; never inside a comment; the offset is counted
  in the source decoded with the compile's `-encoding`), and its check is one whose own findings in written code can never sit at an
  annotation, because it reports an expression or statement (`UnnecessarySemicolon`,
  `UnnecessarilyFullyQualified`, `CheckReturnValue`, `PatternMatchingInstanceof`,
  `RedundantNullCheck`, `ExtendsObject`, `UnrecognisedJavadocTag`,
  `SuppressWarningsWithoutExplanation`, and NullAway's passed or returned `@Nullable`), plus
  `PrivateConstructorForUtilityClass` at `@FieldNameConstants` (the generated `Fields` class).
  Declaration checks such as `FieldCanBeFinal` are kept even when the
  declaration starts with a Lombok annotation, and so is NullAway's uninitialized-field finding at
  `@Data` or `@NoArgsConstructor`, which NullAway reports for the same field without Lombok.
  The sources whose nearest `lombok.config` (walking up from each source's directory until
  `config.stopBubbling = true`) sets `lombok.addSuppressWarnings = false` are compiled in a pass of
  their own, against the build's classes, with the checks listed under `lombokUnsuppressedOff` in
  `checks.json` off: `StringConcatToTextBlock` and `StatementSwitchToExpressionSwitch`, which crash
  on Lombok's generated code, and `UnnecessarilyFullyQualified`, `UnrecognisedJavadocTag`,
  `MissingBraces`, `MissingSummary` and `MultiVariableDeclaration`, which then report generated
  code at the annotation or field. The other sources keep every check, and the run does not fail.
- **Overlaps.** Where Error Prone, PMD, SpotBugs or Checkstyle report the same issue, it is
  reported once: every tool stays on, and after policy a finding is dropped only while the finding
  that stands for it (its primary, in the same line, member, Javadoc comment, class, field or
  file) is reported, so an exception for the primary or a primary tool that did not run brings it
  back. The pairs, the
  scopes and what "once" covers are under "Overlaps between the tools" below.
- **Measured** (findings on the whole project, main and test code): 130 on a 57-file Maven
  calculator project built with Gradle and 46 on Spring PetClinic, against 68 and 41 before the
  overlap checks were turned back on. The rise is checks that now stand for another tool's finding
  on the same code: on the calculator `LongLiteralLowerCaseSuffix` 37, `SystemOut` 17,
  `WildcardImport` 7 and `MissingOverride` 3 in place of Checkstyle's `UpperEll` 37 and
  `AvoidStarImport` 10 and PMD's `SystemPrintln` 14 and `MissingOverride` 3; on PetClinic
  `SystemOut` 5, `EmptyBlockTag` 4, `WildcardImport` 2, `InterruptedExceptionSwallowed` 1,
  `MissingOverride` 1 and `MissingSummary` 1 in place of their PMD and Checkstyle twins, plus
  `AnnotationPosition` 1. `MethodCanBeStatic` (2 and 7) and `ThrowsUncheckedException` (0 and 3)
  are off. Over all tools the enforceable findings went from 2875 to 2871 on the calculator and
  from 4037 to 4028 on PetClinic. The `gradle-project` fixture has 1 (`UnnecessarilyFullyQualified`)
  and the `spring-project` fixture 1 (`MissingOverride`). NullAway alone: 6, 4, 0 and 0, nearly all
  `@Nullable` values returned or passed where a non-null one is declared.
- **Cost.** A second compile of main and test sources: about 6 s on the fixtures and 30 s on the
  calculator and PetClinic, most of it JVM start-up and Error Prone's own class loading.
- **Limits.** A project whose own build already runs Error Prone gets nitpicker's run in
  addition; its Error Prone jars are taken off the processor path of the second compile.
- **Tests.** `ingest/errorprone/errorprone.test.mjs` (sample report, schema validity, line-shift and
  suggested-fix stability, one finding with a stable identity for a repeated diagnostic),
  `adapters/errorprone/java-errorprone.test.mjs` (paths, source roots, missing report, the
  exceptions route on test findings of certain bugs too, JDK forms without Guava, Lombok-generated
  diagnostics),
  `adapters/errorprone/exemptions/class-exemptions.test.mjs` (which class annotations spare which
  checks), `adapters/overlaps/static-overlaps.test.mjs` (each pair drops its secondary in its scope
  and not outside it, and the table has no cycle), `resolved-overlaps.test.mjs` (the cross-tool
  lines left on the probe, the partial-coverage cases kept, the order with policy, the docs list),
  `java-spans.test.mjs` (classes, members and fields at a line), `ingest/errorprone/messages.test.mjs`
  (message rewrites, Guava suggestions without Guava), `adapters/errorprone/lombok/lombok-generated.test.mjs`
  (which positions and checks count as generated),
  `adapters/errorprone/checks/checks-policy.test.mjs` (reviewed versions equal the pinned ones on
  Gradle and Maven, every list names reviewed checks, sorted, and every check turned off, kept on
  the exceptions route or spared in annotated classes is documented below),
  `maven/errorprone/maven-compiler.test.mjs` and `maven-jdk.test.mjs` (Maven compiler settings,
  processor-path errors, the JDK check), `suppressions/errorprone/errorprone-escapes.test.mjs` and
  the inline suppression cases in `suppressions/java-suppressions.test.mjs`, and, in
  `npm run test:java`: `adapters/errorprone/error-prone.e2e.test.mjs` (an ignored `Future`, ignored results
  of the project's methods in test code, a test-only package included, a returned `null` and a
  setter bean's field in main code, and no NullAway finding for `@Autowired`, `@Value`, a JPA
  entity's fields or a `null` passed in a test, while the entity's `null` return is reported; a
  utility class is reported and a `@SpringBootApplication` or `@Configuration` class is not; a
  `@SuppressWarnings` in main code is honored; the regular classes are byte-identical; a source that
  only the second compile sees fails the build with javac's error and no report; projects on
  `--enable-preview` with `--release`, an `--add-exports` of `java.base`, and `-source`/`-target 8`
  compile), `adapters/errorprone/lombok.e2e.test.mjs` (a Lombok project on Gradle, on Gradle with
  `lombok.addSuppressWarnings = false`, and on Maven runs the whole preset with no tool error and
  only the findings in written code, `import lombok.*;` with a `@Deprecated` method included),
  `adapters/errorprone/checks/checks-catalog.e2e.test.mjs` (loads the pinned jar's checks: the
  reviewed set is the jar's, `enable` names off-by-default checks and `disable` on-by-default ones,
  `certainBugs` plus the documented ERROR checks are exactly the enabled ERROR checks,
  `suppressible` is every name of every enabled check),
  `maven/errorprone/maven-errorprone.e2e.test.mjs` (a Spring Initializr style build with a local
  parent under `spring-boot-starter-parent`, MapStruct's processor configured in the parent's
  `pluginManagement` with a property version, Lombok's appended in the child with no version, and a
  class compiled into `target/classes` before the regular compile), and
  `maven/maven-preset.e2e.test.mjs` (the same findings, Error Prone's included, from a Maven and a
  Gradle build of the same sources). The JDK choice on Gradle was checked by hand: Gradle on JDK 17
  runs Error Prone on a JDK 21 launcher, and a project with a JDK 25 toolchain on a JDK 21 Gradle
  runs it on JDK 25.

### Checks that are off

`Default` is Error Prone's own default for the check.

| Check                            | Default | Why it is off                                                                                                                                                                                                                             |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AddNullMarkedToClass`           | off     | NullAway already treats the project's packages as null-marked, so the annotation (and a JSpecify dependency) adds nothing                                                                                                                 |
| `AddNullMarkedToPackageInfo`     | off     | Same as AddNullMarkedToClass: NullAway's AnnotatedPackages already covers the project's packages                                                                                                                                          |
| `AnnotateFormatMethod`           | on      | Its allowed form is Error Prone's @FormatMethod, a dependency nitpicker does not ask for                                                                                                                                                  |
| `AnnotationMirrorToString`       | off     | Its allowed form is auto-common's AnnotationMirrors, a dependency nitpicker does not ask for                                                                                                                                              |
| `AnnotationValueToString`        | off     | Its allowed form is auto-common's AnnotationValues, a dependency nitpicker does not ask for                                                                                                                                               |
| `AvoidObjectArrays`              | off     | Its allowed form for returned arrays is Guava's ImmutableList, and pmd/UseVarargs already proposes another form for array parameters                                                                                                      |
| `BooleanParameter`               | off     | Asks for /_ name= _/ comments on literal arguments; the clearer fix (an enum or a named method) is outside its message                                                                                                                    |
| `CanIgnoreReturnValueSuggester`  | off     | Its allowed form is Error Prone's @CanIgnoreReturnValue, a dependency nitpicker does not ask for                                                                                                                                          |
| `CannotMockFinalClass`           | off     | Mockito 5's default inline mock maker mocks final classes, so it flags working tests                                                                                                                                                      |
| `CannotMockMethod`               | off     | Mockito 5's default inline mock maker mocks final methods, so it flags working tests                                                                                                                                                      |
| `CatchingUnchecked`              | off     | pmd/AvoidCatchingGenericException already flags catch (Exception), and this check's fix (catch RuntimeException) is forbidden there too                                                                                                   |
| `ConstantField`                  | off     | Static final fields that are not deep constants (mutable collections, loggers) may be named in CONSTANT_CASE or lowerCamelCase, Google style's choice that IdentifierName accepts; this check forces CONSTANT_CASE                        |
| `DoNotCallSuggester`             | on      | Its allowed form is Error Prone's @DoNotCall, a dependency nitpicker does not ask for                                                                                                                                                     |
| `EmptyIf`                        | off     | errorprone/UnnecessarySemicolon, which is always on, reports every if (c); at the same position with a clearer fix                                                                                                                        |
| `EqualsGetClass`                 | on      | getClass() and instanceof in equals are both valid conventions, with different semantics for subclasses                                                                                                                                   |
| `EqualsMissingNullable`          | off     | Nullness is NullAway's job here; this check only asks for an annotation                                                                                                                                                                   |
| `FieldMissingNullable`           | off     | Nullness is NullAway's job here; this check only asks for an annotation                                                                                                                                                                   |
| `IfChainToSwitch`                | on      | An if-chain and a switch are both valid forms                                                                                                                                                                                             |
| `ImmutableMemberCollection`      | off     | Its allowed form is a Guava immutable type, even in projects without Guava                                                                                                                                                                |
| `ImmutableRefactoring`           | off     | A migration to Error Prone's @Immutable annotation, a dependency nitpicker does not ask for                                                                                                                                               |
| `InlineFormatString`             | on      | A format string inline or in a named constant are both valid forms                                                                                                                                                                        |
| `InlineMeSuggester`              | on      | Its allowed form is Error Prone's @InlineMe, a dependency nitpicker does not ask for                                                                                                                                                      |
| `InterfaceWithOnlyStatics`       | off     | Duplicates pmd/ConstantsInInterface for constant interfaces, and an interface of static methods is a valid form                                                                                                                           |
| `Java8ApiChecker`                | off     | Checks compatibility with JDK 8 (Android); every Java preset project targets a newer JDK                                                                                                                                                  |
| `MethodCanBeStatic`              | off     | An instance method that uses no instance state is a valid style (it can be overridden or mocked, and reads the same as its neighbours)                                                                                                    |
| `NonApiType`                     | on      | Its collection advice duplicates pmd/LooseCoupling and its primitive-array advice needs Guava                                                                                                                                             |
| `ParameterMissingNullable`       | off     | Nullness is NullAway's job here; this check only asks for an annotation                                                                                                                                                                   |
| `PreferredInterfaceType`         | off     | Fights pmd/LooseCoupling: it asks for the concrete type that rule forbids                                                                                                                                                                 |
| `RemoveUnusedImports`            | off     | google-java-format removes unused imports, so the file is already reported as unformatted                                                                                                                                                 |
| `ReturnMissingNullable`          | off     | Only asks for a @Nullable annotation; NullAway reports the returned null where it matters, and the fix is often a non-null value                                                                                                          |
| `StaticOrDefaultInterfaceMethod` | off     | Forbids static and default interface methods for old Android; they are the normal form in modern Java                                                                                                                                     |
| `StringFormatWithLiteral`        | off     | Crashes Error Prone 2.50.0 (IllegalFormatConversionException) on a format string that does not match its literal arguments, failing the whole run                                                                                         |
| `ThrowsUncheckedException`       | off     | Declaring an unchecked exception in throws documents it to callers, a valid style                                                                                                                                                         |
| `TooManyParameters`              | off     | The parameter limit is the project's choice; the structure rule function-parameters-limit sets it in nitpicker.config.json                                                                                                                |
| `UnnamedVariable`                | on      | An unused variable named \_ or a name are both valid forms, and its fix fights the var unused = ... form other checks ask for                                                                                                             |
| `UnnecessaryDefaultInEnumSwitch` | off     | Fights checkstyle/MissingSwitchDefault, which wants the default this check removes                                                                                                                                                        |
| `UnnecessaryFinal`               | off     | final on parameters and locals, or none, are both valid conventions; nitpicker never flags either                                                                                                                                         |
| `UnnecessaryLambda`              | on      | A lambda in a constant or helper and a method are both valid forms                                                                                                                                                                        |
| `UnusedVariable`                 | on      | Flags fields a framework reads or sets (JPA relations, @Autowired and @Value fields) with no allowed form but a suppression; PMD's UnusedPrivateField, UnusedLocalVariable, UnusedFormalParameter and UnusedAssignment cover written code |
| `UseEnumSwitch`                  | off     | An if-chain over an enum and a switch are both valid forms                                                                                                                                                                                |
| `UsingJsr305CheckReturnValue`    | off     | A migration to Error Prone's @CheckReturnValue annotation, a dependency nitpicker does not ask for                                                                                                                                        |
| `Var`                            | off     | Requires Error Prone's @Var annotation on every reassigned variable, a dependency nitpicker does not ask for                                                                                                                              |
| `VarWithPrimitive`               | off     | Fights the fix Error Prone itself suggests for an ignored primitive result (var unused = ...); int unused = ... satisfies both, but agents follow the suggestion                                                                          |
| `Varifier`                       | off     | var and the explicit type are both valid conventions; nitpicker never flags either                                                                                                                                                        |
| `VoidMissingNullable`            | off     | Nullness is NullAway's job here; this check only asks for an annotation                                                                                                                                                                   |
| `YodaCondition`                  | off     | Fights pmd/LiteralsFirstInComparisons, which wants the constant first                                                                                                                                                                     |

### ERROR checks that keep the exceptions route

ERROR-severity checks that are on but not in `certainBugs`, because they can flag correct code.
Their findings end with the exceptions route.

| Check                                   | Why it keeps the route                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AutoValueBuilderDefaultsInConstructor` | A style rule for where AutoValue builder defaults go; defaults in the constructor work                                                                 |
| `AutoValueConstructorOrderChecker`      | Matches argument names to parameter names, a heuristic that flags deliberate orders                                                                    |
| `BanClassLoader`                        | Security policy: plugin loaders and frameworks load classes on purpose                                                                                 |
| `BanJNDI`                               | Security policy: JNDI lookups are legitimate in application servers                                                                                    |
| `BanSerializableRead`                   | Security policy: reading serialized data from a trusted source is legitimate                                                                           |
| `ChainingConstructorIgnoresParameter`   | Matches parameter names, a heuristic that flags a deliberately different value                                                                         |
| `CheckReturnValue`                      | Ignoring a result on purpose is legitimate; the allowed form is var unused = ...                                                                       |
| `ClassName`                             | A file named after its first class when another top-level class is public compiles in some layouts; Checkstyle OuterTypeFilename reports the same case |
| `ComparableType`                        | Comparable over a supertype or another type can be deliberate and consistent                                                                           |
| `ConditionalExpressionNumericPromotion` | The promotion is often the intended result                                                                                                             |
| `ConstantOverflow`                      | Intended wrap-around in hash and checksum constants is correct code                                                                                    |
| `DeduplicateConstants`                  | A style suggestion: repeating a literal is correct code                                                                                                |
| `DepAnn`                                | A documentation mismatch, not a bug: the code behaves the same                                                                                         |
| `DoNotMock`                             | A library's advice against mocking a type; the mock works                                                                                              |
| `DoubleBraceInitialization`             | An anonymous subclass is sometimes intended (a serializable or overriding instance), not only a collection initializer                                 |
| `EqualsHashCode`                        | A hashCode-less equals is correct for objects never put in a hash structure (for example in a test double)                                             |
| `EqualsWrongThing`                      | Compares field names; equals over differently named but matching fields is correct                                                                     |
| `FloggerLogString`                      | A Flogger usage policy; a non-constant message logs correctly                                                                                          |
| `FunctionalInterfaceMethodChanged`      | A behavior change that can be intended                                                                                                                 |
| `GuardedBy`                             | Its lock analysis cannot follow every correct locking scheme                                                                                           |
| `GuiceInjectOnFinalField`               | Guice injects final fields; visibility is a policy concern                                                                                             |
| `HashtableContains`                     | Hashtable.contains is a correct, if old, name for containsValue                                                                                        |
| `IdentityBinaryExpression`              | x != x is the standard NaN test                                                                                                                        |
| `IdentityHashMapBoxing`                 | Boxed keys in an IdentityHashMap can be intended (cached values, identity on purpose)                                                                  |
| `Immutable`                             | Its immutability analysis rejects some correct immutable types                                                                                         |
| `ImpossibleNullComparison`              | A defensive null check on a value that cannot be null is redundant, not wrong                                                                          |
| `InsecureCryptoUsage`                   | Security policy: interoperating with an existing protocol can need the flagged algorithm                                                               |
| `IterablePathParameter`                 | A style rule about parameter types                                                                                                                     |
| `JUnit3TestNotRun`                      | Matches method names; a helper named test... is correct                                                                                                |
| `JUnit4TestNotRun`                      | Matches method names and shapes, a heuristic that flags helper methods named like tests                                                                |
| `JodaToSelf`                            | A redundant call, not a wrong one                                                                                                                      |
| `LabelledBreakTarget`                   | A style rule; a labelled block works                                                                                                                   |
| `LockOnBoxedPrimitive`                  | A risky but correct lock when the instance is private and never shared                                                                                 |
| `LoopConditionChecker`                  | Another thread can change the condition, which the check cannot see                                                                                    |
| `MisleadingEscapedSpace`                | A readability rule; the text is what the author meant                                                                                                  |
| `ModifyingCollectionWithItself`         | list.addAll(list) and similar calls can be intended                                                                                                    |
| `MustBeClosedChecker`                   | Ownership can pass to a caller or a framework that closes the resource                                                                                 |
| `NoCanIgnoreReturnValueOnClasses`       | A style rule about where the annotation goes                                                                                                           |
| `NonCanonicalStaticImport`              | A style rule; the import compiles to the same member                                                                                                   |
| `NullArgumentForNonNullParameter`       | A negative test passes null on purpose to check the failure                                                                                            |
| `NullTernary`                           | Fires on conditionals the code never unboxes on the null branch                                                                                        |
| `OptionalMapUnusedValue`                | A style rule: map with an unused value works                                                                                                           |
| `OptionalOfRedundantMethod`             | A redundant call, not a wrong one                                                                                                                      |
| `PackageInfo`                           | A style rule about package-info.java contents                                                                                                          |
| `ProtoBuilderReturnValueIgnored`        | build() for its validation alone is intended                                                                                                           |
| `ProtocolBufferOrdinal`                 | ordinal() is correct where the enum order is what the code wants                                                                                       |
| `RefersToDaggerCodegen`                 | A Dagger policy; tests and wiring code refer to generated code on purpose                                                                              |
| `RestrictedApi`                         | An API owner's allowlist; an allowed caller outside it is a review question, not a bug                                                                 |
| `ReturnValueIgnored`                    | Ignoring a result on purpose is legitimate; the allowed form is var unused = ...                                                                       |
| `SelfComparison`                        | Tests of compareTo reflexivity compare an object with itself on purpose                                                                                |
| `SelfEquals`                            | Tests of equals reflexivity compare an object with itself on purpose                                                                                   |
| `StaticQualifiedUsingExpression`        | A style rule; the static member is the same                                                                                                            |
| `SubstringOfZero`                       | A redundant call, not a wrong one                                                                                                                      |
| `SystemExitOutsideMain`                 | Command-line tools and launchers exit outside main on purpose                                                                                          |
| `TestExceptionChecker`                  | A style rule; @Test(expected = ...) works                                                                                                              |
| `UnicodeInCode`                         | Non-ASCII identifiers and literals are legal Java                                                                                                      |
| `UnnecessaryCheckNotNull`               | A redundant check, not a wrong one                                                                                                                     |
| `UnnecessaryTypeArgument`               | A redundant type argument, not a wrong one                                                                                                             |
| `UnsafeWildcard`                        | Flags wildcard types that are correct in the code at hand                                                                                              |
| `UnusedAnonymousClass`                  | An anonymous class created for its constructor's side effect is intended                                                                               |
| `UseCorrectAssertInTests`               | A style rule; assert in a test runs with -ea, which build tools set                                                                                    |
| `ZoneIdOfZ`                             | ZoneId.of("Z") is correct, only less direct than ZoneOffset.UTC                                                                                        |

### Overlaps between the tools

No Error Prone, PMD, SpotBugs or Checkstyle rule is turned off because one of the others reports
the same code: there is no SpotBugs exclude file, and the PMD ruleset leaves out only the
test-style rules named in its header. (Two Error Prone checks are still off as repeats:
`RemoveUnusedImports`, whose unused import google-java-format already reports as an unformatted
file, and `EmptyIf`, whose `if (c);` Error Prone's own `UnnecessarySemicolon` reports at the same
position.) Instead, `languages/java/adapters/overlaps/overlap-pairs.json` lists pairs of a
primary rule and the secondary rules it stands for, with a scope:

- `line`: the same file and line.
- `member`: the same method, constructor or field initializer, from a scan of the source that skips
  braces in comments, strings, characters and text blocks (`java-spans.mjs`).
- `javadoc`: the same Javadoc comment, whichever of its lines each tool names (Checkstyle's
  `SummaryJavadoc` reports the comment's first line, Error Prone's `MissingSummary` can name a
  later one, such as the line of an `@author` tag).
- `class`: the same class; a nested class is its own class.
- `field`: the same class and field name. SpotBugs names a field `pkg.Class.field` and often gives
  it no line, or the line of a write.
- `file`: the same file. Error Prone's `WildcardImport` reports a file once, at its first wildcard
  import, and its fix replaces them all, so it stands for every Checkstyle `AvoidStarImport` in
  the file.

`withoutOverlaps` (`static-overlaps.mjs`) runs in `collectJavaFindings`, on the base and the head
alike, after the policy's `exclude` and `exceptions` and before the legacy inventory. A secondary
finding is dropped only when a primary finding in the same scope is itself reported. So an
exception for the primary, a primary tool that did not run (PMD with
`nitpicker.pmd.nitpickerConfig=false`, NullAway without packages) or a primary dropped for its own
primary brings the secondary back, while a baselined primary still stands for its secondary, so a
baselined issue does not come back under another tool's name. The primary is the finding with the
clearest message: usually the Error Prone check with its fix over a SpotBugs pattern, the specific
check over the general one (`OptionalEquality` or `BoxedPrimitiveEquality` over
`ReferenceEquality`, over PMD's `CompareObjectsWithEquals` and SpotBugs `ES_COMPARING_*`), and the fullest switch check over the
rest (`MissingCasesInEnumSwitch` over `NonExhaustiveSwitch`, `MissingDefault`, Checkstyle's
`MissingSwitchDefault` and `SF_SWITCH_NO_DEFAULT`).

Where the primary covers only some of the secondary's cases, both stay on and the secondary is
dropped only in the scope the two share: `RV_RETURN_VALUE_IGNORED` on a method Error Prone's
`ReturnValueIgnored` does not know, `DM_DEFAULT_ENCODING` where `DefaultCharset` is silent,
`SS_SHOULD_BE_STATIC`, `RE_POSSIBLE_UNINTENDED_PATTERN`, `DMI_COLLECTION_OF_URLS`, `HE_*`,
`SR_NOT_CHECKED`, `NP_TOSTRING_COULD_RETURN_NULL`, PMD's `ReturnEmptyCollectionRatherThanNull` on a
method NullAway does not check, and `StringCharset` on a call `JdkObsolete` does not flag. `NM_BAD_EQUAL` (an `equal` method) is in no pair and stays on. The kotlin preset runs the same
step; with no Error Prone, PMD or Checkstyle on Kotlin sources, SpotBugs findings in Kotlin files
always stay.

"Reported once" is per pair. Two tools can still report one line when they name different issues;
on the probe project those are, among others, `LooseCoupling` and `JdkObsolete` on a `Vector`
field, `HidingField` and `URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD`, `RandomModInteger` and
`DMI_RANDOM_USED_ONLY_ONCE`, `ClassNewInstance` and `REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS`,
`SelfAssignment` and `AvoidReassigningParameters`, and Checkstyle's `MemberName` with
`FieldCanBeStatic`. `adapters/overlaps/resolved-overlaps.test.mjs` pins every cross-tool line left
on the probe's findings (`fixtures/probe-findings.json`, every enabled check with nothing turned off
for overlap), the partial-coverage cases kept, and the policy order;
`static-overlaps.test.mjs` checks each pair in its scope; a unit test checks that this list is the
table:

- line: `errorprone/ArrayHashCode` over `spotbugs/DMI_INVOKING_HASHCODE_ON_ARRAY`
- line: `errorprone/ArrayEquals` over `spotbugs/EC_BAD_ARRAY_COMPARE`
- line: `errorprone/ArrayToString` over `spotbugs/DMI_INVOKING_TOSTRING_ON_ARRAY`
- line: `errorprone/EqualsUnsafeCast` over `spotbugs/BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS`, `spotbugs/NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT`
- line: `errorprone/DoubleCheckedLocking` over `spotbugs/DC_DOUBLECHECK`, `spotbugs/IS2_INCONSISTENT_SYNC`
- line: `errorprone/DefaultCharset` over `spotbugs/DM_DEFAULT_ENCODING`
- line: `errorprone/EqualsIncompatibleType` over `spotbugs/EC_UNRELATED_TYPES`
- line: `errorprone/CollectionIncompatibleType` over `spotbugs/GC_UNRELATED_TYPES`
- line: `errorprone/BadShiftAmount` over `spotbugs/ICAST_BAD_SHIFT_AMOUNT`
- line: `errorprone/NarrowCalculation` over `spotbugs/ICAST_IDIV_CAST_TO_DOUBLE`
- line: `errorprone/IntLongMath`, `errorprone/NarrowCalculation` over `spotbugs/ICAST_INTEGER_MULTIPLY_CAST_TO_LONG`
- line: `errorprone/IntLongMath` over `errorprone/NarrowCalculation`
- line: `errorprone/InfiniteRecursion` over `spotbugs/IL_INFINITE_RECURSIVE_LOOP`
- line: `errorprone/ComparisonOutOfRange` over `spotbugs/INT_BAD_COMPARISON_WITH_SIGNED_BYTE`
- line: `errorprone/NonFinalStaticField` over `spotbugs/MS_FINAL_PKGPROTECT`, `spotbugs/MS_SHOULD_BE_FINAL`, `errorprone/FieldCanBeFinal`
- line: `errorprone/MutablePublicArray` over `spotbugs/MS_MUTABLE_ARRAY`, `spotbugs/MS_PKGPROTECT`
- line: `errorprone/NullAway` over `pmd/NullAssignment`, `pmd/ReturnEmptyCollectionRatherThanNull`
- line: `errorprone/InvalidPatternSyntax` over `spotbugs/RE_BAD_SYNTAX_FOR_REGULAR_EXPRESSION`
- line: `errorprone/BareDotMetacharacter` over `spotbugs/RE_POSSIBLE_UNINTENDED_PATTERN`
- line: `errorprone/RandomCast` over `spotbugs/RV_01_TO_INT`
- line: `errorprone/MathAbsoluteNegative` over `spotbugs/RV_ABSOLUTE_VALUE_OF_RANDOM_INT`
- line: `errorprone/DeadException` over `spotbugs/RV_EXCEPTION_NOT_THROWN`
- line: `errorprone/CheckReturnValue`, `errorprone/ReturnValueIgnored` over `spotbugs/RV_RETURN_VALUE_IGNORED`, `pmd/UselessOperationOnImmutable`
- line: `errorprone/SelfAssignment` over `spotbugs/SA_FIELD_SELF_ASSIGNMENT`, `spotbugs/SA_LOCAL_SELF_ASSIGNMENT`, `pmd/IdempotentOperations`
- line: `pmd/CheckSkipResult` over `spotbugs/SR_NOT_CHECKED`
- line: `errorprone/FieldCanBeStatic` over `spotbugs/SS_SHOULD_BE_STATIC`
- line: `errorprone/UnnecessarySemicolon` over `spotbugs/UCF_USELESS_CONTROL_FLOW_NEXT_LINE`, `checkstyle/NeedBraces`, `errorprone/MissingBraces`
- line: `checkstyle/NeedBraces` over `errorprone/MissingBraces`
- line: `errorprone/LockNotBeforeTry` over `spotbugs/UL_UNRELEASED_LOCK`, `spotbugs/UL_UNRELEASED_LOCK_EXCEPTION_PATH`
- line: `errorprone/WaitNotInLoop` over `spotbugs/UW_UNCOND_WAIT`, `spotbugs/WA_NOT_IN_LOOP`
- line: `errorprone/NonAtomicVolatileUpdate` over `spotbugs/VO_VOLATILE_INCREMENT`
- line: `errorprone/SubstringOfZero` over `spotbugs/DMI_USELESS_SUBSTRING`
- line: `errorprone/IdentityBinaryExpression`, `errorprone/SelfComparison`, `errorprone/SelfEquals` over `spotbugs/SA_FIELD_SELF_COMPARISON`, `spotbugs/SA_LOCAL_SELF_COMPARISON`
- line: `errorprone/LockOnBoxedPrimitive` over `spotbugs/DL_SYNCHRONIZATION_ON_*`
- line: `errorprone/BoxedPrimitiveConstructor` over `spotbugs/DM_FP_NUMBER_CTOR`, `spotbugs/DM_NUMBER_CTOR`, `pmd/PrimitiveWrapperInstantiation`
- line: `errorprone/DoNotCall` over `spotbugs/RU_INVOKE_RUN`
- line: `errorprone/EqualsNaN` over `spotbugs/FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER`, `pmd/ComparisonWithNaN`
- line: `errorprone/BoxedPrimitiveEquality`, `errorprone/MemorySegmentReferenceEquality`, `errorprone/OptionalEquality`, `errorprone/ProtoStringFieldReferenceEquality` over `errorprone/ReferenceEquality`
- line: `errorprone/BoxedPrimitiveEquality`, `errorprone/MemorySegmentReferenceEquality`, `errorprone/OptionalEquality`, `errorprone/ProtoStringFieldReferenceEquality`, `errorprone/ReferenceEquality` over `spotbugs/ES_COMPARING_*`, `spotbugs/RC_REF_COMPARISON*`, `pmd/CompareObjectsWithEquals`, `pmd/UseEqualsToCompareStrings`
- line: `pmd/UseEqualsToCompareStrings` over `pmd/CompareObjectsWithEquals`, `spotbugs/ES_COMPARING_*`
- line: `pmd/InstantiationToGetClass` over `spotbugs/DM_NEW_FOR_GETCLASS`
- line: `pmd/MethodReturnsInternalArray` over `spotbugs/EI_EXPOSE_REP`
- line: `pmd/ArrayIsStoredDirectly` over `spotbugs/EI_EXPOSE_REP2`
- line: `errorprone/MissingCasesInEnumSwitch` over `pmd/NonExhaustiveSwitch`, `errorprone/MissingDefault`, `checkstyle/MissingSwitchDefault`, `spotbugs/SF_SWITCH_NO_DEFAULT`
- line: `pmd/NonExhaustiveSwitch` over `errorprone/MissingDefault`, `checkstyle/MissingSwitchDefault`, `spotbugs/SF_SWITCH_NO_DEFAULT`
- line: `errorprone/MissingDefault` over `checkstyle/MissingSwitchDefault`, `spotbugs/SF_SWITCH_NO_DEFAULT`
- line: `checkstyle/MissingSwitchDefault` over `spotbugs/SF_SWITCH_NO_DEFAULT`
- line: `errorprone/FallThrough` over `pmd/ImplicitSwitchFallThrough`, `checkstyle/FallThrough`
- line: `pmd/ImplicitSwitchFallThrough` over `checkstyle/FallThrough`
- member: `errorprone/FallThrough`, `pmd/ImplicitSwitchFallThrough`, `checkstyle/FallThrough` over `spotbugs/SF_SWITCH_FALLTHROUGH`
- line: `errorprone/EmptyCatch` over `pmd/EmptyCatchBlock`, `checkstyle/EmptyCatchBlock`
- line: `pmd/EmptyCatchBlock` over `checkstyle/EmptyCatchBlock`
- line: `errorprone/MultiVariableDeclaration` over `pmd/OneDeclarationPerLine`, `checkstyle/MultipleVariableDeclarations`
- line: `pmd/OneDeclarationPerLine` over `checkstyle/MultipleVariableDeclarations`
- line: `errorprone/InterruptedExceptionSwallowed` over `pmd/AvoidCatchingGenericException`
- line: `errorprone/IdentifierName` over `checkstyle/CatchParameterName`, `checkstyle/LambdaParameterName`, `checkstyle/LocalVariableName`, `checkstyle/MemberName`, `checkstyle/MethodName`, `checkstyle/ParameterName`, `checkstyle/PatternVariableName`, `checkstyle/RecordComponentName`
- line: `errorprone/TypeParameterNaming` over `checkstyle/ClassTypeParameterName`, `checkstyle/InterfaceTypeParameterName`, `checkstyle/MethodTypeParameterName`, `checkstyle/RecordTypeParameterName`
- file: `errorprone/WildcardImport` over `checkstyle/AvoidStarImport`
- line: `errorprone/LongLiteralLowerCaseSuffix` over `checkstyle/UpperEll`
- line: `errorprone/MixedArrayDimensions` over `checkstyle/ArrayTypeStyle`
- line: `errorprone/BigDecimalLiteralDouble` over `pmd/AvoidDecimalLiteralsInBigDecimalConstructor`, `spotbugs/DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE`
- line: `errorprone/StringBuilderInitWithChar` over `pmd/StringBufferInstantiationWithChar`
- line: `pmd/EqualsNull` over `errorprone/EqualsNull`, `spotbugs/EC_NULL_ARG`
- line: `errorprone/EqualsNull` over `spotbugs/EC_NULL_ARG`
- line: `errorprone/ExplicitArrayForVarargs` over `pmd/UnnecessaryVarargsArrayCreation`
- line: `errorprone/SystemExitOutsideMain` over `pmd/DoNotTerminateVM`, `spotbugs/DM_EXIT`
- line: `pmd/DoNotTerminateVM` over `spotbugs/DM_EXIT`
- line: `errorprone/CatchAndPrintStackTrace` over `pmd/AvoidPrintStackTrace`, `errorprone/SystemOut`
- line: `errorprone/SystemOut` over `pmd/SystemPrintln`
- line: `errorprone/MissingOverride` over `pmd/MissingOverride`
- line: `pmd/DefaultLabelNotLastInSwitch` over `errorprone/SwitchDefault`
- line: `checkstyle/JavadocMethod` over `errorprone/InvalidParam`
- line: `errorprone/ReturnFromVoid` over `checkstyle/JavadocMethod`
- line: `errorprone/NotJavadoc` over `checkstyle/InvalidJavadocPosition`
- line: `errorprone/EmptyBlockTag` over `checkstyle/NonEmptyAtclauseDescription`
- javadoc: `errorprone/MissingSummary` over `checkstyle/SummaryJavadoc`
- line: `errorprone/AnnotationPosition` over `checkstyle/AnnotationLocationMostCases`, `checkstyle/AnnotationLocationVariables`
- line: `errorprone/ClassName` over `checkstyle/OuterTypeFilename`
- line: `errorprone/AssignmentExpression` over `pmd/AssignmentInOperand`
- line: `errorprone/HardCodedSdCardPath` over `pmd/DoNotHardCodeSDCard`
- line: `errorprone/ForEachIterable` over `pmd/ForLoopCanBeForeach`
- line: `errorprone/Finally` over `pmd/DoNotThrowExceptionInFinally`, `pmd/ReturnFromFinallyBlock`
- member: `errorprone/DoubleBraceInitialization` over `pmd/DoubleBraceInitialization`
- line: `errorprone/JdkObsolete` over `pmd/ReplaceEnumerationWithIterator`, `pmd/ReplaceHashtableWithMap`, `pmd/ReplaceVectorWithList`
- line: `errorprone/JdkObsolete` over `errorprone/StringCharset`
- line: `errorprone/NonOverridingEquals` over `pmd/SuspiciousEqualsMethodName`
- line: `errorprone/DefaultLocale` over `pmd/SimpleDateFormatNeedsLocale`
- line: `pmd/UseLocaleWithCaseConversions` over `errorprone/StringCaseLocaleUsage`
- line: `spotbugs/ST_WRITE_TO_STATIC_FROM_INSTANCE_METHOD` over `errorprone/StaticAssignmentInConstructor`, `pmd/AssignmentToNonFinalStatic`
- line: `errorprone/StaticAssignmentInConstructor` over `pmd/AssignmentToNonFinalStatic`
- line: `pmd/UnitTestShouldUseBeforeAnnotation` over `errorprone/JUnit4SetUpNotRun`, `errorprone/JUnit4TestNotRun`, `pmd/DetachedTestCase`
- line: `pmd/UnitTestShouldUseAfterAnnotation` over `errorprone/JUnit4TearDownNotRun`, `errorprone/JUnit4TestNotRun`, `pmd/DetachedTestCase`
- line: `pmd/DetachedTestCase`, `errorprone/JUnit4SetUpNotRun`, `errorprone/JUnit4TearDownNotRun` over `errorprone/JUnit4TestNotRun`
- line: `errorprone/EqualsHashCode` over `pmd/OverrideBothEqualsAndHashcode`
- line: `pmd/UnusedPrivateMethod` over `errorprone/UnusedMethod`
- member: `pmd/PreserveStackTrace` over `errorprone/UnusedException`
- member: `pmd/AvoidReassigningLoopVariables` over `errorprone/IncrementInForLoopAndHeader`
- line: `errorprone/Finalize` over `pmd/EmptyFinalizer`, `spotbugs/FI_EMPTY`
- member: `errorprone/Finalize` over `checkstyle/NoFinalizer`
- class: `errorprone/UngroupedOverloads` over `checkstyle/OverloadMethodsDeclarationOrder`
- file: `checkstyle/OneTopLevelClass` over `errorprone/MultipleTopLevelClasses`
- file: `errorprone/SunApi` over `pmd/DontImportSun`
- member: `errorprone/EqualsHashCode`, `pmd/OverrideBothEqualsAndHashcode` over `spotbugs/HE_*`
- member: `errorprone/NullAway`, `errorprone/ToStringReturnsNull` over `spotbugs/NP_TOSTRING_COULD_RETURN_NULL`
- member: `errorprone/NullAway` over `errorprone/ToStringReturnsNull`
- member: `errorprone/NonOverridingEquals` over `spotbugs/EQ_SELF_NO_OBJECT`, `spotbugs/EQ_SELF_USE_OBJECT`
- member: `errorprone/SynchronizeOnNonFinalField` over `spotbugs/ML_SYNC_ON_FIELD_TO_GUARD_CHANGING_THAT_FIELD`
- field: `errorprone/URLEqualsHashCode` over `spotbugs/DMI_COLLECTION_OF_URLS`
- field: `pmd/UnusedPrivateField` over `spotbugs/URF_UNREAD_FIELD`, `spotbugs/UUF_UNUSED_FIELD`
- field: `errorprone/NullAway` over `spotbugs/NP_UNWRITTEN_FIELD`, `spotbugs/UWF_UNWRITTEN_FIELD`

### Checks spared in annotated classes

`classExemptions` in `checks.json`; a unit test checks that this table lists exactly its checks.

| Check                               | Spared in classes annotated                                                                       | Why                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `FieldCanBeFinal`                   | `@Entity`, `@Embeddable`, `@MappedSuperclass` (jakarta and javax persistence)                     | JPA forbids final persistent fields                                                                  |
| `IdentifierName`                    | `@AnalyzeClasses`                                                                                 | ArchUnit names a rule after its `@ArchTest` field, and its convention is a lower_snake_case sentence |
| `PrivateConstructorForUtilityClass` | `@Configuration` (and so `@SpringBootApplication`, `@SpringBootConfiguration`), `@AnalyzeClasses` | Spring's CGLIB proxy and ArchUnit's runner need a non-private constructor                            |

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
  task lives in `languages/java/gradle/tasks/jdeps-task.gradle`, and its arguments come from the
  `jdeps` entry of `languages/java/builds/tools/tool-commands.json`.
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

| Guard                                                                                                                                            | Rule as printed                                                                                                                                                        | Allowed form                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Package cycles                                                                                                                                   | `coupling/package-cycle`                                                                                                                                               | Move shared types down, or invert one dependency behind an interface                                                         |
| `Optional.get()`; `Optional` as field, parameter or record component; `Optional<List<..>>`                                                       | `pmd/OptionalGet`, `pmd/OptionalAsFieldOrParameter`, `pmd/OptionalOfCollection`                                                                                        | `orElseThrow()`, `orElse`, `map`, `ifPresent`; return an empty collection                                                    |
| Raw types, unchecked casts, deprecated and removed APIs, redundant casts                                                                         | `javac/rawtypes`, `javac/unchecked`, `javac/deprecation`, `javac/removal`, `javac/cast`                                                                                | Type arguments, typed APIs, the replacement the Javadoc names                                                                |
| `instanceof` followed by a cast                                                                                                                  | `pmd/InstanceofThenCast`                                                                                                                                               | Pattern matching (`x instanceof Circle c`) or a `switch` over a sealed type                                                  |
| Non-private fields, mutable static state, `@SneakyThrows`                                                                                        | `checkstyle/VisibilityModifier`, `pmd/NonFinalStaticField`, `pmd/MutableStaticCollection`, `pmd/SneakyThrows`                                                          | Private fields, a `record`, immutable `List.of` and `Map.of`, a declared exception                                           |
| Legacy date and time, `now()` without a `Clock`, `Thread.sleep`, `Thread.start()`, `Runtime.exec(String)`, `ObjectInputStream`                   | `forbiddenapis/legacy-date-time`, `clock-now`, `thread-sleep`, `new-thread`, `runtime-exec`, `java-deserialization`                                                    | `java.time`, an injected `Clock`, an executor, `ProcessBuilder` with a list, JSON                                            |
| Swallowed `InterruptedException`; side effects in `forEach` and `peek`; `collect(Collectors.toList())`; an unclosed `Files.lines/list/walk/find` | `pmd/SwallowedInterruptedException`, `pmd/ForEachSideEffect`, `pmd/CollectorsToList`, `pmd/StreamResourceNotClosed`                                                    | `Thread.currentThread().interrupt()`, `map` and `collect`, `Stream.toList()`, try-with-resources                             |
| `throws Exception`, raw `RuntimeException`                                                                                                       | `pmd/SignatureDeclareThrowsException`, `pmd/AvoidThrowingRawExceptionTypes`                                                                                            | The checked exceptions the method throws; `IllegalArgumentException`, `IllegalStateException`, a project exception           |
| SQL built with `+` or `String.format` in JDBC calls; MD5 and SHA-1; nested-quantifier regexes; a path joined from a parameter                    | `pmd/SqlConcatenation`, `pmd/WeakHash`, `pmd/NestedQuantifierRegex`, `pmd/PathFromParameter`                                                                           | `?` parameters, SHA-256, a regex without `(a+)+`, `normalize()` and `startsWith(base)`                                       |
| Constant names; magic numbers                                                                                                                    | `checkstyle/ConstantName`, `checkstyle/MagicNumber`                                                                                                                    | `UPPER_SNAKE_CASE` (a logger may be `log` or `logger`); a named `private static final`                                       |
| Unused imports                                                                                                                                   | `pmd/UnnecessaryImport`                                                                                                                                                | Remove the import                                                                                                            |
| Duplicates with renamed names, and in test sources                                                                                               | `duplicates/duplicate-clone`                                                                                                                                           | One shared method; a helper or `@ParameterizedTest` in tests                                                                 |
| Declared but unused dependencies                                                                                                                 | `dependencies/unused-declared-dependency`                                                                                                                              | Remove it, or declare it `testImplementation`, `runtimeOnly` or `compileOnly` (Maven: `test`, `runtime` or `provided` scope) |
| Test honesty                                                                                                                                     | `pmd/TestSleep`, `DisabledTest`, `AssertionInControlFlow`, `TryCatchInTest`, `AssertTrueOnEquality`, `TautologicalAssertion`, `MockedValueType`, `TestOrderDependence` | See Tests below                                                                                                              |

A Checkstyle rule prints as its check name, for example `checkstyle/MagicNumber`; see
[Rule messages](#rule-messages).

- **PMD categories.** `performance`, `multithreading` and `security` run next to `errorprone`
  and `bestpractices`, on main and test sources. Their fixes are in the PMD rule catalog
  (`languages/java/messages/pmd.json`, for example `StringToString`: "Remove the toString()
  call."), appended with the exception route like every catalog rule. Six rules
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
  sources. `rules/guards-ruleset.xml` runs on main sources only (nitpicker writes a wrapper
  ruleset that excludes the test directories, with the same code on Gradle and Maven: the init
  script hands the source directories and the compiler settings to
  `languages/java/builds/rulesets/write-rules.mjs`), `rules/test-honesty-ruleset.xml` on test
  sources only (its wrapper excludes every file, then includes the test directories back, since
  PMD lets an include pattern override an exclude pattern). A project's own `config/pmd/ruleset.xml`
  replaces all of them unless it opts in as before. `InstanceofThenCast` and `CollectorsToList` are
  left out when the main compile targets a release below 16 (`options.release`, else the last
  `--release` of the compiler arguments, else their last `-target`, else `targetCompatibility`,
  on both builds), since pattern matching and `Stream.toList()` need 16. Maven modules also get
  `pmd-tests.xml` (`TestClassWithoutTestCases` on test sources) and the Checkstyle name formats
  below, as Gradle projects do.
- **Narrowed rules.** `OptionalAsFieldOrParameter` skips parameters bound by Spring web
  annotations (`@RequestParam`, `@RequestHeader`, `@PathVariable`, `@CookieValue`,
  `@RequestAttribute`, `@SessionAttribute`, `@MatrixVariable`, `@RequestPart`), where an optional
  request value is the framework's form. `StreamResourceNotClosed` skips a stream returned to the
  caller or held in a variable that a later `try (lines)` closes. `InstanceofThenCast` skips a cast
  that adds type arguments the `instanceof` cannot test (`o instanceof List`, then
  `(List<String>) o`). `CollectorsToList` reports `collect(Collectors.toList())` only, not a downstream
  `toList()` inside `groupingBy` or `mapping`. `NestedQuantifierRegex` reports a repeated group
  whose whole body is one quantified item (`(a+)+`, `(\s*)*`, `([a-z]+)*`), not a group of
  several items such as `([A-Z][a-z]+)+`. `PathFromParameter` reports non-private methods and
  constructors only, so a private helper called with fixed names is fine.
  `SignatureDeclareThrowsException` skips overriding
  methods, a method that takes Spring Security's `HttpSecurity`, `WebSecurity`,
  `AuthenticationConfiguration` or `AuthenticationManagerBuilder` (whose methods declare
  `Exception`), `getObject()` of a `FactoryBean`, `main(String[])` and the methods of a
  `@FunctionalInterface` (a `Callable`-like type whose lambdas may throw anything).
  `NonFinalStaticField` skips JUnit's `@TempDir`, `@Container`, `@RegisterExtension`
  and `@ClassRule` fields, Testcontainers containers and fields assigned in `@BeforeAll`;
  `MutableStaticCollection` skips a private static concurrent collection used as a cache.
- **Checkstyle.** `rules/checkstyle-all.xml` (`ConstantName`) is added to the `google_checks.xml`
  rules for main and test sources; `rules/checkstyle-main.xml` (`MagicNumber` with `-1`, `0`, `1`
  and `2` allowed and `hashCode` and annotations ignored, `VisibilityModifier` with public final
  fields allowed) for main sources only. `ConstantName` checks constants of primitive, `String`,
  boxed, `BigDecimal`, `BigInteger` and `Duration` type; a `static final` reference to an object
  such as `mapper` keeps its camel-case name. `VisibilityModifier` allows protected fields of a
  `@MappedSuperclass`, and fields without an access modifier in a class annotated with Lombok's
  `@Value` or `@FieldDefaults(level = AccessLevel.PRIVATE)`, which Lombok makes private. These
  scopes are `SuppressionXpathSingleFilter` modules inside the
  generated config, not inline suppressions. The messages are rewritten to name the allowed form.
- **javac lint.** The `nitpickerLint` task writes `guards-plan.json` (the main sources, the
  compile class path, the processor path, the compiler, its release, source, target, encoding and
  arguments, the classes directory and the generated-sources directory) and runs node on it
  (`-Pnitpicker.node`, the head run also passing the base project as `-Pnitpicker.lintBaseline`),
  so the lint of several projects runs in parallel when Gradle does; it compiles the main sources
  once more with
  `-Xlint:rawtypes,unchecked,deprecation,removal,cast` and writes the warnings to
  `javac-lint.txt` in the report directory (tool `javac`, rule = lint category). The same runner
  serves Maven. It compiles a copy in which every `@SuppressWarnings(...)` is blanked out (same
  lines and columns), with the project's compiler, release (or `-source`/`-target` from the source
  and target compatibility when no release is set) and compiler arguments (without `-Werror`,
  `-nowarn`, `-Xlint`, `-Xdiags`, `-XD`, `-Xplugin`, processor options and class or module paths),
  and with the main classes on the classpath, so it runs only Lombok of the annotation processors
  (the classes other processors generate are already compiled) and stops after flow analysis
  without writing classes. When javac counts warnings but prints none in the form nitpicker reads,
  the lint counts as not run. The copy
  keeps the sources' paths below the analysis root, with every `lombok.config` on the way from the
  root down to each source folder, so Lombok reads the project's configuration (a package folder's
  `fluent` accessors or log field name included), and those of the folders above the root up to one
  that sets `config.stopBubbling`; a relative `import` in a copied file is pointed at the file it
  names. A warning javac places on a Lombok annotation (`@SuperBuilder` or `@Builder` code that
  Lombok generates) is dropped: it is not in code the project wrote. With a `module-info.java` the
  sources compile as that module, with the modular jars of the class path on `--module-path` (and,
  if that fails, every jar), the sources other annotation processors generated (MapStruct,
  Immutables, Dagger) compiled along without their warnings being reported, and every file is
  linted. On the head, when the base produced a lint report in the same run (kept with a fingerprint
  of its compile inputs in `<build dir>/nitpicker-lint/` of the base checkout, Maven's
  `target/nitpicker-lint/`), the base's warnings are reused for files whose content is the same as
  on the base, so the report matches a full lint. They are reused only when the compile inputs match
  the base's: the javac version, the language level, the encoding, the compiler arguments (the
  checkout's folder left out), every `lombok.config` that applies to the sources and every class
  path and Lombok entry (a jar outside the project by name and size; a jar inside it, or a classes
  directory such as another project's, by its content), so a dependency bump that deprecates an API
  or a changed Lombok setting is reported in unchanged files too. An unchanged file whose classes
  use a class of a changed file, directly or through a subclass (read from the head's class files),
  is compiled again, so a method the change deprecated or a class the change made generic is
  reported where it is called. A constant javac inlined leaves no trace in the class files, so
  deprecating a `static final` constant is reported only in changed files. Without a base report or
  with other compile inputs the head lints every file. When the lint compile fails the run goes on:
  the report says so in a descriptive `javac/lint-not-run` notice that quotes the first error, and
  javac warnings are not checked in that run. When only the base failed, the head's javac findings
  under that module's main source roots are reported but do not fail the gate: with no base report,
  nothing tells which of them the change added, and each one says so. When only the head failed, the
  run fails with a tool error: the change broke the lint compile. The notice says to fix what the
  lint compile reports, and ends with the exception route for `javac/lint-not-run` with the path
  `**`, for a project that cannot be linted this way.
- **Run time.** Each snapshot runs in a fresh worktree with a fresh report directory, so Gradle's
  up-to-date checks do not skip these tasks; what saves time is the differential lint. Measured on
  a project with 31 main files using Lombok and MapStruct (load about 40), the lint took 22.0 s for
  every file and 13.1 s with a one-file change; on a smaller project, 6.2 s and 3.9 s. Most of what
  is left is starting javac with the processor and class path.
- **forbiddenapis.** [forbiddenapis](https://github.com/policeman-tools/forbidden-apis) 3.10
  (Apache-2.0, one jar from Maven Central, pinned in the init script) reads the main bytecode
  against `rules/forbidden-apis.txt`. Each signature group has a tag that becomes the rule name
  (`thread-sleep`); the report is `forbidden-apis.txt`. Source locations come
  from the class's debug line numbers; a field, parameter, return type, record component or
  supertype of a banned type is placed on its declaration in the source (comments and strings
  do not count); one forbiddenapis cannot tie to a line goes on its class's line, and generated
  members (lambdas, record accessors, Lombok accessors and builders of a reported field) are
  dropped. forbiddenapis reads type descriptors, so a generic argument such as `List<Date>` or
  `Map<String, Date>` is not reported. `new-thread` bans `Thread.start()`,
  `Thread.startVirtualThread` and `Thread.Builder.start`, so a `ThreadFactory` or
  `Runtime.addShutdownHook` may still construct a `Thread`. `legacy-date-time` skips a `Date`
  another API returns when `.toInstant()` follows the call right away, on that line or at the start
  of the next (`certificate.getNotAfter().toInstant()`), or it is converted with
  `map(Date::toInstant)`; any other call on a `Date` in the same line, such as `getTime()`, is
  still reported.
- **Duplicates.** The jscpd check is unchanged. `nitpickerCpd` runs PMD's copy-paste detector
  (BSD-style, already inside the pinned PMD) over main and test sources with identifiers and
  literals ignored and at least 100 tokens, so a copy with renamed variables is found. When jscpd
  and CPD report the same clone (same two files, overlapping lines, jscpd's range ending at its
  start line plus `lines` minus one), only the CPD finding is kept, also when nitpicker then drops
  CPD's clone as boilerplate or as overlapping its own copy; in a module where CPD did not run or
  wrote no usable report, jscpd's clones stay, overlapping
  windows of one file pair are one finding, a block that overlaps its own copy is dropped, and so
  are clones made only of getters, setters, field declarations and field-assigning constructors
  or only of data rows (enum constants, `Arguments.of(...)` rows, literal lists, and constants
  built from literals with `Map.ofEntries`, `Map.of`, `List.of`, `Set.of`, `Stream.of` or
  `Arrays.asList`; any other row needs a number or a literal, so a run of calls such as
  `validate();` is code). The files of a duplication are sorted by path, so the order CPD lists them in
  does not matter, and the identity hashes the clone's token shape (its punctuation and
  operators, without names, literals and comments), so editing a name or a literal in a legacy
  copy keeps its identity. A legacy clone that shrinks (a statement inserted in one copy) or
  that jscpd splits in two is held at its base size, for jscpd and CPD alike, while most of each
  of its two copies is unchanged code that was part of that base clone: a new clone between the
  same two files fails when either copy is mostly added or edited lines, or lines that were not
  in a base clone of the pair (a pasted copy, or code joined by deleting what was between), or
  when it, with the other new clones of that pair, has more tokens than the base clone it came
  from.
  Both tools hold against the same pair (`pair:<a>|<b>:clone`, counted in tokens), so a legacy CPD
  clone that shrinks below CPD's 100 tokens and is then reported by jscpd is held too. Findings use
  the same tool and rule as jscpd (`duplicates/duplicate-clone`), with identities starting `cpd:` so
  they never match a jscpd finding; renaming one of the two files keeps a clone's identity even when
  the new name sorts the files the other way round; between two test files the message points at a helper or a
  `@ParameterizedTest`. The message ends with the exception route for
  `duplicates/duplicate-clone`. Both builds run CPD through `languages/java/gradle/CpdReport.java`
  (single-file source mode, with the pinned PMD on the class path) instead of `PmdCli cpd`, with
  the same settings and the same XML report, which it writes to the path given as its first
  argument. PMD 7.7.0 to 7.28.0 crash on common code with `Deque.peek().name is null`, and
  `PmdCli` still exits 0 without a report: the Java CPD lexer's constructor detector pushes a type
  on every `class` keyword, a class literal (`String.class`) followed by `}` leaves that type
  without a name, the next declaration without a modifier (a bare `class`, or any `enum`) keeps it
  on the stack, and the next `(` reads its null name. One file is enough
  (`static final Class<?>[] TYPES = { String.class }; enum Kind { X } void register() { }`), and
  the state also carries from one file to the next. The launcher reads each file as CPD would (CRLF and CR line ends become LF,
  a byte order mark is dropped), runs PMD's own Java token manager over that text first and
  overwrites every `class` token that directly follows a `.` token with `const`, at the token's
  place: comments between the two are skipped like PMD skips them, text inside comments, strings,
  text blocks and character literals is never a token, and a Unicode-escaped dot or `class` is
  translated as PMD translates it, so `// values.` followed by a `class` line keeps its `class`.
  `const` is a Java keyword no code uses, so it stays a keyword token like `class` and has the
  same length (an escaped `class` is padded with spaces), and the tokens, lines, columns and paths
  of the report do not move (an identifier such as `c$ass` would be ignored like any identifier
  and match `other.value`). On the PMD 7.7.0 sources of pmd-java and pmd-core the report equals
  `PmdCli`'s apart from the timestamp and the `codefragment` text, which shows the rewrite;
  nitpicker reads clone text from the source files instead. The launcher follows symbolic links
  and reads a file that two source roots reach once; a link loop, an unreadable file or directory,
  a missing directory argument, or a file whose rewrite throws is skipped with a line on stderr and
  listed in `cpd-skipped.txt`. A file PMD cannot lex (a stray `#`, or syntax PMD 7.7 does not know)
  is handed to CPD with the class literals before the error rewritten; CPD skips it and records an
  `<error>` in `cpd.xml`. The module then gets one descriptive `duplicates/cpd-skipped-paths`
  notice naming each of those paths once. Both builds take the launcher, its
  arguments (the report path, then the source roots) and what counts as a run from the `cpd`
  entry of `languages/java/builds/tools/tool-commands.json`: exit code 0 and a `cpd.xml` whose
  root is `<pmd-cpd>`. When CPD exits with another code or writes no XML report, both builds write its exit code (or signal) and stderr to
  `cpd-failed.txt` instead of `cpd.xml`; on Maven a `java` that cannot start or runs past the
  15-minute tool timeout writes the error code (such as `EACCES` or `ETIMEDOUT`) and message there
  instead of failing the run. The module then gets a `duplicates/cpd-not-run` tool-not-run finding
  that names its source roots and says how CPD ended: it exited with a code, was stopped by a
  signal, could not run, or did not finish within the tool timeout (an empty or non-XML `cpd.xml`
  gives the same finding). Its `notRunScope` lists the module's main and test source roots as
  project-relative directories. Maven writes each module's roots relative to the module, so the
  module folder goes in front of each root first; then a root that is the project folder itself
  becomes `.`, and a root that lies outside the project after that (absolute, or above the project
  folder) is left out. A module without source roots is scoped to its folder. When no directory in
  the project is left, the notice keeps its message but is not a tool-not-run finding: the code it
  did not check lies outside the project, and the guards drop every finding on a file outside the
  project (a finding's path must lie in the project, and one that does not would make the whole
  Java report fail to parse), so nothing in the comparison is left to relax. A failure on the base
  makes the head's CPD findings (identity `cpd:...`, from `notRunIdentityPrefix`) in those
  directories descriptive, and those on the exact head paths of the files renamed out of them, as
  long as they match no base finding; jscpd's clones there stay enforced, since jscpd ran. The directories themselves never follow a move: a
  module moved whole into an existing one relaxes only the moved files, and a module renamed whole
  that still fails gives a conservative tool error on the head, while the CPD findings of its
  renamed files stay descriptive. A legacy finding that matches a base finding stays unchanged and
  enforceable, so a failed run never shows it as resolved plus new. A failure on the head is a tool
  error unless a base notice of the tool with the same prefix has the same identity and path or
  those base notices together cover each of its directories. One file moved into a module
  that ran on the base therefore does not excuse that module failing on the head. The
  `javac/lint-not-run` notice is scoped the same way, to the module's main source roots.
- **Cycles.** `java-coupling.mjs` already has the class graph from jdeps. Each package in a
  strongly connected set of packages is one `package-cycle` finding, identified by the package
  name and placed on its first file, so growing a legacy cycle adds a finding for the new package
  only and shrinking it resolves findings without re-reporting the rest. The edge from a sealed
  type to the subtypes it `permits` is left out (`permits.txt` in the report directory, read by
  nitpicker from the `PermittedSubclasses` attribute of the main classes; a class file it cannot
  read is skipped), since a sealed hierarchy across packages is
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
  `TryCatchInTest` (use `assertThrows`; a `try` inside a lambda or an anonymous class is fine),
  `AssertTrueOnEquality` (`assertTrue(a.equals(b))`,
  `assertTrue(a == b)`), `TautologicalAssertion` (`assertThat(true)`, `assertTrue(true)`,
  `assertEquals(1, 1)`; `assertEquals(a, a)` is a reflexivity test and is fine), `MockedValueType` (a `String`, number, date, collection, `Optional` or
  record mocked with `mock` or `@Mock`) and `TestOrderDependence` (`@TestMethodOrder` other than
  `MethodOrderer.Random`, `@FixMethodOrder`, `@Order` on a test). A test class with `static`
  non-final fields or a static
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
  `legacy` module, compiled for Java 11 through `options.release`, and its `arguments` module,
  compiled for Java 11 through `--release` in the compiler arguments, where `InstanceofThenCast`
  and `CollectorsToList` must not fire, and the lint on modules with a javac plug-in (`-Xplugin`),
  `--enable-preview`, a module descriptor with a sealed type across packages, a source root
  outside the project and Lombok with a package folder's `lombok.config` and a `@SuperBuilder`
  warning; `maven-preset.e2e.test.mjs` lints the same modules with Maven, Lombok included. The
  `lint-not-run` path is unit-tested only: a source that breaks the lint compile breaks
  `compileJava` first.
- **Left out on purpose.** Lombok `@Data` (a record is the allowed form for data, but `@Data` on a
  JPA entity is common enough that blocking it needs its own decision), `java.util.Random`
  (`SecureRandom` is right for tokens, but a plain `Random` for sampling is legitimate and the
  tool cannot tell), and a path join that is checked after the fact in another method.

## Code smell rules

[`languages/java/gradle/code-smells-ruleset.xml`](../languages/java/gradle/code-smells-ruleset.xml) holds nitpicker's
own PMD rules for patterns coding agents repeat. They run on main sources, with or without Spring
(`languages/java/builds/rulesets/pmd-rulesets.mjs`, which both the init script and the Maven PMD
run use, wraps them like the guard rules: test directories excluded); test sources get `code-smells-test-ruleset.xml` instead (PMD's `AvoidDuplicateLiterals` and its
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
rule is documented here, names its exception route and has a marked sample, and that the PMD
rulesets both builds run scope both rule sets; the gated `spring/java-spring.e2e.test.mjs` also
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
`checkstyle-test.xml`), Error Prone, google-java-format, PMD's copy-paste detector and the inline suppression scan cover
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
accept. It also runs Error Prone on the fixture and asserts its only finding is `MethodCanBeStatic`
in `OrderService`: no `FieldCanBeFinal` in the JPA entities and no
`PrivateConstructorForUtilityClass` on the application or configuration classes.

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

## Rule messages

PMD, Checkstyle and SpotBugs messages say what is wrong, rarely how to fix it, and never how to keep
code that is right as it is. `languages/java/messages/` holds one catalog per tool (`pmd.json`,
`checkstyle.json`, `spotbugs.json`) with an entry for every rule the preset can report: the
errorprone and bestpractices PMD categories plus `AvoidCatchingGenericException`, every check in
`google_checks.xml`, and every SpotBugs pattern. Each entry has:

- `fix`: one sentence, in our words, naming the allowed form (`null` when the tool's message already
  says it);
- `mayBeIntended`: whether the rule can fire on code a careful team keeps (a CLI printing with
  `System.out`, a catch-all at a boundary);
- `layout` (Checkstyle only): a layout check google-java-format fixes; the message then says to run
  the formatter instead of a fix of its own.

`readJavaFindings` passes every finding through `applyRuleMessages`
(`languages/java/messages/rule-messages.mjs`). It shortens Checkstyle rule names, then appends the
fix to the tool's message, and for an enforceable finding of a rule that may be intended (or one
the catalog does not know, from a project's own config) the exception route with the finding's own
path. The guard tools (`javac`, `forbiddenapis`, `duplicates`, `coupling`, `dependencies`), `spring`
and `pit` get the same route; no rule message, ruleset or guard writes its own, and
`messages/exception-sentences.test.mjs` fails on one that does:

```
Usage of System.out/err. Write through a logger, or take a PrintStream as a parameter so callers
choose the stream. If this is intended, add {"rule":"pmd/SystemPrintln","paths":["src/main/java/demo/Cli.java"],"reason":"..."}
to "exceptions" in nitpicker.config.json.
```

The Kotlin preset, which runs the same tools on a mixed module's Java files, gets the fix but not
the exception route: its `exceptions` only lift detekt rules. An `exceptions` entry that names a
Checkstyle check by class (`checkstyle/com.puppycrawl...IndentationCheck`) is a config error that
gives the name to write instead.

Messages that already name `nitpicker.config.json` (the Spring rules) are left as they are, and
identities are computed before, so neither the new text nor the short Checkstyle name moves a
finding between base and head. `rule-catalog.e2e.test.mjs` downloads the pinned PMD, Checkstyle and
SpotBugs jars and fails when the catalogs and the tools' rule lists differ, so a version bump
cannot add a rule without fix text.

Error Prone findings are in no catalog and pass through unchanged: their allowed form and exception
route come from `ingest/errorprone/messages.mjs` and `adapters/errorprone/java-errorprone.mjs`, so
they carry one exception route, not two. The overlap step runs after this, so
`overlap-pairs.json` names Checkstyle checks the same short way, or by the module id
`google_checks.xml` gives (`checkstyle/AnnotationLocationMostCases`); a unit test checks every rule
in it against the catalogs and Error Prone's check list.

## Slice 1: what is deliberately not included

- Nothing from the proposed slices 4 to 8 is left out: ArchUnit, CRAP, jscpd, PIT and the changed-line
  branch-coverage gate are described in their own sections.
- Kotlin sources (see [kotlin-preset.md](kotlin-preset.md)), Groovy sources, Maven (since added, see
  [Maven builds](#maven-builds)).

## Tests

- `languages/java/adapters/reporting/java-reports.test.mjs`: fast, always on. Report conversion, project-relative paths,
  classification, line-shift stability.
- `languages/java/messages/rule-messages.test.mjs`: fast, always on. Short Checkstyle names, fix
  text, the exception route, and the shape of every catalog entry.
- `languages/java/messages/exception-sentences.test.mjs`: fast, always on. No Java message source
  writes its own exception route.
- `languages/java/messages/rule-catalog.e2e.test.mjs`: gated like the other e2e tests. The catalogs
  name exactly the rules of the pinned tool versions.
- `languages/java/adapters/java-e2e/java-preset.e2e.test.mjs`: gated behind `NITPICKER_JAVA_E2E=1` (`npm run test:java`, which also runs `java-spring.e2e.test.mjs`, `escape-hatches.e2e.test.mjs`, `languages/java/adapters/java-e2e/pit-targets.e2e.test.mjs`, `multi-project.e2e.test.mjs`, `languages/java/maven/maven-preset.e2e.test.mjs`, `maven-failsafe.e2e.test.mjs`, `maven-code-smells.e2e.test.mjs`, `guards.e2e.test.mjs`, `languages/java/adapters/errorprone/error-prone.e2e.test.mjs`, the other Error Prone e2e tests and `rule-catalog.e2e.test.mjs`, one file at a time because each stops the Gradle daemons when it ends). Needs Java 21, Gradle and network access to Maven Central; about 85 seconds
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
