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
  -> <report dir>/modules.json and, per Gradle project that applies java, <report dir>/<key>/{pmd.sarif, spotbugs.sarif, errorprone.json, format.txt, jacoco.xml, checkstyle.xml, checkstyle-<source set>.xml, archunit/*.xml, spring-arch.json, structure.json, classes.json, pit/mutations.xml, jdeps.txt, jdeps-classes.txt, manifest.json}
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
  File limits and coupling (with the stability direction) are evaluated once over all projects, as
  for Maven modules, so a package dependency from one project to another counts. Packages and classes
  of a project other than the root are named with its folder (`lib/demo.lib`), so two projects that
  share a package or class name stay apart, and a dependency goes to the project that declares the
  class (its own first). A project's names depend only on its own folder, never on how many projects
  there are: a lone subproject is named with its folder too, and the root project's names and
  identities are as in a one-project build, which reads its own jdeps reports unmerged.
- **Integration tests on Gradle.** As on Maven (Surefire and Failsafe in `verify`), a project's
  integration tests are run and counted, following what the project's own build runs: Nitpicker runs
  `test` and every `Test` task that `check` depends on. A test suite of the `jvm-test-suite` plugin
  (`integrationTest` and so on) is one of them only when the project wires it with
  `check.dependsOn testing.suites.integrationTest`, because the plugin wires `test` alone, just as
  Failsafe runs only when it is bound to a phase. A task `check` does not run is not run and not
  counted. A checked task that the build skips (`enabled = false`, `onlyIf`) adds nothing: the JaCoCo
  data and the JUnit XML an earlier run left behind are ignored (Maven deletes stale reports before
  it builds) and PIT leaves its tests out. The JaCoCo data of the checked tasks is merged into one
  report (coverage, CRAP and `changed-branch-coverage` count what an integration test covers), and
  their JUnit XML goes to `test-results/<task>/` with the integration budget of the
  [slow test](#slow-tests) rule (any task but `test`). Every checked task also has its own PIT run
  and, when the task holds ArchUnit classes, its own ArchUnit run (see
  [Slice 4](#slice-4-archunit) and [Slice 7](#slice-7-mutation-with-pit)).
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
  The one exception is a base snapshot whose test reports name failing tests while the head passes:
  that is a note and the run goes on (see [A base whose tests fail](usage.md#a-base-whose-tests-fail)).
  A base that fails for another reason, or whose tests fail without a named failing test, still
  fails.

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
   A module that uses Spring (`spring-context` or `spring-boot` on its main compile classpath) or
   jMolecules (`jmolecules-ddd`) also runs the Spring architecture rules: ArchUnit is resolved with
   the other tools, but only when some module runs them, and the rule classes are compiled once into
   `$XDG_CACHE_HOME/nitpicker/spring-arch/<hash>` (else `~/.cache/nitpicker/spring-arch/<hash>`, private
   to the user; the hash is computed like Gradle's, but the cache is separate from Gradle's) and run in
   one extra JVM per module (`languages/java/maven/spring/maven-spring-arch.mjs`).

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
  Surefire's or Failsafe's reports, is a `java/maven-failure` tool error that names up to ten
  failing tests. On the base snapshot the failing tests are listed instead of thrown: that module
  skips JaCoCo and PIT, and the failure becomes a `tests-failed` tool error for that module that the
  core reads as a red base, the same as a Gradle base whose tests fail. The other modules keep their
  coverage, CRAP and mutation comparison with the base; a failing root module is unknown only for its
  own source and test directories. Reports older than the build are ignored.
  Gradle runs the ArchUnit classes in their
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
  `ignoreFailures`). It runs on the framework the declared ArchUnit library needs: JUnit 4 for
  `archunit-junit4` rules (`@RunWith(ArchUnitRunner.class)`), the JUnit Platform for
  `archunit-junit5`; with both or neither declared, on the framework of the task whose classes it
  runs. The ArchUnit classes are left out of every checked test task (`test` and each task `check`
  depends on) and run by their own `nitpickerArchunit` task, `nitpickerArchunit<Task>` for a task
  other than `test` (on that task's test classes and runtime classpath), so a rule in an
  integration test source set is a finding, not a failed build.
  When the test classes hold ArchUnit classes and none of them produced a report, the task fails
  (a Gradle failure, `tool-error`), as Maven does, instead of passing without findings. The
  project must have one of the two libraries on its test classpath; Nitpicker adds no dependency
  and so pins no ArchUnit version (the version map is unchanged). Test classes named `*ArchTest` or
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
- **What runs.** `nitpickerPit` runs the pinned `pitest-command-line` (1.17.4) with the test
  plugins the project's framework needs (`pitest-junit5-plugin` 1.2.1, `pitest-testng-plugin`
  1.0.0, both pinned, added on the conditions below), default mutators, XML output, two threads, to
  `pit/mutations.xml` in the report directory. Tests are named class by class (`--targetTests`), and
  `--mutableCodePaths` limits mutation to the main classes. Every test task the build checks (`test`
  and each task `check` depends on) is a run of its own, `nitpickerPit<Task>`, with that task's test
  classes (its `include` and `exclude` patterns applied), its runtime classpath, so tasks on
  different library versions never share one, and, for a JUnit Platform task, its `includeTags` and
  `excludeTags`, which select the tests PIT runs during the green-suite check and mutation testing,
  including method-level tags. A task the build skips has no run. With more than one run, each
  writes `pit/<task>/mutations.xml` and `nitpickerPit` merges them into `pit/mutations.xml`: a mutant
  counts as killed when any run killed it, as when one run holds every test, which is what Maven's
  single PIT run does. The JUnit Platform is not pinned by
  Nitpicker: the plugin's own platform dependencies are excluded and the project's are used, with a
  launcher of the project's engine version added when the project does not declare one. PIT
  requires a green test run: a failing test suite fails the build, which is a `java/gradle-failure`
  tool error. When the failed build left JUnit reports with failing tests (the init script lists
  the report directory of every test task in `test-results.json` of the report base), the error
  names up to ten of them with the same text as on Maven (`Tests fail in <project>; nitpicker needs
a passing test suite ...`) instead of Gradle's own failure output. Projects without main classes produce no report and no findings.
  The `pitest-junit5-plugin` and the launcher are added only when the project's test runtime has
  `junit-platform-engine`; a JUnit 4 project runs PIT's built-in JUnit 4 support. When the test
  runtime has a `testng` jar, the pinned `pitest-testng-plugin` (1.0.0) is added too, without a
  TestNG of its own: PIT refuses to run a TestNG project without it. Maven builds put the same
  plugins on PIT's classpath on the same conditions. See [Test frameworks](#test-frameworks).
- **Equivalent mutants.** A survived mutant's message names the common equivalent cases (a
  `compareTo` boundary, a discarded lambda return) and the way out: simplify the code, or add an
  exception for `pit/mutant-survived`.
- **Ingester.** `languages/java/ingest/pit.mjs` (`ingestPit`). PIT statuses map to the names the
  Stryker-based area uses: `SURVIVED` and `NO_COVERAGE` give enforceable `mutant-survived` and
  `mutant-nocoverage`; `TIMED_OUT`, `MEMORY_ERROR`/`RUN_ERROR`, `NON_VIABLE` and `STARTED` give
  descriptive `mutant-timeout`, `mutant-runtimeerror`, `mutant-compileerror`, `mutant-ignored`;
  killed mutants produce no finding. `mutation-summary` carries one descriptive count per status
  (`path` `.`, identity `status:<Status>`).
- **Identity.** `<mutated class>|<method><descriptor>|<mutator>|<description>#<n>`, with every
  package left out: the class is its simple name, `Lcom/shop/Order;` in the descriptor becomes
  `LOrder;` and `com/shop/Order::total` in the description becomes `Order::total` (the symbol
  likewise). The path already tells classes apart, and the gate maps a renamed path to its base
  counterpart, so moving a class to another package keeps its legacy mutants matched. There is no
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

## Test frameworks

Coverage (JaCoCo), mutation testing (PIT), ArchUnit and the slow-test check work with these test
frameworks, on Gradle and on Maven. Nitpicker detects the framework from the project's test runtime
classpath and its `test` task, and adds no test library to the project.

| Framework | Coverage | Mutation                                                    | ArchUnit                                                                                                                             | Slow tests                                                       |
| --------- | -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| JUnit 4   | yes      | PIT's built-in JUnit 4 support                              | `archunit-junit4`, run on JUnit 4                                                                                                    | method by name                                                   |
| JUnit 5   | yes      | `pitest-junit5-plugin` and a launcher of the engine version | `archunit-junit5`, run on the JUnit Platform                                                                                         | method by name or `@DisplayName`                                 |
| TestNG    | yes      | `pitest-testng-plugin`                                      | Gradle: `archunit-junit5` on the JUnit Platform. Maven: Surefire 3.6+, or an engine/separate execution on older providers, see below | method by name                                                   |
| Spock 2   | yes      | `pitest-junit5-plugin` (Spock runs on the JUnit Platform)   | `archunit-junit5`, run on the JUnit Platform                                                                                         | feature by name, an unrolled iteration by its feature; see below |
| Kotest    | yes      | `pitest-junit5-plugin` (Kotest runs on the JUnit Platform)  | `archunit-junit5`, run on the JUnit Platform                                                                                         | the spec file, no line; counted when the file changed            |

- **Coverage.** JaCoCo's agent records whatever test framework the build's own test task runs, so
  coverage needs nothing per framework.
- **Mutation.** PIT needs a plugin per framework family: its JUnit 4 support is built in, JUnit
  Platform engines (Jupiter, Spock 2, Kotest, the vintage engine) run through `pitest-junit5-plugin`,
  and TestNG through `pitest-testng-plugin`. Each plugin is added only when its framework is on the
  test runtime, so a JUnit 4 project does not get the JUnit 5 plugin, which fails without the JUnit
  Platform. Kotest needs no `kotest-extensions-pitest`: through the JUnit Platform PIT already
  tells killed, survived and uncovered mutants apart per Kotest test (pinned by the Kotest 6.0
  end-to-end test).
- **ArchUnit.** ArchUnit has runners for JUnit 4 and the JUnit Platform only. On Gradle
  `nitpickerArchunit` takes the framework of the declared ArchUnit library (see
  [Slice 4](#slice-4-archunit)); on Maven Surefire runs the rule classes with the provider it picks
  for the project. A violation in a Kotlin or Groovy class is anchored at its `.kt` or `.groovy`
  file, found under the Kotlin source roots too. Surefire 3.6 and newer can run TestNG beside
  ArchUnit without a separate TestNG engine. Earlier Surefire versions select their JUnit Platform
  provider when `archunit-junit5` puts the Platform on the test classpath; that provider runs TestNG
  tests only through `org.junit.support:testng-engine`, so the project's own `mvn test` skips them too. When the
  TestNG engine is missing and Surefire ran none of a module's tests but the ArchUnit classes,
  nitpicker stops with a `java/maven-failure` that names the cause and the two ways out (add the
  TestNG engine, or run TestNG in a Surefire execution of its own) instead of reporting 0% coverage.
- **Slow tests.** Specifications are found under every test source root, `.groovy` files included:
  Gradle's `allJava` source directories cover `src/test/groovy`; on Maven the GMavenPlus test
  sources (its `testSources`, default `src/test/groovy`) and an existing `src/test/groovy` (as
  groovy-eclipse-compiler builds it) are test source roots, and roots that lie outside the module
  are dropped. A Spock feature is found by its quoted name (`def "ships an order"()`); an unrolled
  iteration by its feature, its `#placeholders` read as wildcards (`adds 1 and 2` for
  `def "adds #a and #b"()`) and the default iteration suffix (` [a: 1, b: 2, #0]`) ignored. A
  feature with a `where:` block counts as a template, like a `@ParameterizedTest`. A test that
  names no method (a Kotest test, a custom unroll name) in a file without templates is counted when
  its file changed. `*IntegrationSpec` and `*ISpec` classes get the integration budget.
- **Tests.** `adapters/java-e2e/test-frameworks.e2e.test.mjs` runs a JUnit 4 project with
  `archunit-junit4` rules, a TestNG project and a Spock project, both with `archunit-junit5` rules,
  on Gradle and on Maven (fixtures in `adapters/fixtures/test-frameworks/`), JUnit 4 tests with
  `archunit-junit5` rules and an ArchUnit class no runner picks up on Gradle;
  `adapters/kotlin-e2e/kotest.e2e.test.mjs` runs a Kotest project with `archunit-junit5` rules
  under the Kotlin preset.

## Slice 2: CLI and reporter integration

- **Selection.** Explicit only: `"preset": "java"` in `nitpicker.config.json`. A Gradle or Maven
  build is never picked up silently, because a repository with both a `package.json` and a Gradle
  build would otherwise change meaning. Without the key, nitpicker runs the TypeScript preset, unless
  the project has a Java build file and no TypeScript or JavaScript sources under its source roots
  (bundled assets such as `src/main/resources/static/*.js` do not count): then it
  stops with a config error that names `"preset": "java"` (`rejectUndeclaredPreset`, best-effort, see
  [Using nitpicker](usage.md#configuration)). The head is measured with the head's config and the
  base with its own (widened to the head's roots), and a change to `preset` is listed under "Policy
  changed in this change"; declaring `java` on a project that had no preset is not a loosening.
  The same list reads the build files for what shrinks the measured code (Gradle `sourceSets`
  `srcDirs` and `exclude`, test excludes and filters; Maven `sourceDirectory` and surefire,
  failsafe and compiler excludes), the project tool configs the project opted into
  (`config/pmd/`, `config/checkstyle/`) and hidden code that production imports; see
  [Using nitpicker](usage.md#configuration). Changed `.java` and `.kt` files outside the build's
  source sets are named in a notice.
- **One analyzer, several tools.** The preset is a single analyzer, `java` (one Gradle run per
  snapshot), whose findings carry the tool names `pmd`, `spotbugs`, `errorprone` (Error Prone and NullAway, below), `google-java-format`, `jacoco`,
  `checkstyle` (slice 3), `archunit` (slice 4), `crap` (slice 5), `duplicates` (slice 6), `pit` (slice 7) and `spring` (configuration files, below). The analyzer declares them as
  `reportedTools` (a finding for a tool that is neither the analyzer nor a declared one is an error).
  Its version is the pinned tool versions from the init script, its configuration hash covers the
  init script and the Java adapter files, so a tool bump invalidates the base cache.
- **Everything else is shared.** `nitpicker`, `--all`, `--base`, `--output`, `--defer-exit`,
  `cache publish` and `nitpicker aggregate` take the same path as for TypeScript, so the exit codes
  (0 pass, 1 new enforceable findings, 2 tool error), the console summary and the report files
  (`new-findings.json`, `summary.json`, `report.sarif`, `report.junit.xml` and the rest; `--all`
  writes `findings.json`) are the ones described under [Reports](usage.md#reports).
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
- **Gradle timeout.** Each Gradle command has a 15-minute budget by default, for both Java
  and Kotlin. Set `NITPICKER_GRADLE_TIMEOUT_MINUTES` to a positive whole number of minutes,
  for example `NITPICKER_GRADLE_TIMEOUT_MINUTES=45 npx nitpicker --base main` for a slow PIT
  suite. The same budget applies to base and head. Empty values, fractions, units such as
  `45m`, and values outside 1–17895 are errors. The upper bound keeps the analyzer's Node.js
  timer within its supported range. The analyzer deadline allows two commands (the optional
  Checkstyle configuration export and the analysis), plus one minute for reports. This does
  not change Maven's command budget or configure individual PIT phases.
- **Config keys.** `base`, `disable` and `analyzers` work as before. `history` turns on the
  opt-in [change history](usage.md#change-history) check, which reads git and not the Java runner.
  `thresholds`, `exclude` and `legacyInventory` are shared with the TypeScript preset (`shared/config.mjs`,
  `head-policy.mjs`, `legacy-inventory.mjs`) and reach the Java runner as arguments, so they are
  part of the analyzer's configuration hash:
  - `thresholds.crapLimit` replaces the default CRAP limit (from `shared/policy.mjs`), and
    `fileLines`, `testFileLines` and `folderFiles` the file limits, which count the `.java` files of
    the main and test source sets (branch coverage and duplicates have fixed limits). `classMethods`
    (20), `classFields` (10), `inheritanceDepth` (3) and `folderDepth` (4) replace the limits
    described under [Class and package size limits](#class-and-package-size-limits). Line length
    is 100 characters, where google-java-format wraps (120 for palantir-java-format, or the
    `java.lineLength` convention; see [Style](#style)); nitpicker's own `line-length-limit` rule
    checks it (string literal text, text blocks, imports and URLs do not count, an old long line is
    held and fails only when it grows) and takes an `exceptions` entry; `thresholds.lineLength` is a
    config error, not the general 120. `unitTestSeconds` and
    `integrationTestSeconds` are the [slow test](#slow-tests) budgets.
  - `exclude` drops findings whose project-relative path matches a glob (`**`, `*`, `?`, `{a,b}`);
    the tools still run on those files.
  - `legacyInventory` (default `nitpicker.legacy.json`) lists existing sites as
    `{ "file", "rule", "source", "count" }`, where `source` is the finding's `identity`. Up to
    `count` enforceable findings per site are baselined on both snapshots, read from the head's
    inventory. Head fails with `baseline-expansion` for any site whose count is higher than on base
    (a new site counts as 0 before).
  - `exceptions` lifts one rule for some paths: `{ "rule", "paths", "function"?, "reason" }`. `rule` is
    a finding as it is printed, `<tool>/<rule>` (for example `pmd/UnusedPrivateField`), where `tool`
    is one of the tools the Java analyzer reports, or a rule nitpicker adds, bare or as printed:
    `file-lines-limit`, `line-length-limit` (100 characters per Java line), `folder-files-limit`,
    `folder-depth-limit`, `class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`, the structure rules (`function-lines-limit`,
    `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`),
    `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`,
    `mutant-nocoverage` and `stability-direction`, and the
    [dependency and repository checks](usage.md#dependency-and-repository-checks). `function` names one method
    (`Big.run`, parameter lists ignored; matched exactly, so `run` alone does not accept
    `Big.run`) for the structure, CRAP, coverage and mutation rules, and is required for
    `changed-branch-coverage`. A branch is attributed to the narrowest method of `structure.json`
    that holds its line, or to a unit that is not a method: a `static { }` block
    (`Big.<clinit>`), an instance initializer block (`Big.<init>`) and a field initializer, lambdas
    included (`Big.field`), found by a scan of the source, so every branch of Java code can be
    named. The name in the entry is the one the finding prints. `stability-direction` takes the
    package name as printed (`"paths": ["stable"]`), not a source path. Matching findings are dropped on both snapshots. The entries reach the runner as
    `--exception <json>`, one per entry, are listed in the report and change the analyzer's
    configuration hash. Every message of a rule nitpicker adds ends with the entry that accepts it, and so does every PMD,
    Checkstyle, SpotBugs and ArchUnit message (`pmd/<rule>`).
  - `layout` is a config error with `"preset": "java"` instead of being ignored: its source-folder
    keys are TypeScript only, `layout.featureRoots` is accepted once `history.coChange` is on (it
    names the feature folders `co-change` reads), and `layout.sharedRoots` is accepted once the
    Java preset registers the rule that reads it (`shared-used-by-one-feature`) in
    `shared/project-rules/fact-rules.mjs`. `testConsole` is accepted because the registry lists Java and
    Kotlin for `test-console-output`. `tools` takes `pmd` and `checkstyle`.
- **Packaging.** The init script moved to `languages/java/gradle/` and `languages/**` is in the npm `files`;
  the packed-contents test and the installed-package test assert that `languages/java/gradle/nitpicker.init.gradle`
  ships.
- **Tests.** `core/command/java/java-cli.test.mjs` drives the CLI with a fake `gradle` (`languages/java/adapters/fixtures/fake-gradle.mjs`),
  and with a fake `mvn` plus a fake JDK (`core/command/java/test-support/`), so it runs without Java:
  pass, new finding in text/JSON/SARIF/JUnit, build failure on head and on base, an exception entry,
  missing binary, `--all`, the same cases for both builds. The Gradle fake runs in the test process: `runFakeGradle({ args, cwd })`
  (`languages/java/adapters/test-support/fake-gradle/`) is a pure function, `fixtures/fake-gradle.mjs`
  is the program that calls it, and `spawnFakeGradle` (`languages/java/adapters/test-support/in-process-gradle.mjs`),
  passed as `spawn` through `analyzeJavaSnapshot` and `runGradle`, answers the supervisor call for the fake's
  path, so no Node process starts per Gradle call. Output past `maxBuffer` is answered as `ENOBUFS` and an
  exception of the fake as a failed run; the process-tree deadline is not modelled and stays covered by
  `gradle-process.test.mjs`, and `subprocess: true` tests run the real supervisor (the one CLI case that does
  runs on the Gradle build; the process wiring does not depend on the build). The Maven preset takes the same
  `spawn` option: `runMavenPreset` passes it to `runMaven`, `runJava` and the direct `jar`, `jdeps` and `java -version`
  calls, and `spawnFakeMaven` (`core/command/java/test-support/in-process-maven.mjs`) answers the fake `mvn`
  and the fake `java`, `jdeps` and `jar` (by program name, wherever they are found) in process, so no process
  starts for them. The real Gradle and Maven runs stay behind `NITPICKER_JAVA_E2E=1` (`npm run test:java`), unchanged.

## Slice 1: tools, reports and identities

Identity is how a finding is matched between base and head. It never contains a line number, so a
finding that only moves stays baselined. The comparison key is already
`tool, rule, path, symbol, identity, classification, metric name`; "identity" below is what each
tool adds on top of rule and path.

| Tool                                                                             | Report                     | Ingester                                                    | Classification                                          | Identity                                                                                                            |
| -------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PMD (`pmd`)                                                                      | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                     | enforceable: every reported violation                   | The rule's message text (PMD names the offending field, method or variable in it). Repeats get `#2`, `#3` in order. |
| SpotBugs (`spotbugs`)                                                            | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                     | enforceable: every reported bug                         | SpotBugs' message arguments (class, method or field, called method). Repeats get `#2`, `#3` in order.               |
| google-java-format (`google-java-format`; `palantir-java-format` for that style) | file list from `--dry-run` | `ingestFormatCheck` (new, `shared/ingest/format-check.mjs`) | enforceable                                             | The constant `format`; the file path is the key. One finding per unformatted file.                                  |
| JaCoCo (`jacoco`)                                                                | XML                        | `ingestJacoco` (X6)                                         | descriptive: `line-coverage` metric, `uncovered-method` | As in X6: class and method name plus descriptor.                                                                    |

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

**The project's PMD ruleset.** With `tools.pmd.precedence` listing `"project"`, PMD runs
nitpicker's ruleset and the project's together, on Gradle and Maven alike
(`adapters/tool-config/pmd-layers.mjs`). A rule the project names on its own, or defines inline,
is laid over nitpicker's definition of the rule: nitpicker's copy is excluded and the merged rule goes into
the project's ruleset file (PMD keeps the first reference of a rule, and a ruleset's `exclude-pattern`
applies to the file that holds it), so the project's priority, message and named properties win while the
properties it leaves unset keep nitpicker's values (xpath, `violationSuppressXPath`, `ignore...`). A
whole-category reference enables the rules nitpicker leaves out of that category (as single `<rule ref>`
entries, minus the project's `<exclude>`s) and nothing nitpicker already runs, and an `<exclude>` in the
project's file cannot turn a nitpicker rule off. With `["nitpicker", "project"]` nitpicker's values win
where both set one. A rule nitpicker runs through its test-only ruleset (`TestClassWithoutTestCases`, from
`pmd-test-ruleset.xml`) is never added to the project's file, so a project category reference does not run
it a second time; a project rule that names it is overlaid on that ruleset (`pmd-test-rules.xml`) instead.
The main-only ruleset (`pmd-main-ruleset.xml`, which holds the `security` category) works the same way: a
project reference to `category/java/security.xml` adds nothing, and a project rule that names one of its
rules is overlaid on it (`pmd-main-rules.xml`) and still runs on main sources only.

**Additional PMD categories (7.7.0).** The shared ruleset also runs the `performance` and
`multithreading` categories on main and test Java sources, and `pmd-main-ruleset.xml` runs the
`security` category on main sources only, since a test encrypts with a fixed key and IV to check known
output. Both hold with Gradle and Maven and for the Java sources of the Kotlin preset. Performance
rules cover redundant string allocation and conversion, builder appends, array copies, collection
conversion and `Files` streams instead of `FileInputStream`/`FileOutputStream`. Multithreading rules
cover `synchronized`, thread groups, calling `Thread.run()` directly, unsafe singleton publication,
shared formatters and `wait`/`notify`. `synchronized` is not allowed because the preset has one
locking style, a private final `ReentrantLock` taken right before `try` and released in `finally`
(with a `Condition` in place of `wait`/`notify`), not for performance: since JDK 24 a virtual thread
no longer pins its carrier inside `synchronized` (JEP 491). Security rules find hardcoded
cryptographic keys and IVs in main code; a constant IV that decrypts an existing format takes a path
exception. Each rule's message names the one allowed form and ends with the exception route.

Four rules of these categories are narrowed where their default flags code that has no other form
(see "PMD rules tuned by nitpicker" below).

Six rules of these categories are left out, each with its reason next to it in `pmd-ruleset.xml`:

| Category       | Excluded rule                         | Reason                                                                           |
| -------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| performance    | `AvoidInstantiatingObjectsInLoops`    | A loop that needs a distinct object per item is correct; hoisting changes it.    |
| performance    | `TooFewBranchesForSwitch`             | A small exhaustive switch is valid.                                              |
| performance    | `InsufficientStringBufferDeclaration` | A capacity hint is a micro-optimization; asking for one only adds magic numbers. |
| multithreading | `AvoidUsingVolatile`                  | `volatile` is a valid visibility primitive.                                      |
| multithreading | `DoNotUseThreads`                     | The J2EE container restriction does not apply to most applications.              |
| multithreading | `UseConcurrentHashMap`                | A `Map` declaration does not show concurrent access.                             |

A project that wants one of them back names it in its own ruleset (`tools.pmd.precedence`, above).
The reverse does not work: an `<exclude>` in the project's ruleset cannot turn off a rule nitpicker
runs; keep code a rule flags with a path exception or an entry under `exceptions` in
`nitpicker.config.json`.

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
| `DontCallThreadRun`                | `super.run()` inside a `Thread` subclass's `run()`; any other `run()` call on a `Thread` is `start()`.                                                                                             |
| `AvoidFileStream`                  | A stream, reader or writer over a `FileDescriptor` (`new FileInputStream(FileDescriptor.in)`), which `Files` has no form for.                                                                      |
| `AvoidArrayLoops`                  | A copy loop that subtracts the loop variable in an index (a reversed copy), which `System.arraycopy` cannot do.                                                                                    |
| `UseArraysAsList`                  | A loop that filters, steps by more than one or does more than add each element; the loop that only adds is `Collections.addAll(target, array)`.                                                    |

## Slice 3: Checkstyle

- **Gradle side.** The init script applies the Gradle `checkstyle` plugin (version pinned in the
  map, `checkstyle: 10.21.1`) and makes `nitpickerJava` depend on the Checkstyle task of the
  main source set and of every test source set (see [Coupling and stability](#coupling-and-stability-ticket-sh6)
  for which source sets are tests; a `jmh` or `benchmark` set is not checked). `ignoreFailures` is on and the XML reports are written to `checkstyle.xml` (main
  sources) and `checkstyle-<source set>.xml` (`checkstyle-test.xml`, `checkstyle-integration.xml`,
  ...) in the report directory; the HTML report is off.
- **Configuration.** The preset uses `google_checks.xml` from the pinned
  Checkstyle jar, with the layout checks the formatter owns (see [Style](#style)) and `MissingJavadocMethod` and
  `MissingJavadocType` suppressed (`languages/java/gradle/checkstyle-suppressions.xml`): Javadoc is
  allowed on public API but not required, the same rule as the TypeScript preset. Member and method
  names may be a single lowercase letter (`x`, `y`), as record components can. Javadoc that is
  there still has to be well formed. With this bundled config the tasks run on nitpicker's own
  `nitpickerCheckstyle` configuration, so a project that declares its own Checkstyle version in
  `checkstyle` (Spring PetClinic declares 12.3.1) still gets the pinned version and its config.
  A project config chosen by policy (`tools.checkstyle.precedence` lists `"project"`) is merged
  into this one module by module (`adapters/tool-config/checkstyle/checkstyle-layers.mjs`, run in
  Node by `checkstyle-merge.mjs` between two Gradle runs (the first exports nitpicker's config, the second
  gets the merged file as `-Pnitpicker.checkstyle.mergedConfig`) and by `writeCheckstyleSetup` for Maven): the project's property
  values win for the modules both configs name, the modules only one names stay, so nitpicker's
  checks are never dropped, and the merged file still runs on the pinned Checkstyle. Decision to review: google_checks is noisy on
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

- **Wildcard imports follow the project.** Wildcard and explicit imports are both valid, so
  the `java.wildcardImports` convention (`explicit` or `wildcard`, default `explicit`) marks a file
  `wildcard` when it has any wildcard import except a static one in a test source set, and the plurality
  of files wins. With `wildcard`, `checkstyle/AvoidStarImport` and `errorprone/WildcardImport` are
  dropped on Gradle and on Maven alike (the Kotlin preset's Java files too); PMD and google-java-format
  have no such rule. Static wildcards in test sources (`import static org.assertj.core.api.Assertions.*;`)
  are their own convention, `java.testStaticImports`, measured over the test source sets
  (`src/test`, `src/integrationTest`, ...): with `wildcard`, only star findings on a
  `import static` line of a test file are dropped, and the ban stays everywhere else. Pin either in
  `conventions` (see [Configuration](usage.md#configuration)).

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
  type does not push a method over the limit. Lambda bodies, initializer blocks and members of
  nested and anonymous classes are units of their own and do not count towards the enclosing
  method; the same scanner counts all of them (see
  [Structure limits (SH5)](#structure-limits-sh5)).
- **Ingester.** `ingestCrap` (`languages/java/ingest/crap.mjs`) joins those methods with the JaCoCo
  report (same `jacoco.xml` as slice 1). A JaCoCo method belongs to a method of `structure.json` when
  the file, the method name (`<init>` is the class name) and the line match: the method's first line
  lies in the method's line range. This also joins methods of anonymous classes. A constructor is
  also joined by its parameter types (`parameterTypes` in `structure.json` against JaCoCo's
  descriptor), because a class with field initializers starts its `<init>` at the first initializer,
  before the constructor. A lambda is joined to the synthetic JaCoCo methods `lambda$<method>$<n>`
  (`lambda$new$<n>` in a constructor, an instance initializer or a field initializer,
  `lambda$static$<n>` in a static one) whose first line lies in the lambda's range and not in a lambda
  nested in it, so a lambda inside a lambda is scored separately and an outer lambda is scored
  without the inner one. An initializer block and a field initializer that branches (`entry.initializer`
  in `structure.json`) have no JaCoCo method of their own: their code is part of the constructors'
  `<init>` or of `<clinit>`, so their coverage is read from JaCoCo's per-line data (`jacoco.xml`
  `<sourcefile><line>`: covered lines and branches) for the lines of the unit, minus the lines of a unit nested in
  it, and the lower of the line and branch percentage is used as everywhere else. A constructor's
  own score still counts the initializer lines that its `<init>` holds.
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
  report through `build.gradle`. JaCoCo and PIT still skip code annotated `@Generated`. An
  annotation whose value names a known generator (MapStruct, Dagger, AutoValue, Immutables and the
  others the generated-sources check lists) makes the whole file generated, so its findings are
  dropped and no `pmd/GeneratedOnHandWrittenCode` is reported; adding one to a file the base checked
  is a policy loosening. Any other `@Generated` is the `pmd/GeneratedOnHandWrittenCode` finding.
  Only violations are findings; the
  per-function metric findings of the TypeScript check are not produced.
- **Identity.** `function:<signature>`, for example `function:Calc.classify(int, int, String)`:
  enclosing classes, method and parameter types (`signature` in `structure.json`), never a line;
  a lambda is `function:Calc.classify.<lambda>` or `function:Calc.classify.callback` (named after the
  variable it initializes), an initializer block `function:Calc.<clinit>` (static) or
  `function:Calc.<init>`, a field initializer `function:Calc.LIMIT`.
  Repeats (anonymous classes) get `#2`, `#3` in report order. The `<init>`, `<clinit>` and `<lambda>`
  names repeat within a class by nature, so a finding on one is numbered only among the entries of
  that name with the same source text that are over the limit: inserting, deleting or reordering other
  blocks or lambdas never turns a legacy one into a new finding. The path
  is part of the comparison key, so, as with the hashed identities of slice 1, a renamed file shows
  its findings as resolved plus new. Changing a method's parameters is a different function, as in
  the TypeScript check, where an edit that moves a function changes its identity too.
- **Tests.** `languages/java/ingest/crap.test.mjs` against the committed samples
  `fixtures/structure.json` and `fixtures/jacoco-crap.xml`; `java-reports.test.mjs` covers the glue;
  the gated e2e test has a case adding a ten-branch untested method.

## Slice 6: duplicates

- **Where it runs.** jscpd is a Node tool, so it is not in the Gradle init script (which this slice
  does not touch). After the Gradle task has written `manifest.json` in the report directory,
  `languages/java/adapters/metrics/java-duplicates.mjs` runs the package's own pinned jscpd (`runJscpd` in
  `core/tooling/jscpd/run-jscpd.mjs`, shared with Python and the one the TypeScript `duplicates`
  check uses; its version is appended to the analyzer version as `jscpd@x.y.z`) once per existing
  main source root with `--format java --mode mild` and a nitpicker-owned `--config` (a project's
  `.jscpd.json` is not read). It ignores the folders named `build`, `generated`, `target` and `out`
  at any depth; the config key `duplicates.skippedFolders` replaces this list (an empty list
  ignores nothing) and reaches the runner as `--duplicate-skipped-folders`. Clones made only of
  `package` and `import` lines (the clone may end on the line where the following declaration
  starts) are not reported (`core/tooling/jscpd/import-only/jvm-imports.mjs`). The message names
  both files and tells to add either to `exclude`, and a glob that matches either file of the pair
  lifts the finding. It runs once for the whole build, over the source roots of every Gradle project.
  Reports go to `jscpd/<n>/` in the report directory and are merged into its `duplicates.json`.
  Clones across two source roots, and so across two Gradle projects, are not detected (running jscpd once over all roots would detect them, at the price of changing the identity of every existing Java clone finding). A jscpd
  failure is a tool error like a Gradle failure.
- **Findings.** The same normalizer as the TypeScript check (`normalizeDuplicates`), tool name
  `duplicates`: `duplicate-clone` (enforceable, one per clone) and `duplicate-clone-size`
  (descriptive metrics `lines` and `tokens`). There is no extra threshold:
  jscpd's defaults (5 lines, 50 tokens) apply, as for TypeScript.
- **Renamed copies.** A second jscpd run (100 tokens, 5 lines), on Gradle and Maven alike, goes over
  a normalized copy of the `.java` files of each source root, where names, strings, characters,
  numbers and comments are one token each, `package` and `import` lines, literal-only `List.of`,
  `Map.of` and `Arrays.asList` calls and array initializers are blanked and generated files are left
  out, so a copy with renamed locals and changed literals fails too, with `duplicate-clone` and an
  identity starting `renamed:`. It replaces a plain clone over the same two ranges, and drops clones
  made of declarations only (fields, constructors, getters and setters) and clones that only repeat
  one or two statements (DTO mappers, enum `switch` tables). The copy lives under the report
  directory while the run lasts. The message names the same route as for any clone: add either file
  of the pair to `exclude`.

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
  this rule when the finding comes from `jacoco` (`isTouchedCodeRule` in `shared/policy.mjs`), so an
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

- **Rule.** `slow-test` (tool `test-runtime`) fails a test the change adds or edits when it takes more than 5 s
  as a unit test, or more than 30 s as an integration test (`thresholds.unitTestSeconds` and
  `thresholds.integrationTestSeconds`). The rule, message shape, budgets and exception are the same
  for [TypeScript and JavaScript](typescript-strict-preset.md#slow-tests) and
  [Python](python-preset.md#slow-tests); the finding prints the bare id `slow-test`, and
  `test-runtime/slow-test` is accepted in `exceptions` as the same rule. Integration tests are those
  of a test task other than `test` (Maven's `surefire` counts as `test`), classes named `*IT`,
  `*ITCase`, `*IntegrationTest(s)`, `*IntegrationSpec` or `*ISpec`, classes in a package with an
  `integration`, `it` or `e2e` segment (the same rule `archunit/spring-test-placement` uses), and
  classes annotated `@SpringBootTest`, also through a
  superclass or an annotation of their own that carries it, when that type's source is in a test root.
  The message names the budget, the measured time, the fixes (no `Thread.sleep` or other waits, a
  smaller Spring context or a test slice, or, for an integration test, an `*IT` name or an
  integration test source set; on Maven, an `*IT` name so that Failsafe runs it) and the exception
  route. Both keep the test's package, so package-private classes stay visible.
  Nitpicker runs only the tests its run needs: on Gradle `test` and the test tasks `check` depends on
  (see [Integration tests on Gradle](#how-it-works)), on Maven the `test` phase, or `verify` when
  Failsafe runs, so a test moved out of them is not timed.
- **Measurement.** Head only, from the JUnit XML the test tasks already write: the init script copies
  `TEST-*.xml` of every checked test task that ran (not the ArchUnit tasks) to
  `test-results/<task>/` in each module's report directory. No extra test run. A rerun test keeps
  its slowest time; only passed tests are timed (failed, errored and skipped cases are left out).
  A failing build reports its own error and no slow tests.
  Unlike TypeScript and Python, a slow test is not run again without coverage: the build runs the
  tests once, and a second build would double the cost, so the time is that of the build's own run
  (with JaCoCo's agent when the same run measures coverage) and is checked against the budget as
  measured. Maven builds copy Surefire's `TEST-*.xml` to `test-results/surefire/` and
  Failsafe's to `test-results/failsafe/` (see [Maven builds](#maven-builds)); `surefire` counts as
  the `test` task, `failsafe` as an integration task. Failsafe runs when the project binds its
  `integration-test` goal and does not keep it off, because nitpicker then builds to `verify`.
- **Edited or added.** Each test is keyed by class and testcase name (Gradle writes the display name,
  so a parameterized case is keyed by its `[n] ...` name; Surefire writes the method name). The test
  method is found in the source by that name (also `name()[n]` and JUnit 4's `name[n]`) or its
  `@DisplayName`, with its annotations, inside the class the report names: a `@Nested` test
  (`CalcTest$WhenFull`) is looked up in that nested class, and named `CalcTest.WhenFull` in the
  message. `void` and `fun` methods count, and `@TestFactory` methods that return dynamic tests. A
  test is counted when its method text differs from the base, or the file is new. A file the base
  does not have at that path is first looked up by its file name under the base test roots, among
  the base files the change removed or renamed, so a test file moved to another package with the
  test unchanged reports nothing, while a copy next to an original that still exists is new. A test
  the class inherits (an abstract contract test in a superclass) is found by following `extends` (or
  Kotlin's `: Base()`) through the test roots, reported at the superclass method, and counted when
  that method differs from the base, or the class is new or extends another class. A name that maps
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

## Tests that never run

A test class that the build compiles but no test task runs is an enforceable `test-not-run`
finding (tool `test-runtime`, `languages/java/adapters/test-runs/unrun-tests.mjs`), on Java, Kotlin
and Groovy test sources alike. A class counts as a test when its source declares one (`@Test`,
`@ParameterizedTest`, `@RepeatedTest`, `@TestFactory`, `@TestTemplate`, a Spock `Specification` or
a Kotest spec) and it is not abstract, an interface or an annotation.

- **Maven.** Surefire skips the classes Failsafe's default includes name (`IT*`, `*IT`, `*ITCase`).
  In a module where Failsafe does not run (see [Maven builds](#maven-builds); the manifest says
  `runsFailsafe`), such a class under the test source roots (and `src/test/kotlin` next to
  `src/test/java`) that has no report in `test-results/` (Surefire was not set up to run it) is
  reported: "Bind the integration-test and verify goals of maven-failsafe-plugin in this module so
  OrderIT runs: ...". The correct forms are a module that binds Failsafe, or test classes Surefire
  runs.
- **Gradle.** A test task runs every class of its source set whatever its name, so `*IT` in
  `src/test/java` runs under `test`. The silent skip is a test source set (a source set other than `main` whose name contains `test`, such as `integrationTest`) that no `Test` task takes its
  classes from: the init script lists those source sets with their Java, Kotlin and Groovy source
  directories as `unrunTestSourceSets` in the manifest, and each test class in them is reported:
  "Register a Test task for the integrationTest source set (testClassesDirs = ..., classpath = ...)
  so OrderSliceTest runs: ...". A source set that holds no tests (`testFixtures`, helpers) is
  quiet.

Every message ends with the shared exception sentence, naming
`{ "rule": "test-runtime/test-not-run", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/test-runs/unrun-tests.test.mjs`, the Gradle `multi-project` fixture (an
`integrationTest` source set without a test task) and the Maven `multi-module` fixture (an `*IT`
class in a module without Failsafe).

## Console output of tests

- **Rule.** `test-runtime/test-console-output` fails a change whose tests print console output the
  base run did not print, with the same semantics as the TypeScript preset's rule: the output is
  compared as text after normalization, `testConsole.allow` in `nitpicker.config.json` skips a
  third-party message (`{ "contains": "...", "paths": [...], "reason": "..." }`, with the same
  matching), and an exception lifts a test file. The message quotes the normalized line, names the
  test file and test that printed it, says to fix the cause (a warning the code under test now logs,
  a mock or thread that outlives the test) and gives both routes.
- **What counts.** From the JUnit XML the test tasks already write (`TEST-*.xml`, copied as for
  [slow tests](#slow-tests)): every `system-err` block, and the `system-out` blocks that carry a
  `WARN`, `WARNING`, `ERROR`, `FATAL` or `SEVERE` level, so Spring's banner and `INFO` startup lines
  never count. A block is a line plus its indented continuation lines; stack frames
  (`at ...`, `... 3 more`) are dropped. A JVM warning is several `WARNING:` lines and often follows
  the line that caused it (Mockito's "self-attaching" notice and the agent warning after it on JDK
  21); adjacent `WARNING:` lines and the line next to them are one block, so one finding. SLF4J's own
  notices (`SLF4J(W): No SLF4J providers were found.`) describe the test classpath, not the code
  under test, and land on whichever test first loads a logger: on Maven that is the first test,
  because Surefire discovers the ArchUnit classes in the test JVM, while Gradle runs them in
  `nitpickerArchunit`. Both builds drop them, so they report the same. Surefire's redirected output files (`<class>-output.txt`,
  with `redirectTestOutputToFile`) are copied too and read with the stdout rule. The init script
  sets `outputPerTestCase` on every test task, so Gradle names the test that printed a line as
  Surefire does; a test name loses its parameter list (`totals()` is `totals`).
- **Normalization.** The TypeScript preset's normalizer (`shared/rules/console/console-messages.mjs`), so
  `testConsole.allow` matches the same way in every preset: ANSI colors, absolute paths (kept as the last segment),
  timestamps and clock times, hex values, UUIDs, random-looking words and numbers (with their
  units) are replaced, so `cache miss for order 42` and `... 43` are the same message. The thread
  name of a Spring Boot (`--- [main]`) or Logback (`[main] WARN`) log line is replaced too: Gradle
  runs tests on `Test worker`, Surefire on `main`. The same normalizer also covers the escaped and
  replaced characters of Gradle and Surefire reports, `java.util.logging` clock lines, durations and
  the random parts of Mockito, ByteBuddy and proxy class names.
- **Keyed per module, not per file.** The finding's path is the module directory (`.` for the
  root) and its identity a hash of the normalized message. The JVM shares state across test
  classes: Spring caches one application context for every test class that asks for it, and a
  library warns once per JVM, so the class that prints a startup warning changes when tests are
  added or reordered. Keying per module keeps such a line baselined wherever it moves; a new line
  in any test of the module still fails. The finding carries the message words as `tokens`, for the
  shared matcher that tolerates one random-looking word.
- **Limits.** Output a test prints from a thread after it ends is attributed by the build to
  whatever runs then. A line printed only in some runs (a timing-dependent warning) shows up as new
  in the run that has it; allow it in `testConsole.allow` with the reason.
- **Tests.** `adapters/test-times/console-output.test.mjs`, `console-findings.test.mjs`,
  `maven/results/maven-test-results.test.mjs`, and `spring/java-spring.e2e.test.mjs`, which
  commits a test that prints a new line on top of the Spring fixture and asserts, on Gradle and on
  Maven, that it is the only console finding: Spring's startup output, the WARN line a service logs
  in an unchanged `@SpringBootTest`, and a renumbered line in an edited test all stay baselined.

## Error Prone and NullAway

- **What runs.** `nitpickerErrorProne`, a dependency of `nitpickerJava`, compiles the main Java
  sources and those of every test source set (`test`, `integrationTest`, `testFixtures`, the same
  ones Maven compiles as test sources with build-helper's `add-test-source`) a second time with javac and Error Prone 2.50.0 (Apache 2.0) as its
  plugin, plus NullAway 0.14.2 (Uber, MIT), an Error Prone plugin for null safety. The task lives
  in `languages/java/gradle/errorprone/` (`error-prone.gradle`, applied by the init script to
  every `java` project, and `ErrorProneReport.java`). It uses the classpath, annotation processors,
  compiler arguments and encoding of `compileJava` and of each test source set's compile task, writes classes only to
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
  and the `spring-project` fixture 1 (`MissingOverride`) before it held the Spring rule examples. NullAway alone: 6, 4, 0 and 0, nearly all
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
| `BooleanParameter`               | off     | Asks for /* name= */ comments on literal arguments; the clearer fix (an enum or a named method) is outside its message                                                                                                                    |
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
| `RemoveUnusedImports`            | off     | A formatter removes unused imports, so the file is already reported as unformatted; with no formatter, Checkstyle's UnusedImports reports them                                                                                            |
| `ReturnMissingNullable`          | off     | Only asks for a @Nullable annotation; NullAway reports the returned null where it matters, and the fix is often a non-null value                                                                                                          |
| `StaticOrDefaultInterfaceMethod` | off     | Forbids static and default interface methods for old Android; they are the normal form in modern Java                                                                                                                                     |
| `StringFormatWithLiteral`        | off     | Crashes Error Prone 2.50.0 (IllegalFormatConversionException) on a format string that does not match its literal arguments, failing the whole run                                                                                         |
| `ThrowsUncheckedException`       | off     | Declaring an unchecked exception in throws documents it to callers, a valid style                                                                                                                                                         |
| `TooManyParameters`              | off     | The parameter limit is the project's choice; the structure rule function-parameters-limit sets it in nitpicker.config.json                                                                                                                |
| `UnnamedVariable`                | on      | An unused variable named _ or a name are both valid forms, and its fix fights the var unused = ... form other checks ask for                                                                                                              |
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
file (with no formatter, Checkstyle's `UnusedImports` reports it), and `EmptyIf`, whose `if (c);` Error Prone's own `UnnecessarySemicolon` reports at the same
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
exception for the primary, a primary tool that did not run (NullAway without packages) or a primary dropped for its own
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
- line: `errorprone/DoNotCall` over `spotbugs/RU_INVOKE_RUN`, `pmd/DontCallThreadRun`
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
- line: `pmd/ClassLoadEffect` over `spotbugs/SC_START_IN_CTOR`
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
- line: `errorprone/JdkObsolete` over `pmd/ReplaceEnumerationWithIterator`, `pmd/ReplaceHashtableWithMap`, `pmd/ReplaceVectorWithList`, `pmd/UseArrayListInsteadOfVector`
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
- member: `errorprone/DoubleCheckedLocking` over `pmd/DoubleCheckedLocking`
- line: `pmd/StringInstantiation` over `spotbugs/DM_STRING_CTOR`, `spotbugs/DM_STRING_VOID_CTOR`
- line: `pmd/UseStringBufferForStringAppends` over `spotbugs/SBSC_USE_STRINGBUFFER_CONCATENATION`
- line: `pmd/UnsynchronizedStaticFormatter` over `spotbugs/STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE`
- class: `errorprone/DateFormatConstant` over `pmd/UnsynchronizedStaticFormatter`, `spotbugs/STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE`
- field: `errorprone/DateFormatConstant` over `spotbugs/STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE`
- line: `pmd/NonThreadSafeSingleton` over `spotbugs/LI_LAZY_INIT_STATIC`, `spotbugs/SING_SINGLETON_GETTER_NOT_SYNCHRONIZED`

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
{limit}`, and for nesting `{name} nests control flow {value} deep (limit {limit})`) as TypeScript, followed by the `exceptions` entry that accepts the method (`If this is intended, add {...} to
"exceptions" in nitpicker.config.json.`). `shared/policy.mjs` marks the four rules as enforced for Java; the
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
  method and constructor with a body, each static and instance initializer block with a statement
  (`Class.<clinit>`, `Class.<init>`), each field initializer that is a lambda (`Class.field`) or
  branches (`?:`, `&&`, `||`, a `switch` expression) and each lambda (`Class.method.<lambda>`; one
  assigned to a variable or field is named after it, one inside another unit is named after that unit,
  as in `Class.method.<lambda>.<lambda>`), as every arrow function and callback is in TypeScript. `lines`: last line - first line + 1, annotations and
  modifiers included, Javadoc not. `statements`: every statement in the body except blocks (`for`
  initializers and updates, `catch` parameters and `try` resources are not statements).
  `maxControlNesting`: deepest nesting of `if`, `for`, enhanced `for`, `while`, `do`, `switch`
  (statement or expression) and `catch`; an `else if` stays on the level of the `if` it continues,
  as in the Python and Kotlin presets. `parameters`:
  declared parameters (the parameters of the lambda). Anonymous, local and member class bodies,
  lambdas and initializer blocks are separate units and do not count towards the method that
  contains them: the statements, control nesting and complexity of a lambda are its own, as in
  TypeScript (`lines` is the physical span, so the lines of a nested unit still count towards the one
  around it). A lambda with an expression body has 1 statement. A field initializer unit has 1 statement.
- **Findings.** `languages/java/adapters/metrics/java-structure.mjs` hands the metrics to `evaluateStructure` and keeps
  the enforceable limit findings only (tool `structure`); the per-method descriptive metrics of the
  TypeScript check are not emitted, since they would add four findings per method to every report.
  Name: `Outer.Inner.method` (constructors use the class name; anonymous classes `<anonymous>`;
  initializer blocks `Outer.<clinit>` and `Outer.<init>`, lambdas `Outer.method.<lambda>`),
  identity: name, occurrence among equal names in the file and a hash of the method text with
  indentation removed, no line number. A moved or re-indented method stays baselined; editing a
  method that already violates produces a new finding, as in TypeScript.
- **Cache invalidation.** `StructureMetrics.java`, `java-structure.mjs`, `structure-report.mjs` and the shared structure
  rule files are in the Java analyzer's configuration hash.
- **Tests.** `java-structure.test.mjs` (fast: limits, messages, identity stability);
  the gated e2e adds a branch with a method over the parameter limit (fails) and keeps a legacy
  oversize method baselined.

## Class and package size limits

Three limits on classes of the main sources and one on package depth, all failing only when the
change makes them worse (the same ratchet as the file limits): a class already over a limit is
held at its value and fails when it grows, and a new class over a limit fails. Each message names
the allowed form and the `exceptions` entry that lifts it.

| Rule                      | Default limit                                                                            | Threshold          |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| `class-methods-limit`     | 20 methods per class; getters and setters count, constructors do not                     | `classMethods`     |
| `class-fields-limit`      | 10 instance fields per class; record components count, statics and enum constants do not | `classFields`      |
| `inheritance-depth-limit` | 3 superclasses; a superclass outside the project counts as one level                     | `inheritanceDepth` |
| `folder-depth-limit`      | 4 package levels below the root package (test sources too)                               | `folderDepth`      |

- **Classes.** `languages/java/gradle/StructureMetrics.java` (the Gradle task `nitpickerStructure`,
  and the structure step of the Maven run for each module) writes `classes.json` next to
  `structure.json` in the same parse, so each module's sources are parsed once. Gradle and Maven
  projects get the same limits. Member and
  local classes, interfaces, enums, records and annotation types are measured on their own;
  anonymous classes are not. Tests are not measured: a test class legitimately holds many methods.
  The inheritance chain is resolved from the source text (same package, imports, wildcard imports,
  nested names, names in full), not compiled, so a superclass that only the compiler can find counts
  as one level and ends the chain, so a hierarchy that continues in another module or a library is
  undercounted. A record over `classFields` gets its own message (components, not fields). A kotlin-preset project gets the class limits for its `.java`
  files; Kotlin classes are not measured.
- **Package depth.** The root package is the longest package prefix all main and test code of the
  base shares, so adding a package outside it (`db/migration`, the default package) moves nothing:
  the head run reads the root from the base snapshot, and a project with no base code uses its
  own. A package with code in it that lies more than four levels below the root fails once per
  kind of file (source, test); a package outside the root counts its own levels. Packages are the
  folders under the source roots.
- **A missing report is an error.** If `classes.json` is absent the run fails with a tool error
  naming the structure step (`StructureMetrics.java`), so a build that skipped it cannot silently
  drop the limits.
- **Allowed form.** Split a class by responsibility, group fields into a record, prefer composition
  to a deep hierarchy, and keep packages flat: group by responsibility instead of nesting.
- **Exceptions.** A class limit is lifted for the file the class is in
  (`{ "rule": "class-methods-limit", "paths": ["src/main/java/app/Mapper.java"], "reason": "..." }`);
  `folder-depth-limit` for the package folder (`"paths": ["src/main/java/app/a/b/c/d/e/**"]`).

## Style

The formatter owns layout, and nitpicker follows the formatter the project uses. The
`java.formatter` convention is `google` (google-java-format, the default), `palantir`
(palantir-java-format, Apache-2.0, pinned like google-java-format and resolved the same way on Gradle
and Maven) or `none` (no format check). It comes, in this order, from:

1. A pin in `"conventions": { "java.formatter": "..." }`.
2. The build files, with no opt-in: Spotless `googleJavaFormat()` or `palantirJavaFormat()` in
   Gradle, `spotless-maven-plugin` with `<googleJavaFormat>` or `<palantirJavaFormat>`,
   `fmt-maven-plugin`, the `com.palantir.java-format` plugin, or either formatter's artifact in a
   version catalog. `googleJavaFormat().aosp()`, `.style("AOSP")` and a `<style>aosp</style>` read as
   google-java-format with 4 spaces; `palantirJavaFormat().style("GOOGLE")` reads as google (with
   `"AOSP"`, google with 4 spaces); `eclipse()` and `prettier()` in a Spotless `java` block read as
   `none`. The scan covers the root and module `build.gradle(.kts)` and `settings.gradle(.kts)`, the
   `gradle/*.versions.toml` catalogs, the convention plugins under `buildSrc/` and `build-logic/`
   (`.gradle`, `.gradle.kts`, `.kt`, `.groovy`) and every `pom.xml` of the project (module and parent
   poms), at most 200 files, shallowest first. Files under `src/`, `node_modules`, `build`,
   `target`, `out`, `fixtures` and `testdata`, and paths in `exclude`, are skipped. Comments are
   removed by a reader that knows string literals (`//` and `/* */` only outside quotes in Gradle
   files, `#` in TOML; the XML parser skips pom comments), so a glob such as `'**/*.java'` or
   `**/*Test.java` around the plugin does not hide it. Within a file palantir wins when both are
   named; across files the most common declaration wins and a tie declares nothing.
3. The Java files, when the build names nothing: each file votes from a call the formatter wrapped
   after `(`, never from its longest line, and a file with no such call votes for nothing. Two spaces
   or four spaces wrapped at 100 vote `google`, four spaces wrapped at 120 `palantir`, and block
   indentation with tabs, 140 columns or two spaces at 120 vote `none` (tabs inside text blocks and
   comments do not count). The winner needs at least 3 voting files and more than half of the
   votes. With weaker or no evidence the choice stays `google`, and the measured indentation picks
   `--aosp`. An IntelliJ project with four spaces and 120 columns looks like palantir-java-format to
   the measure; pin `java.formatter` to `none` for it.

The formatter a build file declares (`googleJavaFormat()`, `palantirJavaFormat()`, `aosp()`, a style
name, the Maven plugins) is a fact about which formatter the project uses, so it is detected without
any opt-in; the Kotlin preset does the same for the ktfmt style its build names. Config files (the
Checkstyle config, detekt, `.editorconfig`, `ruff.toml`) are read only once their tool lists
`"project"`.

The build files are read from the same snapshot as the measured conventions: the merge base in a
comparison (so a pull request that adds `palantirJavaFormat()` is still judged at the limits of its
base, and starts being judged at 120 once it is merged), the checked-out tree for `--all`, and the
pull request's own tree only when the base has no Java sources yet. The Checkstyle config below is
read from the same snapshot. Nothing in `nitpicker.config.json` is involved, so the policy gate has
nothing to report here; the printed "Following this project's conventions" block names the
formatter and where it came from.

The formatter fixes what it can: google-java-format wraps at 100 and indents with 2 spaces (4 spaces,
8 for a continuation line, with `--aosp`, which nitpicker uses for the `java.indentation` convention
`"4"`; a declared `googleJavaFormat()` without `.aosp()` fixes it at `"2"`); palantir-java-format
indents with 4 and wraps at 120. `java.indentation` is `"2"`, `"4"` or `"tab"`. `java.lineLength` is
any whole number of columns from 10 to 999 (`"100"`, `"120"` and `"140"` are the measured ones);
it drives the limit of `line-length-limit` for Java files. When the formatter comes from a pin or the
build file, a pin that contradicts what it fixes is a config error that names where the formatter
came from (`"conventions.java.lineLength" is "120", but google-java-format (declared in your build
file) fixes it at "100"`). When the formatter is only the default or was measured, the contradiction
means the project does not use it: the formatter becomes `none` and the run prints why (`from your
conventions.java.lineLength pin in nitpicker.config.json`). A repository without Java files never
fails on this. With `java.formatter` set to `none`, `java.lineLength` is measured from wrapped
code the way `kotlin.lineLength` is (unbreakable lines, such as imports, URLs, string literals and
text blocks, do not vote).

When `tools.checkstyle.precedence` lists `"project"` and `config/checkstyle/checkstyle.xml` has a
`LineLength` module, its `max` (any number; Checkstyle's default 80 for a module without one) wins
over the formatter and the files (the project overrides only what it sets). A formatter that was
only the default or measured gives way to it and becomes `none`; a declared or pinned one stays, and
runs at the Checkstyle width, because listing `"project"` is the project's own decision about the
width. A `LineLength` module with `severity` `ignore` is not read, and a `max` outside 10 to 999 is
ignored with a printed note. Checkstyle's own `LineLength` stays suppressed, so the limit is checked once, by
`line-length-limit`. The run prints each choice and its source. The conventions apply to the Java
sources of a kotlin-preset project too. They come from the head policy file at run time, and the
function `javaStyle()` in `languages/java/adapters/style/java-style.mjs` turns them into the style
(`google`, `aosp`, `palantir` or `none`), which reaches Gradle as `-Pnitpicker.java.style` and Maven
as `javaStyle`.

A badly formatted file is one `google-java-format`, `google-java-format --aosp` or
`palantir-java-format` finding (the one that ran), not hundreds. Its message gives the command that
fixes the file (`google-java-format --replace <Java files>`, with `--aosp`, or `palantir-java-format
--palantir --replace <Java files>`) and says how to pin `conventions.java.formatter` (`"google"`,
`"palantir"` or `"none"`) in nitpicker.config.json when it is not your formatter. The Checkstyle
checks that only restate the formatter's layout are suppressed in both styles (`Indentation`,
`CommentsIndentation`, `WhitespaceAround`, `WhitespaceAfter`, `GenericWhitespace`, `MethodParamPad`,
`ParenPad`, `NoWhitespaceBefore`, `OperatorWrap`, `SeparatorWrap`, `NoLineWrap`, `CustomImportOrder`,
`EmptyLineSeparator`, `LeftCurly`, `RightCurly`, `AnnotationLocation`, `FileTabCharacter` and the
empty-block spacing regex), in `languages/java/gradle/checkstyle-suppressions.xml`. Checkstyle keeps
everything that is not layout: naming, `NeedBraces`, `AvoidStarImport`, empty catch blocks, the
Javadoc rules, `OneStatementPerLine` and the rest. Checkstyle's `LineLength` is suppressed too: the
line-length rule above replaces it. A project's own
Checkstyle config (`tools.checkstyle.precedence`) is layered over nitpicker's, and these suppressions apply to the
merged config as well: the formatter and the line-length rule own layout and line length, so a project's settings
for those checks change nothing.

With no formatter (`none`), nothing else reports the layout and the unused imports that
google-java-format used to remove, so the Gradle and Maven runs use
`languages/java/gradle/checkstyle-suppressions-unformatted.xml`, which suppresses only the layout
checks the formatters disagree on or that depend on a house style (`CommentsIndentation`,
`OperatorWrap`, `SeparatorWrap`, `NoLineWrap`, `CustomImportOrder`, `EmptyLineSeparator`,
`AnnotationLocation`, the empty-block spacing regex), `LineLength` and, by id, `LeftCurlyNl` (it asks
for the brace of `case X: {` on its own line, which neither formatter does). The checks both
formatters agree on stay on: `WhitespaceAround`, `WhitespaceAfter`, `GenericWhitespace`,
`MethodParamPad`, `ParenPad`, `NoWhitespaceBefore`, `LeftCurlyEol` (the other `LeftCurly`) and
`RightCurly`, `FileTabCharacter`, and
`Indentation` at the measured width (2 by default; at 4 the `basicOffset`, `caseIndent` and
`arrayInitIndent` of the bundled check become 4; for tab-indented files `Indentation` and
`FileTabCharacter` are removed). Checkstyle's `UnusedImports` is added to the bundled checks, so an
unused import is still a finding; Error Prone's `RemoveUnusedImports` stays off and PMD has no
unused-import rule in the ruleset. The init script (`nitpicker.init.gradle`, reading
`-Pnitpicker.java.style` and `-Pnitpicker.java.indentation`) and `unformatted-checks.mjs` (Maven)
make the same edits, and these findings say to fix the layout by hand. The Java sources of a
kotlin-preset project get the same checks.

The style reaches Gradle as the command-line property `-Pnitpicker.java.style=aosp`, never through
`gradle.properties`. The runner reads the convention from the head policy file at run time, like the
other policy values, so it is not part of the analyzer's configuration hash; the base run gets the
same policy file, so a change of style in the same pull request does not fail the files it makes
differ. The Maven run resolves only the formatter jar its style needs (google-java-format, or
palantir-java-format, or neither for `none`).

## Coupling and stability (ticket SH6)

- **What runs.** The init script's `nitpickerJdeps` task (a dependency of `nitpickerJava`) runs the
  JDK's `jdeps -verbose:class -filter:none` once over the main and test class directories and
  splits the edges by the side that declares the source class: `jdeps.txt` in the report directory
  (main classes), `jdeps-classes.txt` (the main classes, one binary name per line) and
  `jdeps-test.txt` (test classes), which only the [test-only class check](#review-rules) reads. A
  test source set is one a `Test` task runs or one whose name contains `test` (`integrationTest`,
  `testFixtures`); the task compiles only those, so a `jmh` or `benchmark` source set is neither
  compiled for it nor counted as a test. Maven runs the same single jdeps call over
  `target/classes` and `target/test-classes` (`builds/jdeps-reports.mjs`). Neither build holds
  the jdeps output in memory: Gradle splits it line by line as jdeps writes it, Maven writes it to
  a file in the report directory and splits that in 1 MB chunks, so a module of any size works.
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
  invisible to jdeps. (5) Test classes and library classes are not part of the graph. (6) The `path` of a `stability-direction` finding is the package name (`stable`), not a file, so its `exceptions` entry names the package: `"paths": ["stable"]`; a glob over source directories never matches it.
- **Baselining.** Identities are `package-edge:<source>-><target>`, `package:<name>:<metric>` and
  `module:<metric>` with the file path, never a line, so an existing violation stays baselined and
  only a new package edge, or a new instability inversion, fails.
- **Tests.** `languages/java/adapters/metrics/java-coupling.test.mjs` (parsing, metrics, stability edges, the
  neutral report through the shared rule), `java-reports.test.mjs` (glue), and two gated e2e cases
  (a package depending on a less stable package fails; the same violation on the base stays
  baselined).

## Generated sources

Findings on generated sources are dropped (`generated/generated-sources.mjs`, applied to the Java
and Kotlin presets on Gradle and Maven alike), so a generated file needs no `exclude`. A source is
generated when its leading comments carry the header a known generator writes (the shared list in
`shared/conventions/generator-marker.mjs`: protoc, Wire, jOOQ, Avro, ANTLR, JAXB, OpenAPI
Generator, Swagger Codegen, Thrift, Android's `R` and `BuildConfig`, or `Code generated by <tool>.
DO NOT EDIT.`), when it carries an `@Generated` annotation naming a known annotation processor
(MapStruct, Dagger, AutoValue, Immutables, Querydsl, the gRPC Java plugin, the Hibernate
metamodel generator, OpenAPI and Swagger generators, jOOQ, Room, Micronaut), when it lies under
`build/generated/` (javac, kapt and KSP output), `target/generated-sources/`,
`target/generated-test-sources/` or a `delombok` folder of the build output, or when it lies in a
`generated/`, `generated-sources/` or `gen/` folder and its first five lines say `@generated` or
`DO NOT EDIT`. Lombok's `delombok` writes no header, so its output counts through the build
folder. A generic marker in a normally named file, an `@Generated` annotation with another value
and a header below the code exempt nothing; hand-written code carrying `@Generated` stays the
`pmd/GeneratedOnHandWrittenCode` finding. The evals harness fails a case whose agent wrote one of
these markers into a file it wrote by hand.

## Spring rules

A project whose compile classpath has `spring-context` or `spring-boot`, or whose build files
(`build.gradle(.kts)`, `*.versions.toml`, `pom.xml`, comments removed) name `org.springframework`,
gets nitpicker's
Spring ruleset, [`languages/java/gradle/spring-ruleset.xml`](../languages/java/gradle/spring-ruleset.xml),
added to its PMD run, next to nitpicker's rule set `pmd-ruleset.xml` (and the project's own `config/pmd/ruleset.xml` when
`tools.pmd.precedence` lists `"project"` too). Every
project's PMD run now gets the main and test compile classpaths and the main and test classes as
its auxiliary classpath (`pmd-aux-classpath.txt` in the report directory), so the rules match annotation and
supertype names exactly; `nitpickerPmd` therefore compiles the main and test classes first, and a
test compile error stops it. The manifest records `spring` and the
main `resourceRoots`. Whether the build files name Spring is read once from the head checkout and
handed to the base run through the head policy (`spring`, `-Pnitpicker.spring=true` for Gradle, the
Maven module analysis), so a change that adds Spring does not turn legacy violations into new
findings; a project that has Spring on the classpath only through a plugin keeps the per-snapshot
classpath detection.

Each rule allows one form and its message names it. A finding prints as `pmd/<rule>`, which is also
the `rule` of a config exception.

| Area          | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beans         | `SpringConstructorInjection`, `SpringImmutableBeans` (also static non-final fields), `SpringBeanCollectionState` (a `final` `HashMap`/`ArrayList`/`HashSet`/... field of a singleton bean written to after startup), `SpringNoServiceLocator` (not in an `ApplicationContextInitializer` or `EnvironmentPostProcessor`), `SpringNoLazyInjection`, `SpringLiteConfiguration`, `SpringNoComponentScan`, `SpringHttpClientPerCall` (a `RestTemplate`, `RestTemplateBuilder`, `RestClient`, `WebClient` or `HttpClient` built inside a method that is not a `@Bean`, a `static` factory or a private helper only they call), `SpringHttpClientTimeouts` (a client, request factory, `new RestTemplateBuilder()` or Reactor Netty `HttpClient` built without timeouts in a field, constructor, `@Bean`, `static` factory or such a helper), `SpringNoPostConstructIo` (repository, JDBC, `EntityManager` or HTTP calls in `@PostConstruct`, `InitializingBean.afterPropertiesSet()`, a `@Bean(initMethod = ...)` method, or a private helper only they call) |
| Configuration | `SpringTypedConfiguration` (no `@Value` outside `@Configuration`, no `System.getenv`/`getProperty` of application keys in any class except `@Configuration`, `@SpringBootApplication`, `EnvironmentPostProcessor`, `ApplicationContextInitializer` and `main`, no `Environment.getProperty` in beans), `SpringValueSecretDefault` (a non-empty default for a secret-named key in `@Value("${...secret:default}")`, `@DefaultValue`, a `@ConfigurationProperties` field initializer or `getProperty(key, default)`), `SpringProfileOnConfiguration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Proxies       | `SpringProxyMethodVisibility`, `SpringProxySelfCall` (both for `@Transactional`, `@Async`, the cache annotations, `@Retryable`, `@PreAuthorize`, `@PostAuthorize`, `@Secured`), `SpringTransactionalAnnotation`, `SpringNoTransactionalController`, `SpringNoRequiresNew`, `SpringNoSwallowedTransactionException` (also private helpers of a `@Transactional` class), `SpringTransactionalCheckedRollback` (a checked `throws` without `rollbackFor`), `SpringTransactionalReadOnlyWrite` (a repository or `EntityManager` write under `readOnly = true`), `SpringAsyncExecutor`, `SpringScheduledFixedDelay`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Web           | `SpringComposedMapping`, `SpringRestController`, `SpringValidRequestBody`, `SpringTypedResponse` (a handler returns `Object`, `JsonNode`, `Map<String, Object>`, `ResponseEntity<?>`, raw `ResponseEntity`, a list or `Optional` of those, or `null`), `SpringTypedRequestBody` (a `@RequestBody` that is an `Object`, `JsonNode`, `Map<String, Object>` or a list or `Optional` of those), `SpringNoErrorLeak` (the stack trace, or the message of a generic, JDK or persistence exception, reaching the response of an `@ExceptionHandler`), `SpringNoCrossOrigin`, `SpringCorsWildcard`, `SpringPasswordEncoder` (also the MD4, message-digest, LDAP SHA and SHA-256 encoders and `User.withDefaultPasswordEncoder()`), `SpringPermitAllAnyRequest`, `SpringCsrfDisabled`, `SpringHardcodedUser`                                                                                                                                                                                                                                                     |
| JPA           | `JpaLazyFetching`, `JpaEntityClass`, `JpaManyToManyCascade`, `JpaManyToManySet`, `JpaVersion`, `JpaSequenceIds`, `JpaEnumString` (an enum field or `@ElementCollection` of enums without `@Enumerated(EnumType.STRING)`, or enum map keys without `@MapKeyEnumerated(EnumType.STRING)`), `JpaIdentityHashCode` (`hashCode` reading the `@GeneratedValue` id, or Lombok `@Data`/`@EqualsAndHashCode` without arguments on an entity)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Spring Data   | `SpringDataDerivedQuery` (every declared repository method has `@Query`; inherited methods such as `findById` and `save` stay legal), `SpringDataNativeQuery` (also `EntityManager.createNativeQuery`), `SpringDataModifyingQuery`, `SpringDataNoSaveInLoop`, `SpringDataBatchOfOne`, `SpringDataRowWriteInLoop`, `SpringDataSaveInLoopHelper`, `SpringDataFilterInQuery`, `SpringQueryConcatenation`, `SpringDataNoFlush`, `SpringDataNamedParameters`, `SpringDataQueryTextBlock`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Tests         | `SpringUnusedContext` (test sources only, from `spring-test-ruleset.xml`; see [Review rules](#review-rules))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Kotlin.** PMD reads Java sources only, so every rule in this table checks the Java files of a
project, on Gradle and Maven alike. In a kotlin-preset project every rule of the table except
`SpringQueryConcatenation` (covered there by `kotlin-source/SqlStringBuilding`) also runs on the main
Kotlin sources, under the same ids and exception route, from the Kotlin syntax facts (see
[Kotlin preset: Spring rules](kotlin-preset.md#spring-rules)). Kotlin classes of a Java-preset project (a mixed module)
get none of these rules. The Spring configuration file checks
([below](#spring-configuration-files)) do not depend on the language and apply to Kotlin projects
too, and `missing-enable` scans the Kotlin sources.

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
`checkstyle-test.xml`), Error Prone, google-java-format and the inline suppression scan cover
`src/test/java` and every other test source set (`integrationTest`, `testFixtures`; on Maven the
test roots, `build-helper-maven-plugin` `add-test-source` ones included) as well as the main
sources, with the test rules, the way the TypeScript preset lints its tests; the
file and folder limits already counted test files. A `jmh` or `benchmark` source set is neither main nor test code: nitpicker
neither compiles nor lints it on Gradle, as Maven ignores a source folder build-helper does not add. PMD runs nitpicker's own rule set,
[`languages/java/gradle/pmd-ruleset.xml`](../languages/java/gradle/pmd-ruleset.xml): the
errorprone, bestpractices, performance and multithreading categories (security runs on main sources
only; the rules each category leaves out are listed under "Additional PMD categories" in [Slice 2](#slice-2-cli-and-reporter-integration)) without
`UnitTestAssertionsShouldIncludeMessage` and `UnitTestContainsTooManyAsserts`, which set an
assertion style the TypeScript preset does not have,
plus design's `AvoidCatchingGenericException` (no `catch (Exception e)`, `RuntimeException` or
`NullPointerException`; errorprone already covers `Throwable`), as the TypeScript and Python presets
forbid broad catches (the message says that a test uses `assertThrows`, as Checkstyle's `EmptyCatchBlock` message does). A test with no assertion still fails (`UnitTestShouldIncludeAssert`, which
also counts MockMvc's `andExpect` and `andExpectAll`, BDDMockito's `then(...).should()`,
`WebTestClient`'s `expectStatus`/`expectBody`/`expectHeader` and `StepVerifier`'s `expectNext`,
`verifyComplete` and friends), and a class in test sources named like a test but without test
methods fails (`TestClassWithoutTestCases`), except `*ArchTest` and `*ArchitectureTest` classes,
which hold ArchUnit rules. The rules that only make sense in tests live in
[`pmd-test-ruleset.xml`](../languages/java/gradle/pmd-test-ruleset.xml) (and, for a Spring project,
[`spring-test-ruleset.xml`](../languages/java/gradle/spring-test-ruleset.xml)); the init script and
the Maven side wrap them in `pmd-tests.xml` in the report directory, which excludes the main source
directories, so a main class such as `TestDataGenerator` is not a test (see
[Review rules](#review-rules)). The Spring rule set reads main sources only: the init script and the Maven side wrap it, with
`pmd-main-ruleset.xml`, in `pmd-main.xml` in the report directory with an exclude pattern per test
source directory, since field injection and package-private test methods are the norm in tests. A PMD rule that flags
legitimate test code, such as `SystemPrintln` in a test of console output, or `CloseResource` on a
`PrintStream` handed to `System.setOut`, takes an exception like any other: `{ "rule": "pmd/<rule>", "paths": [...],
"reason": "..." }`. PMD messages that name a line ("first occurrence is on line 12") lose the number
in the finding's identity, so moving code does not re-report them. SpotBugs, the structure limits
and CRAP stay on main code, as in the TypeScript preset.

**Exceptions.** Every Spring message except `SpringDataNativeQuery` ends with the exception to add
when the code is right, for example `{ "rule": "pmd/SpringDataNoSaveInLoop", "paths": [...],
"reason": "..." }`.

**How the web, security, data and transaction rules decide.**

- `SpringTypedResponse` and `SpringTypedRequestBody` look at methods annotated with a mapping
  annotation (`@GetMapping`, ..., `@RequestMapping`) or `@ExceptionHandler`. A `return null;` in the
  handler itself counts; a lambda inside it does not. Untyped means `Object`, `JsonNode` (and
  `ObjectNode`), a raw `Map` or one whose value type is `Object` or `?`, a raw `ResponseEntity`,
  and any of those inside a `List`, `Optional`, `ResponseEntity`, `Map` value, `CompletionStage` or
  reactive `Publisher`, two levels deep (`List<Map<String, Object>>`, `Mono<ResponseEntity<?>>`).
  `Map<String, String>`, `Map<String, ? extends Number>`, `MultiValueMap<String, String>` form
  posts, `Optional<T>`, `List<T>`, `ResponseEntity<Void>` and `ResponseEntity<T>` are fine.
- `SpringCorsWildcard` fires on a `"*"` origin (`setAllowedOrigins`, `addAllowedOrigin`, the
  pattern forms and the registry's `allowedOrigins`) only when the same method also allows
  credentials (`true` or `Boolean.TRUE`), and on a `@CrossOrigin` with origin `"*"` and
  `allowCredentials = "true"`. A filter chain is identified by the variable at the start of its call chain (`http`).
  `SpringCsrfDisabled` (`csrf(...disable())`, `csrf(AbstractHttpConfigurer::disable)`,
  `csrf().disable()`, `csrf(ServerHttpSecurity.CsrfSpec::disable)`) accepts a chain that also sets
  `SessionCreationPolicy.STATELESS` or a `NullSecurityContextRepository` (servlet), or
  `securityContextRepository(NoOpServerSecurityContextRepository.getInstance())` (WebFlux), and an
  OAuth2 resource server chain (`oauth2ResourceServer(o -> o.jwt(...))` or `opaqueToken`) whose
  `formLogin`, `httpBasic`, `rememberMe` and login flows are absent or disabled
  (`formLogin(AbstractHttpConfigurer::disable)`, `httpBasic(b -> b.disable())`,
  `formLogin().disable()`). `SpringPermitAllAnyRequest` fires on `anyRequest().permitAll()`,
  `anyExchange().permitAll()` and `requestMatchers("/**").permitAll()` or
  `pathMatchers("/**").permitAll()` unless the chain is scoped by `securityMatcher(...)` or the
  matcher names an `HttpMethod` (the `OPTIONS` preflight case), and on
  `web.ignoring().requestMatchers("/**")`. `SpringHardcodedUser` fires on
  `.password("literal")`, `.password(encoder.encode("literal"))` or a local variable or field
  initialized with a literal, on a `User` builder or an `inMemoryAuthentication()` user.
- `SpringQueryConcatenation` checks the first argument of `EntityManager.createQuery` and
  `createNativeQuery`, of the `JdbcTemplate` and `NamedParameterJdbcTemplate` query and update
  methods, and of `JdbcClient.sql`. It fires on `+` with a non-constant operand (a variable, a
  call; `UPPER_CASE` names count as constants), `String.format`, `formatted`, `concat`, `replace`,
  `String.join` and `MessageFormat.format` with a non-constant argument, a `StringBuilder` (inline
  or in a variable) that has a non-constant `append`, and a local variable initialized, reassigned
  (`sql = sql + name`) or extended with one of those. Constant pieces pass: literals, `UPPER_CASE`
  constants, a ternary between two literals (`desc ? "desc" : "asc"`), `String.format` with only
  literal arguments, the placeholder list `String.join(",", Collections.nCopies(n, "?"))`, and a
  local variable that holds only such pieces and is never reassigned. A text block, a constant,
  and values passed as bind parameters are the allowed form; for a list of values,
  `NamedParameterJdbcTemplate` or `JdbcClient` with `in (:ids)`. `EntityManager.createNativeQuery` also falls under `SpringDataNativeQuery`:
  the method needs the same `@SuppressWarnings("PMD.SpringDataNativeQuery")` marker.
- Per-row writes. `SpringDataNoSaveInLoop` (direct `save`, `delete`, `persist`, ... in a loop)
  also covers `forEachRemaining(repository::save)` and a `Consumer` variable holding
  `repository::save` that a loop calls or a `forEach` receives. `SpringDataBatchOfOne` fires on
  `saveAll`/`deleteAll`/`deleteAllById` called in a loop with a one-element `List.of`, `Set.of`,
  `Collections.singletonList` or `singleton`, inline or through a variable declared in the loop.
  `SpringDataRowWriteInLoop` fires, in a loop, on any other repository call whose result is
  discarded (a `@Modifying` update, a `deleteBy...`), on a call whose name starts with a write verb
  (`update`, `delete`, `remove`, `mark`, `set`, `rename`, `insert`, `upsert`, `increment`,
  `decrement`, `reset`, `clear`, `purge`, `archive`, `touch`) even when its result is used
  (`count += repository.markSold(id)`), on `Query.executeUpdate()` and on
  `forEach(repository::method)`. It never fires on read names (`find`, `get`, `read`, `count`,
  `exists`, `query`, `stream`, `search`, `load`, `fetch`, `list`, `is`, `has`) or on a call that
  receives a collection (a chunk of ids is already set-based); the `saveAll`/`deleteAll` family
  and `flush` are left to the other rules. `SpringDataSaveInLoopHelper` follows one level: a loop
  (or a `forEach`, `map` or `peek` callback on a stream, `Iterable`, `Iterator` or `Map`) that calls
  `store(x)` or `this::store` of the same class, where `store` saves or deletes through a
  repository or `EntityManager`. A per-row `try`/`catch` around the call still counts: per-row
  error handling is done with `saveAll` per batch and error handling per batch, or an exception
  for the import. All of them skip a loop that also calls `EntityManager.clear()`.
- `SpringDataFilterInQuery` fires on `repository.findAll()` without arguments followed by
  `.stream().filter/count/anyMatch/...`, `.size()` or `.isEmpty()`.
- `SpringTransactionalCheckedRollback` reports the `throws` clause of a `@Transactional` method
  (or a public method of a `@Transactional` class) that names a checked exception, unless the
  annotation has `rollbackFor` or `readOnly = true`. `SpringTransactionalReadOnlyWrite` reports a
  repository or `EntityManager` write (a call or a method reference such as `forEach(repo::save)`,
  and repository methods named with a write verb, as above) in a method under `readOnly = true`,
  set on the method or inherited from the class; any `@Transactional` on the method, the jakarta
  one included, overrides the class. `SpringProxySelfCall` also reports `this::method` references.
  `SpringNoSwallowedTransactionException` also covers a private or package-private helper of a
  `@Transactional` class, and a helper that a `@Transactional` method of the same class calls.
- `SpringImmutableBeans` now includes `static` non-final fields. `SpringBeanCollectionState` needs
  both a plain collection and a write to it after startup. Writes in the constructor, an
  initializer block, a `@PostConstruct` method, `InitializingBean.afterPropertiesSet()`,
  `SmartInitializingSingleton.afterSingletonsInstantiated()`, a method that a `@Bean(initMethod = ...)`
  in the same file names, or a private helper (two levels deep, also through
  `this::register`) that only those call are startup and accepted; so are writes inside
  `synchronized` blocks or methods and in methods that take a `Lock`, and beans with
  `@RequestScope`, `@SessionScope` or a `@Scope` other than `singleton`. A write through a local
  variable or parameter that shadows the field's name is not a write to the field. The allowed form is a
  collection filled in the constructor and kept as `Map.copyOf`/`List.copyOf`, a
  `ConcurrentHashMap`, or a cache. `SpringHttpClientPerCall` accepts a client built in a field
  initializer, a constructor, a `@Bean` method, a private helper (two levels deep) that only those
  call, or returned from a `static` factory method; it also reports `new RestTemplateBuilder()` in
  any other method. `SpringHttpClientTimeouts` checks those places and reports
  `new RestTemplateBuilder()` whose chain has no `connectTimeout`, `readTimeout` (or their `set`
  forms), `requestFactory`, `requestFactorySettings` or `requestFactoryBuilder`, a Reactor Netty
  `HttpClient.create()` without `responseTimeout` in its chain or on its variable, a no-argument
  `ReactorClientHttpConnector`, `new RestTemplate()` without a later
  `setRequestFactory(...)`, `RestClient.create(...)`/`WebClient.create(...)` (except
  `RestClient.create(restTemplate)`, which keeps the template's factory), `HttpClient.newHttpClient()`,
  a `RestClient.builder()`, `WebClient.builder()` or `HttpClient.newBuilder()` whose call chain has
  no `requestFactory`, `clientConnector` or `connectTimeout`, and a `SimpleClientHttpRequestFactory`
  or `HttpComponentsClientHttpRequestFactory` whose variable never gets a timeout setter.
- `SpringNoErrorLeak` fires for `getStackTrace()` and, for an `Exception`, `RuntimeException`,
  `Throwable`, `IllegalArgumentException`, `IllegalStateException`, `NullPointerException`,
  `IOException`, `UncheckedIOException`, `DataAccessException`, `TransactionException`,
  `PersistenceException` or `SQLException` parameter, for its (or its cause's) `getMessage()`,
  `getLocalizedMessage()` and `toString()`, `"" + ex`, `String.valueOf(ex)` and formatting it. A
  value that only reaches a logger call passes, also through a local variable
  (`String message = ex.getMessage(); log.error("{}", message, ex);`). Handlers for your own
  exception types are not judged: their message is meant for the client.
- `JpaEnumString` also reads `@ElementCollection` fields: the element type of a collection and
  the value type of a map need `@Enumerated(EnumType.STRING)`, an enum map key
  `@MapKeyEnumerated(EnumType.STRING)`. It skips static and transient fields, `@Transient`, `@Convert` and Hibernate type
  annotations, entities that put `@Id` on a getter, and enums that an `@Converter(autoApply =
true)` class in the same file converts. `JpaIdentityHashCode` reports the first read of a
  `@GeneratedValue` field (or its `getX()` getter) inside `hashCode`. Without a hand-written
  `hashCode`, Lombok counts too: `@Data` or `@Value` without `@EqualsAndHashCode`, and
  `@EqualsAndHashCode` over all fields (no arguments, or only `callSuper`), with `of` naming the
  id, or with `onlyExplicitlyIncluded = true` and `@EqualsAndHashCode.Include` on the id.
- `SpringTypedConfiguration` allows JVM properties (`java.`, `user.`, `os.`, `file.`, `line.`,
  `path.`, `javax.`, `jdk.`, `sun.`, `com.sun.`, `http.`, `https.`, `ftp.`, `socks...`) and the whole
  `System.getenv()` map, unless it is read by key (`System.getenv().get("X")`). It covers every
  class, plain helpers included, because a helper is the easy way around it; the allowed form there
  is to read the value once through `@ConfigurationProperties` and pass it in as a constructor or
  method argument. `SpringValueSecretDefault` uses the secret words of the config files'
  `literal-secret` check (see [Literal secrets](#spring-configuration-files)): the last key segment,
  split into words, ends in `password`, `passwd`, `passphrase`, `secret`, `token`, `credential(s)`
  or a named key (`api-key`, `apiKey`, `signing-key`, `access-key`, ...), or is a bare `key` under an
  owner word (`app.api.key`, `jwt.key`), so `routing-key`, `partitionKey` and `app.sort.key` are
  not secrets. Any non-empty
  default fires except a nested placeholder or SpEL (`${a:${B}}`, `#{...}`), so
  `${app.token:changeme}` fires and `${auth.token-ttl:3600}` does not. It also covers a non-empty
  `@DefaultValue` on a secret-named `@ConfigurationProperties` component and
  `environment.getProperty("app.client-secret", "changeme")`, and a literal initializer of a
  non-static field of a `@ConfigurationProperties` class whose prefix plus field name is
  secret-named (`@ConfigurationProperties("auth")` with `String secret = "dev-secret"`).
  `SpringNoPostConstructIo` reports the call in a `@PostConstruct` method, in
  `InitializingBean.afterPropertiesSet()`, in a method that a `@Bean(initMethod = ...)` in the same
  file names, and in a private helper (two levels deep) that only those call.
  `SmartInitializingSingleton.afterSingletonsInstantiated()` runs once every singleton is ready, so
  I/O there is accepted. `SpringNoServiceLocator` skips an `ApplicationContextInitializer` or
  `EnvironmentPostProcessor`, which runs before the context exists and has no injection.

**Limits.** `JpaVersion` checks each `@Entity` or `@MappedSuperclass` that declares the `@Id`,
and each entity without a superclass, so the `@Version` field belongs next to the `@Id`. A finding
is dropped when a superclass found in the project's sources declares `@Version`; a superclass from
a library counts as having none. `AbstractClassWithoutAbstractMethod` skips `@MappedSuperclass`
classes, which are abstract to stop instantiation. The JPA and Spring rules match each `jakarta.*` type and its `javax.*` twin, so Spring Boot 2
code gets them too. `SpringDataDerivedQuery` leaves redeclared CRUD methods alone (`findById`, `findAll`, `save`,
`deleteById` and the rest of `ListCrudRepository`, `ListPagingAndSortingRepository`,
`JpaRepository` and `QueryByExampleExecutor`), since Spring implements those without parsing the
name, and accepts the `@Query` of the JDBC, R2DBC, MongoDB, Neo4j, Cassandra, Couchbase and
Elasticsearch modules; the other Spring Data rules know only the JPA annotations. Proxy annotations
on interface methods are accepted, because Spring reads them for both proxy kinds.
`SpringProxySelfCall` matches by name and argument count (a varargs method takes its fixed
arguments or more), and skips a call from one `@Transactional`
method to another with a plain `@Transactional` (same transaction) and matches a `this::name` reference by name. `SpringDataNoSaveInLoop` covers
`for`, `while` and `do` loops and `forEach`, `map` and `peek` callbacks on a stream, an `Iterable`
or a `Map`, lambdas and method references (`forEach(repository::save)`) alike; `Optional.map` and
`ifPresent` run at most once and are not loops. It and `SpringDataNoFlush` skip a loop that also
calls `EntityManager.clear()`, the JPA batch idiom.
`SpringNoSwallowedTransactionException` reports catching `Exception`, `RuntimeException`,
`Throwable`, `DataAccessException`, `TransactionException` or `PersistenceException`, not narrower
exceptions such as `NumberFormatException`. `SpringQueryConcatenation` does not follow SQL that
comes from a helper method, a parameter or a field. `SpringDataSaveInLoopHelper` follows one helper
level (matched by name and argument count, varargs-aware), and `SpringNoPostConstructIo` follows private helpers two levels deep.
`JpaEnumString` sees an `autoApply` converter only in the same file; an enum converted by a
converter in another file needs an exception. `SpringPermitAllAnyRequest` does not resolve a
pattern held in a variable (`var all = "/**"`) or an `access(...)` that allows everyone.
`SpringCsrfDisabled` and `SpringPermitAllAnyRequest` match a chain by the name of its starting
variable within one method. Layering, entities in controller signatures and test placement need a
cross-class view, which PMD does not have; they are nitpicker's own ArchUnit rules, described next.

**Tests.** `spring/java-spring.e2e.test.mjs` (gated like the other Java e2e tests and part of
`npm run test:java`) runs PMD through the init script on `adapters/fixtures/spring-project`, whose
sources mark every expected violation with a `// violation: <rule>` comment, and asserts the
reported set equals the marked set. The fixture also holds the legitimate forms each rule must
accept. It also runs Error Prone on the fixture and asserts its `FieldCanBeFinal`,
`PrivateConstructorForUtilityClass` and `MissingOverride` findings: `MissingOverride` in
`ProductRepository` and the one plain utility class, but no `FieldCanBeFinal` in the JPA entities
and no `PrivateConstructorForUtilityClass` on the application or configuration classes. The other
Error Prone checks fire on the deliberate violations the Spring rule examples hold.

## Spring architecture rules

Spring projects (same detection as the Spring ruleset: `spring-context` or `spring-boot` on the
compile classpath, `spring: true` in the manifest) also get nitpicker's own ArchUnit rules, and so
does a module with `jmolecules-ddd` on its main compile classpath (for the aggregate rules below). They are
separate from the project's own `*ArchTest` classes of slice 4 and need nothing from the project:
the init script's `nitpickerSpringArch` task resolves ArchUnit 1.5.1 (Apache-2.0, pinned in the
`pinned` map) into its own configuration, compiles the rule classes in
[`languages/java/gradle/archunit/`](../languages/java/gradle/archunit/) with the JDK that runs Gradle
and runs them once, in one separate JVM, over the compiled main and test classes. That is one extra
JVM per side (base and head), a few seconds. The compiled rule classes are cached in the Gradle
user home (`caches/nitpicker/spring-arch/<hash>`, keyed by the rule sources, the ArchUnit version
and the JDK), so `javac` runs only the first time. The report is `build/nitpicker/spring-arch.json`
(format in [internals.md](internals.md)); the manifest then says `springArch: true`, and a
manifest that says so without the report is a tool error. Maven builds run these rules too (see
[Maven builds](#maven-builds)) and write the report to `target/nitpicker/spring-arch.json`.

Findings print as `archunit/<rule>`, one per rule, offending class and dependency, on the class's
source file (a nested class counts as its outermost class). The identity is the simple class name
plus the simple name of the dependency or method involved, never a package or a line: a second bad
dependency in an already violating class is new, while moving code, or moving the file to another
package (the move `spring-layout` asks for, tracked as a rename), keeps its legacy findings matched. Every message leads with the allowed form and ends with the
shared exception sentence: add `{ "rule": "archunit/<rule>", "paths": ["<file>"], "reason": "..." }` to
`exceptions` in `nitpicker.config.json`. Repeats of one identity are numbered `#n` per file, so a
same-named class in another package never shifts them.

**Layout: package by feature, as in the TypeScript preset.** The root package is the package of the
`@SpringBootApplication` class (the common prefix when there are several; without one the layout
rules are skipped and the rest still runs). Its direct sub-packages are features, plus `shared` for
pure utilities. Every root sub-package that is not `shared` and not a layer name counts as a
feature, including technical ones such as `config` or `security`: their sub-packages are internal
to them. Layer names cover the layered and the hexagonal (ports and adapters) layouts, so such an
app gets one `spring-layout` finding per class, naming the feature package to use, and no
`spring-feature-boundary` finding for its normal port edges. The layout mirrors the TypeScript one: `features/<f>/` with an `index.ts` becomes
`<root>.<feature>` whose top-level classes are the feature's public face, and `shared` is the
TypeScript `shared/` folder.

| Rule                      | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spring-layout`           | a class sits directly in the root package (only `@SpringBootApplication`, `@Configuration` and `@ConfigurationProperties` classes and a `SpringBootServletInitializer` subclass may), or in a root sub-package named by layer: `controller(s)`, `service(s)`, `repository`/`repositories`, `entity`/`entities`, `model(s)`, `dto(s)`, `dao(s)`, `util(s)`, `common`, `web`, `api`, `rest`, `resource(s)`, `persistence`, `domain`, `mapper(s)`, `exception(s)`, `adapter(s)`, `application`, `infrastructure`, `infra`, `port(s)`, `usecase(s)`, `helper(s)` |
| `spring-feature-boundary` | a class uses a class from a sub-package of another root package (`orders.internal.X` from `billing`); the classes directly in the other package are fine                                                                                                                                                                                                                                                                                                                                                                                                     |
| `spring-shared-pure`      | a `shared` class is a Spring bean (`@Component` and its stereotypes, `@Configuration`) or an `@Entity`, or depends on a class in any other root package                                                                                                                                                                                                                                                                                                                                                                                                      |

**Layering.**

| Rule                           | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring-controller-repository` | a `@Controller` or `@RestController` depends on a repository (`@Repository`, or a type extending Spring Data's `Repository`) or on data access directly (`JdbcTemplate`, `NamedParameterJdbcTemplate`, `JdbcClient`, `SimpleJdbcInsert`, R2DBC `DatabaseClient`, `JdbcAggregateTemplate`, `R2dbcEntityTemplate`, `MongoTemplate`, `EntityManager`, `EntityManagerFactory`, Hibernate `Session`, `DataSource`, or their interfaces), in a field, parameter, return type or call                                                                                                                                                                                                          |
| `spring-controller-entity`     | a request-mapping or `@ModelAttribute` method of a controller takes or returns an `@Entity` type, also inside a generic such as `List<Customer>`; methods declared on implemented interfaces (the OpenAPI-generator layout) and inherited from base controllers count                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `spring-service-web`           | a `@Service` or repository depends on the web layer: a controller or `@ControllerAdvice`, `ResponseEntity` in its own field, method or constructor signatures (not a `RestTemplate` or `RestClient` result it unwraps), or the `jakarta.servlet`, `javax.servlet`, `org.springframework.web.bind`, `org.springframework.web.servlet`, `org.springframework.web.multipart`, `org.springframework.web.context.request` (`RequestContextHolder`, `WebRequest`), `org.springframework.web.server` (`ServerWebExchange`, `ResponseStatusException`), `org.springframework.web.reactive` or `org.springframework.http.server` packages, so servlet and WebFlux apps are held to the same rule |
| `spring-controller-controller` | a controller holds or creates another controller: a field, constructor or method parameter of that type, also inside a generic, or `new OtherController()`. Naming another controller's class in a link (`methodOn(OrderController.class)`, a `Class<OrderController>`) is fine                                                                                                                                                                                                                                                                                                                                                                                                         |
| `spring-repository-service`    | a repository depends on a `@Service`: a field, parameter, return type or call. A repository depending on a controller or the web layer is `spring-service-web`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Roles come from Spring's stereotypes, read through composed annotations (`@RestController`, a
project's own annotation carrying `@Service`). A project whose classes carry other role markers maps
them with the `spring.roles` config key: `{ "spring": { "roles": { "service": ["com.example.UseCase"] } } }`
gives every class annotated with `@UseCase` (directly or through a composed annotation), or extending
or implementing `com.example.UseCase`, the service role on top of its stereotypes. Keys are
`controller`, `service` and `repository`; names are binary class names, so a nested type is
`com.example.Roles$UseCase`. A repository is also any `@RepositoryDefinition` interface. A mapping
only adds roles, so it never lifts a finding; a small application that keeps a controller calling a
repository on purpose uses an exception. When a layering rule and `spring-feature-boundary` both
report the same class and dependency (a controller using `orders.internal.OrderRepository` from
`billing`), only the layering finding is shown, unless an exception lifts it, in which case the
boundary finding is still reported.

**Bean lifetimes.**

| Rule                   | Fails when                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spring-scope-capture` | a singleton bean (a `@Component` class or a `@Bean` method without `@Scope`, or with `singleton` or `application` scope) takes a request-, session-, `websocket`-, Spring Batch `step`- or `job`-scoped bean without a scoped proxy: in a constructor or `@Bean` method parameter, an `@Autowired`, `@Inject` or `@Resource` field or method, also as `Optional<T>`, an array or a collection or map of them |
| `spring-request-state` | request data reaches a field of a singleton bean or a static field outside set-up: assigned, written into an array element, or passed to a collection, map, `Map.Entry` or `AtomicReference` mutator (`add`, `put`, `computeIfAbsent`, `set`, ...)                                                                                                                                                           |

The scope is read from `@Scope` on the class or `@Bean` method, directly or through a composed
annotation such as `@RequestScope` (whose own `ScopedProxyMode` attribute, `TARGET_CLASS` by
default, wins over the `@Scope` it carries). A scoped proxy (`proxyMode` `TARGET_CLASS` or
`INTERFACES`, or that default set with `@ComponentScan` or `@ComponentScans`), an
`ObjectProvider<T>`, `ObjectFactory<T>` or `Provider<T>`, and a `@Lazy` injection point are fine:
each resolves the bean per use. `@Lazy(false)` is not lazy, and `@Lazy` on a method covers its
parameters only on a constructor or a `void` method, as in Spring (on a `@Bean` method it only
delays the bean). A component is injected through the constructor Spring picks: its only
constructor, or the one marked `@Autowired` or `@Inject`. A finding on a `@Bean` method names the
method: `pricing:request:Basket` in the identity. The injected type is matched against every bean the module
declares; the rule claims only when all of them have such a scope. So a prototype bean (one
instance per injection point, often meant), a custom scope it cannot model (`@Scope("tenant")`,
`thread`), a type with no bean in the module (one from a library or registered in code) or a
`@ComponentScan(scopedProxy = ...)` default it cannot resolve to one mode is never a finding.

`spring-request-state` follows request data through the compiled code (bytecode dataflow with
[ASM](https://asm.ow2.io), BSD-3-Clause, added to the rule runner only). Request data is every
parameter of a handler method (`@RequestMapping` and its shortcuts, `@MessageMapping`,
`@SubscribeMapping`, `@SchemaMapping`, `@BatchMapping`, `@KafkaListener`, `@KafkaHandler`,
`@RabbitListener`, `@RabbitHandler`, `@JmsListener`, `@ModelAttribute`, `@InitBinder`,
`@ExceptionHandler`, also when the annotation sits on the interface or superclass method the handler
overrides, as in a generated `XApi` interface), any parameter annotated `@RequestParam`,
`@PathVariable`, `@RequestBody`, `@RequestHeader`, `@CookieValue`, `@RequestPart`,
`@MatrixVariable`, `@RequestAttribute`, `@SessionAttribute`, `@ModelAttribute`, `@Payload`,
`@Header(s)`, `@DestinationVariable` or `@Argument`, any parameter of a request type
(`ServletRequest`, `WebRequest`, `ServerHttpRequest`, `ServerWebExchange`, a functional
`ServerRequest`) and the result of `RequestContextHolder.getRequestAttributes()` /
`currentRequestAttributes()`, `SecurityContextHolder.getContext()` and
`ReactiveSecurityContextHolder.getContext()`, also through the project's own helpers that return it.
It follows the data through local variables, values derived from it, new objects, collections and
`StringBuilder`s built from it (library calls that fill a local object, `Collections.addAll`,
`System.arraycopy`, method references such as `list::add`), getters and identity helpers
(`Objects.requireNonNull`), calls into the project's own methods (across classes, through interfaces
to every implementation, to the class of an object the method created, and through lambdas and
method references the code runs or passes on), inner and anonymous classes writing their outer
class's fields, and helper objects a singleton holds, and reports the field where it ends up, once
per field, on the class that declares the shared field (a base class of a singleton, another
singleton reached through its getter), with the first handler parameter or source that reaches it:
`last:put:VisitController.create(visit)`, identity `VisitController|last`. Stores are writes to a
field, an array element or a collection, map (also `MultiValueMap`, `HttpHeaders`, `Properties`),
`Map.Entry`, `ListIterator`, `AtomicReference` or `StringBuilder` mutator.

Constructors, static initializers, `@PostConstruct`, `afterPropertiesSet`, `@Bean` methods and
injection methods (`@Autowired`, `@Inject`, `@Resource`) are set-up and never report, and neither
does an injected field (a Kotlin `@Autowired lateinit var` set through its setter). Also fine: a
local collection, a counter that only counts (`AtomicLong.incrementAndGet()`), a cache call
(`Cache.put`, `@Cacheable`), a `ThreadLocal`, a field of a primitive, boxed or enum type (a flag or a
running total), a field whose type only a per-use bean (`@RequestScope`, prototype, also declared
with `@Bean`) can fill, inherited fields included, a field of a request-scoped bean, a new instance
of a bean class that a handler builds and uses locally, and an element a predicate (`filter`,
`anyMatch`, ...) only compared with request data. A Kotlin `suspend` handler's `Continuation`
parameter is not request data, and locals the coroutine state machine saves keep their own data.
Shared classes are the classes `spring-scope-capture` treats as singletons, the types a singleton
`@Bean` method returns and the project classes it constructs (for a project return type also its
subclasses that are not components themselves), classes named in `@Import`, `@WebFilter`,
`@WebServlet` and `@WebListener` classes, enums, Kotlin `object`s, and every superclass of these.
A registry keyed by request data (in-flight keys, per-key locks, pending replies, an unbounded memo
map) is reported: bound it with a cache that has a size and an expiry, or add an exception that
names why its entries are removed. The analysis reads one module's classes: a call into another
module of a multi-module build or into a library is not followed.

**Aggregates (jMolecules).** A project that declares its domain model with
[jMolecules](https://github.com/xmolecules/jmolecules) (`org.jmolecules:jmolecules-ddd`, Apache-2.0,
read from the project's own classes; nitpicker adds no dependency) gets its aggregate boundaries
checked. A module with `jmolecules-ddd` on its main compile classpath runs these rules even without
Spring; without `spring-context` on the classpath they are the only rules of this section that run. Membership comes only from
what the code declares, never from class names: an aggregate root implements `AggregateRoot<T, ID>`
or carries `@AggregateRoot`; an entity implementing `Entity<A, ID>` belongs to `A` (also through a
generic base class such as `BaseEntity<Order, LineId>`); an entity carrying `@Entity` (jMolecules')
belongs to every root that reaches it through its fields; a value object implements `ValueObject`
or carries `@ValueObject`. Fields are read with their generic arguments (`List<LineItem>`,
`Map<String, Set<Cart>>`, `? super` bounds, generic arrays, and a type variable as the subclass binds
it), inherited ones included (a field declared in a superclass that is itself a root, entity or value
object is reported there, once), and an `Association<T, ID>` or a field annotated `@Association` is a
reference by identifier, so its type arguments do not count; nor do those of `Class<T>` and the
`java.util.function` types. Abstract classes and interfaces count: an entity typed
`Entity<Shape, ...>` with an interface root `Shape` belongs to every root implementing it.

| Rule                         | Fails when                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ddd-aggregate-reference`    | a root or entity of one aggregate holds the root of another (`Customer customer` in `Order`); hold its identifier (`CustomerId`) or an `Association<Customer, CustomerId>`                                                    |
| `ddd-foreign-entity`         | a root or entity holds an entity that belongs to another aggregate (`List<CartLine>` in `Order` when `CartLine implements Entity<Cart, ...>`), or an `@Entity` that two roots reach (each root is reported, naming the other) |
| `ddd-value-object-reference` | a value object holds an aggregate root or an entity; hold its identifier                                                                                                                                                      |

A class referring to its own type (a root's `parent` of the same root type), a subclass or
supertype of it, or an entity holding its own root is not reported. The detail of `ddd-foreign-entity` is `<aggregate>:<entity>`, so its
identity is `Order|Cart:CartLine`.

**Tests that start a Spring context.** A concrete test class counts when it, an enclosing class or
one of its superclasses (`class X extends AbstractIntegrationTest`) is annotated, directly or
through a composed annotation, with `@SpringBootTest`, any slice test (`@DataJpaTest`, `@WebMvcTest`, ...; all carry
`@BootstrapWith`), `@ContextConfiguration`, `@SpringJUnitConfig`, `@Testcontainers`, or
`@ExtendWith(SpringExtension.class)`. Annotation types (a composed `@IntegrationTest`) and abstract
base classes are not tests themselves and are never placed.

| Rule                        | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring-test-placement`     | such a test is in the unit test source set (`test` on Gradle, the one test source directory on Maven) and is not an integration test by the shared rule of the [slow-test check](#slow-tests): a class named `*IT`, `*ITCase`, `*IntegrationTest(s)`, `*IntegrationSpec` or `*ISpec`, or a package with an `integration`, `it` or `e2e` segment. The message offers the forms that keep the package (an `*IT` name, an integration test source set), so a slice test of a package-private controller still compiles; plain unit tests live anywhere |
| `spring-no-dirties-context` | a test class or method has `@DirtiesContext`, anywhere                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`spring-no-dirties-context` reads every test source set, a separate one such as
`src/integrationTest/java` included; `spring-test-placement` reads only the unit one, since every
other test source set is an integration one. A test that sleeps is covered by the test-honesty rules for
Java, not here.

**Limits.** The rules read bytecode, so generated classes without a source file are skipped (no
finding can be placed), and a use of another package's compile-time constant (`static final` of a
primitive or `String`) is invisible, because `javac` inlines its value. Each Gradle project and Maven module that uses Spring or jMolecules is checked on its own,
over its main and test classes. Kotlin modules run the same rules on their compiled classes, and the
findings point at the `.kt` files; the file facade of top-level functions (`ShopApplicationKt`, with
`fun main`) next to the application or a `@Configuration` class in the root package is not a
`spring-layout` finding, as the class it sits beside is allowed there.

## Spring configuration files

Findings with tool `spring`, produced in Node from the project's `application.properties`,
`application.yml`, `application.yaml` and `application-<profile>.(properties|yml|yaml)`. No JVM and
no new dependency: `spring-config-parser.mjs` flattens properties and YAML (nested maps, dotted
keys, comments, quotes, single-line flow maps and sequences, multi-document files) to dotted keys
with their line, `spring-config-files.mjs` finds the files and their profiles, `spring-secrets.mjs`
decides what counts as a literal secret, and `java-spring.mjs` applies the rules (all in
`languages/java/adapters/spring/`); `config-rules/` holds the profile-dependent rules and
`wiring/spring-wiring.mjs` the `@Enable...` scan.

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
  has no `!`. Test profiles are `test`, a name starting with `test`, any name with a `test`, `tests`,
  `it` or `integration` word (words split on `-`, `_` and `.`, so `integration-test` and `ci-test`),
  and every profile the project's tests use that is not also configured for the main application.
  A profile counts as used by the tests when `application-<profile>.(properties|yml|yaml)` or a
  `spring.profiles.active` value sits under test resources (`src/test/resources`, the sibling
  `resources` of each test source root), or the profile is named by `@ActiveProfiles` or
  `spring.profiles.active=` in the test sources (`src/test/java`, `src/test/kotlin` or the manifest's
  `testSourceRoots`). A profile is not test-only when
  `application-<profile>.(properties|yml|yaml)` also exists in main resources, so `docker`, `k8s` or
  `qa` stay checked; a main-resources file for a profile is exempt only through a test word in its
  name. The set the tests use is measured on the merge base when the run has one, so a branch cannot exempt a profile
  by adding a test that activates it. Words are compared case-insensitively, trailing digits are
  dropped from each word (`prod2`, `stage1`), and a word that begins or ends with a production word
  followed or preceded by a two-letter region or a known word (`testprod`, `prodeu`) counts too, while
  `product`, `staged` and `livestock` do not. A name with a `prod`, `prd`, `production`, `live`,
  `preprod`, `staging`, `stage`, `stg` or `uat` word is never a test or local profile, whatever its
  other words (`prod-test`, `prod-dev`) and even when a test activates it. Local profiles are names
  with a `local`, `dev` or `development` word, so `local-dev` counts. A profile built from a constant
  (`@ActiveProfiles(Profiles.TEST)`) cannot be read; name it with a literal or add an exception for
  the rule.
- **True.** Wherever a rule needs `true`, Spring's spellings `true`, `on`, `yes` and `1` count, in
  any case.
- **Rules**, all enforceable. Each message ends with the exception line to add to
  `nitpicker.config.json`.

| Rule (`spring/<rule>`) | Fires on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Exempt profiles  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `open-in-view`         | JPA in the main sources (`jakarta.persistence` or `javax.persistence` import) and `spring.jpa.open-in-view` unset, or true                                                                                                                                                                                                                                                                                                                                                                          | test             |
| `ddl-auto`             | `spring.jpa.hibernate.ddl-auto` or `spring.jpa.properties.hibernate.hbm2ddl.auto` other than `none`/`validate`, or `spring.jpa.generate-ddl` true                                                                                                                                                                                                                                                                                                                                                   | test, local, dev |
| `risky-startup-flags`  | `spring.main.allow-circular-references`, `allow-bean-definition-overriding` or `lazy-initialization` true                                                                                                                                                                                                                                                                                                                                                                                           | test             |
| `actuator-exposure`    | `management.endpoints.web.exposure.include` containing `*` or a sensitive endpoint (below); `management.endpoints.access.default=unrestricted`; `management.endpoint.shutdown.access=unrestricted`; `management.endpoint.heapdump.access` `read-only` or `unrestricted`; `management.endpoint.shutdown.enabled` or `management.endpoints.enabled-by-default` true                                                                                                                                   | test, local, dev |
| `error-details`        | `server.error.include-stacktrace`, `include-message` or `include-binding-errors` set to `always` or `on-param`; `include-exception` true; also as a placeholder default (`${X:always}`)                                                                                                                                                                                                                                                                                                             | test, local, dev |
| `unsafe-diagnostics`   | `spring.jpa.show-sql` or `spring.jpa.properties.hibernate.show_sql` true; Hibernate bind logging (`org.hibernate.orm.jdbc.bind`, `orm.jdbc.extract`, `type.descriptor.sql`, any parent such as `org.hibernate.type`, and `root`) at TRACE or ALL; `management.endpoint.env.show-values`, `configprops.show-values`, `health.show-details` or `health.show-components` `always`; `spring.h2.console.enabled` or `settings.web-allow-others` true; also as a placeholder default (`${SHOW_SQL:true}`) | test, local, dev |
| `active-profile`       | `spring.profiles.active` or `spring.profiles.include` with a literal value in the main (profile-less) document, one finding per line                                                                                                                                                                                                                                                                                                                                                                | none             |
| `missing-enable`       | `@Scheduled`, `@Async`, the cache annotations, `@PreAuthorize` and friends, or `@Retryable` used in Java or Kotlin while no main class has the matching `@Enable...` and no XML `annotation-driven` element enables it                                                                                                                                                                                                                                                                              | none             |
| `literal-secret`       | a literal value under a key whose last segment is, or ends in a separate word that is, a secret word (below)                                                                                                                                                                                                                                                                                                                                                                                        | test, local, dev |

- **Literal secrets.** The last key segment, split into words at `-`, `_` and case changes, must
  end in `password`, `passwd`, `passphrase`, `secret`, `token`, `credential(s)`, `api-key` (or `apikey`), `private-key`,
  `secret-key`, `access-key`, `signing-key`, `encryption-key`, `hmac-key`, `jwt-key`, `crypto-key` or
  `master-key`, so `db-password`, `client-secret` and `jwtSecret` match while
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
  A last segment that is just `key` takes its parent into account: `stripe.api.key`,
  `jwt.key`, `app.encryption.key` and `app.signing.key` count, `spring.data.redis.key` and
  `app.cache.key` do not. A value that starts with `classpath:` or `file:` points at key material
  instead of holding it and is not judged. Any other key whose value is a URL is checked for a
  credential: `user:password@` in the authority, Oracle's `jdbc:oracle:thin:user/password@host`,
  or a parameter whose name ends in `password`, `pwd`, `secret`, `token`, `api-key`, `api_key` or
  `access-key` (`sslpassword=`, `client_secret=`, `access_token=`) in the query or after `;`, or a
  plain `key=` parameter whose value is a token of 20 or more letters, digits, `-` or `_` (an API
  key such as `?key=AIza...`; `?key=orders` is a setting), with a value that
  is not a `${...}` placeholder or a URI template (`{token}`, `{0}`, `%s`, `<token>`), so
  `jdbc:postgresql://db/shop?user=shop&password=${DB_PASSWORD}` passes. For an `<owner>.key` key,
  algorithm and identifier values (`RS256`, `AES256`, `SECRET_KEY_ID`) and single lowercase words
  (`read`, `rsa`) are settings, not keys. The finding
  is `literal-secret`, names the key and never the value. The Java twin is `SpringValueSecretDefault`,
  which judges the default inside `@Value("${jwt.secret:default}")` by the same words.
- **Actuator.** The sensitive endpoints are `auditevents`, `beans`, `caches`, `conditions`,
  `configprops`, `env`, `heapdump`, `httpexchanges`, `httptrace`, `jolokia`, `logfile`, `loggers`,
  `mappings`, `quartz`, `sessions`, `shutdown` and `threaddump`: they serve configuration, heap or
  thread contents, or change the running application. `health`, `info`, `metrics` and
  `prometheus` pass. A project that serves the sensitive ones only on a separate, non-public
  `management.server.port` adds an exception.
- **Active profiles.** `spring.profiles.active` and `spring.profiles.include` belong in the
  deployment's environment, not in the packaged main file: a literal there turns the dev
  exemptions on in production. Values that come from the environment pass: `${SPRING_PROFILES_ACTIVE}`,
  `${PROFILE:}`, a Maven-filtered `@spring.profiles.active@` and an empty value. A profile document
  or file cannot activate profiles in Spring, so only the main document is read. The message for
  `active` names `SPRING_PROFILES_ACTIVE` per deployment, or `spring.profiles.default` for a
  fallback a deployment can override; the one for `include` names `spring.profiles.group`. A flow
  list (`active: [dev, h2]`) is one finding.
- **Missing `@Enable...`.** Java and Kotlin sources of the main source roots are scanned (comments and
  strings blanked), the Kotlin roots included: the manifest's `kotlinSourceRoots` lists the Kotlin
  plugin's main source directories on Gradle (with the java preset too) and, on Maven, the
  `sourceDirs` of `kotlin-maven-plugin`'s compile configuration, or `src/main/kotlin` when it
  names none for Spring's `@Scheduled`, `@Async`, `@Cacheable`/`@CacheEvict`/`@CachePut`/`@Caching`,
  `@PreAuthorize`/`@PostAuthorize`/`@PreFilter`/`@PostFilter`/`@Secured` and the two `@Retryable`
  annotations (matched through their import or full name, so other libraries' `@Scheduled` do not
  count). When no main class carries `@EnableScheduling`, `@EnableAsync`, `@EnableCaching`,
  `@EnableMethodSecurity` (or the global or reactive form) or `@EnableRetry` /
  `@EnableResilientMethods`, every use gets a finding, identity `enable-<feature>`. XML files in the
  source and resource roots with `<task:annotation-driven/>` (scheduling and async),
  `<cache:annotation-driven/>`, `<retry:annotation-driven/>` or `<security:method-security/>`
  (or `global-method-security`) count as enabling; they are matched by these usual namespace
  prefixes. This check needs no Spring config files. Enabling annotations that come from a library
  jar are not seen; add an exception then.
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
  skipped. Profile groups and `spring.config.import` files are not followed, and
  `spring.profiles.active` is read only to learn the profiles the tests use.
- **Tests.** `spring-config-parser.test.mjs` (properties and YAML parsing, line endings, byte
  order mark, continuations, escapes, indexes, flow collections, anchors), `spring-secrets.test.mjs`
  (key words, value judgement), `java-spring.test.mjs` (relaxed keys, open-in-view, ddl-auto,
  profile expressions, line stability, exceptions, the configuration hash), `java-spring-rules.test.mjs`
  (the other rules), `config-rules/config-rules.test.mjs` (active profiles, diagnostics, error
  details, URL credentials), `wiring/spring-wiring.test.mjs` (the `@Enable...` check) and `java-reports.test.mjs`
  (glue, the `spring: true` gate).

## Review rules

Rules that carry review findings over from the TypeScript preset. Each works the same on Gradle
and Maven: the PMD rules are in the shared rule set files, and `spring/java-spring.e2e.test.mjs`
builds one Spring project (`java-e2e/fixtures/review-rules`, every expected violation marked with
`// violation: <rule>`) with both and asserts the same findings, and exactly the marked ones.
Every message names the allowed form and the exception that keeps code that is right.

**Rule set scopes.** `pmd-test-ruleset.xml` (and `spring-test-ruleset.xml` when the compile
classpath has Spring) run on test sources only, through the generated `pmd-tests.xml` that
excludes the main source directories. `pmd-main-ruleset.xml` (and `spring-ruleset.xml` with Spring)
run on main sources only, through the generated `pmd-main.xml` that excludes the test directories.
The init script and `maven/maven-lint.mjs` generate both, so the scopes are the same on both
builds. The main-only set holds PMD's `security` category, since tests encrypt with fixed keys, and the API
design rules (`ExhaustiveEnumPredicate`, `StaticForwardingWrapper`, `SingularAndPluralMember`): like the TypeScript preset's
`exhaustive-union-predicate`, `no-forwarding-wrapper` and `no-singular-and-plural-prop`, which run
on production files only, they leave test helpers alone, since tests are not an API anyone calls.
It also holds `ClassLoadEffect`, the counterpart of the TypeScript preset's
`nitpicker/report-module-load-effects`: a test class may open a file or start a server in a static
setup, production code may not.
Two manifest flags feed the messages and checks below: `testAwaitility` (Awaitility on the test
classpath) and `published` (a library module that is deployed, see `test-only-export`).

| Rule (prints as)                | Flags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Allowed form                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pmd/FixedSleepInTest`          | In tests: `Thread.sleep`, `TimeUnit.X.sleep`, `LockSupport.parkNanos`, `wait(ms)` and `join(ms)` (and an unchecked `join(Duration)`) outside a polling loop; Mockito's `after(ms)` with a check that could pass sooner (`after(ms)`, `.atLeastOnce()`, `.times(n)`); Playwright's `page.waitForTimeout(...)`; Awaitility's `until(() -> true)`. A sleep in a mock answer (`doAnswer`, `thenAnswer`) or in a thread body (`new Thread`, an executor, `CompletableFuture.runAsync`) is not flagged, nor one in a test-source class without test methods that implements or extends a type of the main sources (a fake that simulates latency; `messages/latency-fakes.mjs`). `join(ms)` and `wait(ms)` get a timed-wait message: they return early, so the advice is to assert the result of `join(Duration)` or a latch `await`, not to poll.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Wait on the condition. When the project's tests use Awaitility, the message names `await().atMost(...).until(...)`; otherwise a loop that checks it against a deadline (a sleep inside it is fine). `verify(mock, timeout(ms))` for a mock, a checked `join(Duration)` for a thread.                                                                                           |
| `pmd/NegativeWaitInTest`        | In tests: Mockito's `after(ms)` with `never()`, `times(0)`, `atMost(n)` or `atMostOnce()`, and Awaitility's `during(...)`, which prove that nothing happens by waiting out a delay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | A `Clock` or scheduler the test controls: move it past the delay and assert at once.                                                                                                                                                                                                                                                                                           |
| `pmd/SpringUnusedContext`       | A `@SpringBootTest` class (no superclass, no `RANDOM_PORT` or `DEFINED_PORT`, also static-imported, no type-level `@MockBean`, `@MockitoBean`, `@SpyBean` or `@MockitoSpyBean`) with a non-empty test method that injects nothing: no `@Autowired`, `@Inject`, `@Resource`, `@Value`, `@MockBean`/`@MockitoBean`/`@SpyBean`/`@TestBean` or server port field, parameter or setter, no `MockMvc`, `WebTestClient`, `TestRestTemplate`, `ApplicationContext`, `CapturedOutput` or `ApplicationEvents`, no constructor parameters, Lombok's `@AllArgsConstructor` with an instance field or `@RequiredArgsConstructor` with a `final` or `@NonNull` field counted as one (JUnit can only call such a constructor when Spring autowires it, through `@TestConstructor(autowireMode = ALL)`, `spring.test.constructor.autowire.mode=all` or an `@Autowired` constructor, so the class needs no check of how).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A unit test that creates the class with `new`, or a slice (`@WebMvcTest`); `@SpringBootTest` is for integration and component tests. An empty `contextLoads()` test is exempt.                                                                                                                                                                                                 |
| `pmd/TestClassWithoutTestCases` | A test-named class (`Test*`, `*Test`, `*Tests`, `*TestCase`) without a test method. Classes named `*ArchTest`, `*ArchTests` or `*ArchitectureTest` are left to ArchUnit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Add the tests, or rename a helper so it does not look like a test class.                                                                                                                                                                                                                                                                                                       |
| `pmd/ExhaustiveEnumPredicate`   | In main sources: a boolean in a value position (returned, assigned, a lambda body, also inside a larger `&&`/`\|\|` or as a ternary condition there) that compares one subject that reading cannot change (a variable, a `this` field, a no-argument `getX()`/`isX()` call, a record accessor; not `it.next()` or another call) with some constants of one enum, qualified or static-imported (`s == PAID \|\| s == SHIPPED`, `o.status() != A && o.status() != B`, `EnumSet.of(A, B).contains(s)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A `switch` expression without `default`, or a boolean each constant declares (`PAID(true)`).                                                                                                                                                                                                                                                                                   |
| `pmd/StaticForwardingWrapper`   | In main sources: a static method with parameters whose body only passes them, in order, to another static or same-class method (`return Prices.sum(a, b);`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Call the target directly. Factories named `of` or `from` and copies (`List.copyOf`, `Collections.unmodifiableList`) are allowed.                                                                                                                                                                                                                                               |
| `pmd/SingularAndPluralMember`   | In main sources: a record, or a `@ConfigurationProperties` class or a class nested in one, with both `tag` and `tags` (`-s`, `-es`, `y`/`ies`) where the plural is a `List`, `Set`, `Collection`, `Iterable` or array of the singular's type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Keep the plural; pass one item as a one-element list.                                                                                                                                                                                                                                                                                                                          |
| `pmd/ClassLoadEffect`           | In main sources: a call with an external effect that runs while the class loads: in a `static` block or `static` field initializer (interface constants too), an enum constant's arguments or body fields, an anonymous class created in one of those (double-brace initialization), the field, instance initializer or constructor of an instance the class creates in its own `static` code (`static final Db INSTANCE = new Db()`, `new Box<>()`, a `static` factory such as `INSTANCE = create()`, a constructor that `this(...)` reaches from the one created), or a method of the same class that one of those calls without a receiver, on `this` or through the class name. Effects, by resolved type: JDBC (`DriverManager.getConnection`, `DataSource.getConnection`, `Persistence.createEntityManagerFactory`), pools and clients that connect when built (`new HikariDataSource(config)`, `MongoClients.create`, Lettuce `RedisClient.connect`, `new KafkaProducer`), network calls (`HttpClient.send`, `URL.openConnection`/`openStream`, `new Socket(host, port)`, `new ServerSocket(port)`, `DatagramSocket`, `InetAddress.getByName`/`getLocalHost`, OkHttp and Retrofit `Call.execute`, Apache `HttpClient.execute`, `RestTemplate` requests, `RestClient` `retrieve()`, a `WebClient` result that is `block()`ed or subscribed), file I/O (every `Files` method, statically imported ones too, `FileInputStream`, `FileOutputStream`, `FileReader`, `FileWriter`, `RandomAccessFile`, `ZipFile`, a `PrintWriter`, `PrintStream` or `Formatter` on a file name, a `Scanner` on a `File` or `Path`, `File` methods that touch the disk), processes, threads and waits (`ProcessBuilder.start`/`startPipeline`, `Runtime.exec`, `Thread.start`, `Thread.Builder.start`, `Thread.sleep`, `Executors.new*`, `new ThreadPoolExecutor`, `new ForkJoinPool`, `new Timer`, executor, pool and timer `submit`/`execute`/`invoke*`/`schedule*` (`ForkJoinPool.commonPool().submit(...)` too), `CompletableFuture.runAsync`/`supplyAsync`) and JVM-wide settings (`System.setProperty`, `setOut`, `setErr`, `Runtime.addShutdownHook`, `Locale.setDefault`, `TimeZone.setDefault`, `Thread.setDefaultUncaughtExceptionHandler`). The message names the call, the class that loads and the member that runs it. | Do the work in a method that `main` or the framework calls after startup (a `@Bean` method, an `ApplicationRunner`) and pass the result in, or hold it in a lazy holder class (`private static final class Holder { static final Db INSTANCE = new Db(); }`). Constants, loggers, `Pattern.compile`, collections, `Clock` and `System.getProperty`/`getenv` reads stay static. |
| `coupling/test-only-export`     | A main class that only test classes use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Move it to the test sources, or use it from production code.                                                                                                                                                                                                                                                                                                                   |

**Precision notes.**

- `FixedSleepInTest` and `NegativeWaitInTest` match by resolved type (`java.lang.Thread`,
  `java.util.concurrent.TimeUnit`, `LockSupport`, `org.mockito.Mockito`, Awaitility's
  `ConditionFactory`, Playwright's `Page` and `Frame`), so a project's own `sleep` method is not
  flagged. A polling loop is a `while`, `do` or `for` loop with a condition other than `true`, or a
  `while (true)` / `for (;;)` loop that reads the clock (`System.nanoTime()`,
  `System.currentTimeMillis()`, `Instant.now()`, a `Clock`). Both Awaitility and a deadline loop
  are valid, so the message follows the project (`messages/wait-advice.mjs`): it names Awaitility
  when the module has it on the test classpath or a test file imports `org.awaitility`, and it
  then says that `pollDelay(...).until(() -> true)` is a fixed sleep too.
- `ExhaustiveEnumPredicate` needs at least two comparisons with distinct constants of one enum on
  one subject. A condition in an `if` or a loop, or a predicate passed as an argument, is not a
  value and is not flagged. The Node side (`adapters/review-rules/enum-predicates.mjs`) then keeps
  a finding only when the enum is declared in the project's sources (same package, imported, or
  the only enum with those constants), has at least three constants and the predicate lists some
  but not all of them; the message names the enum. A static-imported constant is resolved through
  its `import static`, and through a wildcard static import when one project enum declares it.
  Library enums (`TimeUnit`, `HttpStatus`) are not the project's to classify.
- `StaticForwardingWrapper` skips annotated methods, generic methods, `main`, `valueOf`,
  `fromString`, `of` and `from` (names frameworks and callers look up), methods of Spring
  stereotype and configuration classes, wrappers around `copyOf`, `copyOfRange`, `unmodifiable*`,
  `synchronized*` and `checked*` (they change the type or the guarantees), and wrappers that add
  type arguments, reorder or drop parameters.
- `ClassLoadEffect` treats lambdas, method references, anonymous class methods and local classes as
  run later, so a `Supplier` field or a `Runnable` built at load is fine, and a lambda that a
  static block runs at once (`list.forEach(...)`) is not followed. A helper is followed one level
  and only within its own class: the call must have no receiver, `this` or the class name, and PMD
  must resolve it to that method, so `List.of()` or `Objects.toString(x)` in a `static` field does
  not make a method `of` or `toString` of the class a helper, and of two overloads only the one the
  arguments select is (`read(1)` runs `read(int)`, not `read(String)`). A constructor counts only
  when the class's own `static` code creates an instance with arguments that select it, or a
  `this(...)` call in that constructor reaches it, so a value class with
  `static final Money ZERO = new Money(0)` keeps a `Money(String file)` constructor that reads a
  file. A call into another class's helper, or a `static` field of another class that creates this
  one, is not followed: that is the lazy holder the message suggests
  (`private static final class Holder { static final Db INSTANCE = new Db(); }`), which runs only
  when `Holder.INSTANCE` is first read. The class that declares `public static void main(String[])`
  is not checked: running at load is what an entry point does (a nested class of it is). That
  includes a `@SpringBootApplication` class with `main`; Spring `@Configuration` classes and a
  `@SpringBootApplication` class without `main` get no pass: the container creates their beans
  after the class has loaded, so their `static` blocks still run at load, in every test slice that
  touches them, while their `@Bean` methods and constructors are not load-time code. Reading a classpath resource (`getResourceAsStream`) is allowed: it is part of
  the program, not an outside system. `System.getenv` and `System.getProperty` reads are left to
  `SpringTypedConfiguration` in a Spring project and are allowed elsewhere. `new HikariDataSource()`
  without a configuration, `new Socket()` and `new ServerSocket()` without arguments connect nothing
  and pass. `Security.addProvider` and `System.loadLibrary` are allowed: registering a provider and
  loading a native library are the usual work of a static block. `System.exit`, `Runtime.exit` and
  `Runtime.halt` are left to `DoNotTerminateVM` (and Error Prone's `SystemExitOutsideMain`), which
  report them anywhere outside `main`.
- `ClassLoadEffect` compared with the TypeScript rule: clock reads (`Instant.now()`,
  `System.currentTimeMillis()`), random values (`new Random()`, `UUID.randomUUID()`) and
  environment reads stay allowed in a `static` field, since they change nothing outside the class
  and a `Clock` or `Random` field is how JVM code holds them; TypeScript reports `Date.now()`,
  `Math.random()` and any `process.*` call. The JVM-wide settings `process.*` stands for there
  (`System.setProperty`, `setOut`, `setErr`, shutdown hooks) are reported here. `Thread.sleep`,
  which blocks the loading thread as a module-level `time.sleep` blocks a Python import, is
  reported; TypeScript has no blocking sleep to report.
- `ClassLoadEffect` names the call, the class and the member from the source at the finding's
  location (`messages/load-effects.mjs`), so a finding in a helper reads
  `` `DriverManager.getConnection(...)` runs while Db loads (in method open, which static field CONNECTION calls) ``.
  The same pass gives the finding its identity: the class, the member that runs the call and the
  call text (`Db.open(): DriverManager.getConnection(...)`), with no line number, so a finding keeps
  its identity when lines above it move, and a changed call is a new finding.
- `ClassLoadEffect` limits: overloads are told apart by parameter count and by the declared type of
  each parameter, which PMD resolves through single-type imports, types of the file, star imports,
  `java.lang` and the package; two same-arity overloads whose reference parameter types both match
  an argument (a star-imported type that shares a simple name with a class of the package) are both
  taken as called. A class whose `static` code creates an instance through another class's factory
  is not followed.
- `SingularAndPluralMember` compares declared types by simple name, with primitives boxed, and is
  reported on the plural member. Method parameters and varargs record components
  (`record Keys(String key, String... keys)`) are not checked, as the Python preset leaves required
  parameters alone.
- `test-only-export` (`adapters/review-rules/test-only-classes.mjs`, run project-wide) reads
  `jdeps.txt`, `jdeps-classes.txt` and `jdeps-test.txt` of every module and resolves a class to its
  own module first. A main class is reported when test classes use it and no other main class
  does, unless:
  - it carries a wiring annotation, directly or through a project annotation that carries one
    (`adapters/review-rules/test-only-usage.mjs`): Spring stereotypes, `@Configuration`,
    `@SpringBootApplication`, `@AutoConfiguration`, `@ConfigurationProperties`, actuator
    `@Endpoint` and its variants, `@FeignClient`, Spring Data repositories, JPA `@Entity`,
    `@Embeddable`, `@MappedSuperclass` and `@Converter`, `@Named`, `@Singleton`, CDI scopes,
    interceptors and decorators, EJB beans, JAX-RS `@Path`, `@ApplicationPath` and `@Provider`,
    servlet `@WebServlet`, `@WebFilter` and `@WebListener`, `@ServerEndpoint`, Spring Boot
    `@SpringBootConfiguration` and `@JsonComponent`, Micronaut controllers, clients, factories,
    `@ConfigurationProperties`, `@Context`, `@Prototype`, `@Bean` and filters, MicroProfile
    `@RegisterRestClient` and `@ConfigProperties`, SmallRye `@ConfigMapping`, Quarkus `@Startup`;
    a class also counts as wired when one of its methods or parameters carries a framework callback
    annotation: `@Bean`, `@Scheduled` (Spring, Micronaut, Quarkus), `@EventListener`,
    `@TransactionalEventListener`, `@KafkaListener`, `@RabbitListener`, `@JmsListener`, AWS
    `@SqsListener`, `@MessageMapping`, MicroProfile `@Incoming` and `@Outgoing`, CDI `@Observes`.
    jdeps names every annotation a class uses, so a method annotation shows as a class dependency.
    Meta-annotations are followed only for the project's own annotations: a library annotation's
    own annotations are not in the reports, so the known ones are listed;
  - it has an entry point: a Java `static void main`, a Kotlin `@JvmStatic fun main`, or a Kotlin
    file with a top-level `fun main` (its `FileKt` facade);
  - its qualified name appears in a file the project reads by name: main sources, resources
    (`logback.xml`, `META-INF/spring/...`, `META-INF/services/...`), `src/main/webapp` (`web.xml`),
    or a file directly in the root or a module folder (build scripts with `implementationClass`,
    `Main-Class` or a shade `mainClass`, `template.yaml`, `plugin.xml`), and a `Dockerfile`,
    `*.Dockerfile` or `Containerfile` in any folder outside build output; comments (`//` and
    `/* */` in Java, Kotlin and Gradle scripts, `<!-- -->` in XML and `pom.xml`, `#` in YAML, TOML,
    properties and container files) and documents (`.md`, `.adoc`, `.rst`, `.txt`) not counted;
  - its simple name appears in the code of a main source file that sees its package (same package
    or a wildcard import);
  - or its module is a published library: on Gradle a project with a `publishing` publication, on
    Maven a `jar`, `bundle` or `maven-plugin` module with `distributionManagement` or a publishing
    plugin (`central-publishing-maven-plugin`, `nexus-staging-maven-plugin`,
    `maven-release-plugin`) whose deploy is not skipped. Its classes are its consumers' API, so its
    own and its sibling modules' tests are legitimate callers. A module with an entry point or a
    `@SpringBootApplication` is an application, not a library, even when it is deployed.

  Kotlin sources are read the same way: each top-level class, object or interface of a `.kt` file
  is a declaration, and a file with top-level functions or properties declares its `FileKt` facade
  (or the `@file:JvmName` name). The message names the exception for a class that a file
  nitpicker does not read loads by name. A module without all three reports is skipped.

**Not built.** Unused builder parameters (a Lombok `@Builder` or record builder field no caller
sets) are not checked: builders are filled by reflection (Jackson's `@Jacksonized`, MapStruct,
Spring binding) as often as by calls, and a text match on `.name(` collides with every method of
that name, so the rule would need compiler symbol facts to stay precise.

## Reuse rules

`duplicate-definition`, `sibling-copy-edit` and `exported-name-collision` are the shared rules of
the TypeScript preset (see `typescript-strict-preset.md`), written once over neutral facts
(`shared/rules/facts/`). The Java and Kotlin presets produce those facts from source, on Gradle and
Maven alike, in the project-wide step (`builds/project-wide.mjs`), so they need no build output.
The findings have tool `structure` and are lifted with the top-level `exceptions`.

- **Producer.** `adapters/reuse/jvm-reuse-facts.mjs` reads every `.java` file (and `.kt` file with
  `preset: "kotlin"`) under the main source roots the build reports for each module, leaving out
  roots under `build/` and files matched by `exclude`. One tokenizer
  (`adapters/reuse/source/jvm-tokens.mjs`) serves both languages: each string, text block, raw string
  or character literal is one token, comments are dropped, Kotlin block comments nest and Kotlin
  string templates are read for the names they use. A source file is a module and a Gradle or Maven
  module is a package, so copies are compared within one build module.
- **Definitions.** Top-level types (Java `class` and `record` as `class`, `interface`, `enum`,
  `@interface` as `type`; Kotlin classes and `object`s as `class`, `interface`, `enum class`,
  `annotation class` and `typealias` as `type`), and the members that need no instance: Java
  `static` methods and `static final` fields (every interface field), Kotlin top-level `fun`, `val`
  and `const val`, and the functions and `val`s of a top-level `object` or of a class's `companion
object`. Instance methods are left to the duplicates check, as class methods are in the
  TypeScript preset. A member is named `Owner.name` (`Money.of`), with its parameter types when it
  is overloaded (`Money.of(long)`), so two classes' copies of a helper stay apart in findings;
  copies are grouped by the plain name. Everything but `private` counts as exported, since
  package-private Java code is usable from the package. A `main` function, and a type that holds
  one, is an entry, which `sibling-copy-edit` skips.
- **Uses.** A name in a file resolves the way javac and kotlinc resolve it: an explicit import
  first, then a type (or Kotlin top-level declaration) of the same package, then a star import; a
  fully qualified name (`shop.billing.Money`) resolves directly. `Type.member` and `Type::member`
  uses a static member, a Kotlin extension call (`order.toDto()`) uses the imported or same-package
  function, and a static or `object` import (`import static shop.util.Strings.trim;`) uses that
  member. These uses decide whether a definition is used (an unused one is the dead-code checks'
  business), and the free names of each definition, resolved this way, are part of its identity,
  so two `capped()` copies that call different `limit()` helpers are not duplicates.
- **`exported-name-collision`.** In Java a file cannot import two classes of one simple name, so the
  collision is a class imported (or of the same package) while another class of that name is
  written fully qualified; in Kotlin it is an `import ... as` alias, as in TypeScript. The Java
  message tells to rename one or to use both by their fully qualified names. Functions are left out
  in both languages: two same-named functions imported into one file are overloads, and extension
  functions of one name on different receivers are idiomatic Kotlin.
- **`sibling-copy-edit`.** On the head run of a change the runner reads each changed file of the
  base checkout (`--baseline-root`) again, following renames from `--baseline-moves-file`, and
  compares the edited definition with its base copy and its same-named siblings in the module.

## Rule messages

PMD, Checkstyle and SpotBugs messages say what is wrong, rarely how to fix it, and never how to keep
code that is right as it is. `languages/java/messages/` holds one catalog per tool (`pmd.json`,
`checkstyle.json`, `spotbugs.json`) with an entry for every rule the preset can report: the
errorprone, bestpractices, performance, multithreading and security PMD categories (the rules the
preset leaves out too, for a project that turns one back on) plus `AvoidCatchingGenericException`, every check in
`google_checks.xml`, and every SpotBugs pattern. Each entry has:

- `fix`: one sentence, in our words, naming the allowed form (`null` when the tool's message already
  says it);
- `mayBeIntended`: whether the rule can fire on code a careful team keeps (a CLI printing with
  `System.out`, a catch-all at a boundary);
- `layout` (Checkstyle only): a layout check the formatter fixes; the message then says to run the
  formatter that ran (`google-java-format`, `palantir-java-format`, or "your Java formatter" when the
  style is not known), or to fix the layout by hand when none runs, instead of a fix of its own.

`readJavaFindings` passes every finding through `applyRuleMessages`
(`languages/java/messages/rule-messages.mjs`). It shortens Checkstyle rule names, then appends the
fix to the tool's message, and for an enforceable finding of a rule that may be intended (or one
the catalog does not know, from a project's own config) the exception route with the finding's own
path:

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
- `languages/java/adapters/review-rules/*.test.mjs` and `messages/wait-advice.test.mjs`: fast,
  always on. The enum filter, the test-only class check and the Awaitility advice.
- `languages/java/messages/rule-messages.test.mjs`: fast, always on. Short Checkstyle names, fix
  text, the exception route, and the shape of every catalog entry.
- `languages/java/messages/rule-catalog.e2e.test.mjs`: gated like the other e2e tests. The catalogs
  name exactly the rules of the pinned tool versions.
- `languages/java/adapters/java-e2e/java-preset.e2e.test.mjs`: gated behind `NITPICKER_JAVA_E2E=1` (`npm run test:java`, which also runs `java-spring.e2e.test.mjs`, `spring/e2e/spring-arch.e2e.test.mjs`, `escape-hatches.e2e.test.mjs`, `languages/java/adapters/java-e2e/pit-targets.e2e.test.mjs`, `languages/java/maven/preset/red-base/maven-red-base.e2e.test.mjs`, `languages/java/adapters/errorprone/error-prone.e2e.test.mjs`, the other Error Prone e2e tests `rule-catalog.e2e.test.mjs` and `languages/java/adapters/java-e2e/red-base/java-red-base.e2e.test.mjs`, one file at a time because each stops the Gradle daemons when it ends). Needs Java 21, Gradle, Maven and network access to Maven Central; about 85 seconds
  warm. `.github/workflows/java-e2e.yml` runs it (Temurin 21, Gradle 8.14.3, Maven 3.9.11) on a push to `main` that changes `languages/java/**`, `core/**`, `shared/**`, `package.json`, `package-lock.json`, `vitest.config.mts` or the workflow, by hand (`workflow_dispatch`), and on a pull request when the `run-ci` label is added. On a tiny Gradle project (`languages/java/adapters/fixtures/gradle-project`, one legacy PMD and
  SpotBugs violation on the base) it checks: a clean change passes; a change that only moves the
  legacy violation stays baselined; a change adding an empty catch block (PMD), a default-charset
  `String` (SpotBugs) and misformatted code fails with exactly those three findings as new.
  `pit-targets.e2e.test.mjs` runs `nitpickerPit` on a project whose packages sit under `org.acme`
  and a class directly in `org`, and checks that PIT starts and mutates every class.
- The conformance suite (`npm run test:conformance`) already covers the comparison itself. The
  Java-specific part of X11's done criterion ("passes the conformance suite") is that the findings
  produced here satisfy the findings schema, which `collectJavaFindings` enforces on every run via
  `parseAnalyzerReport`.

Gradle commands default to a 15-minute deadline, configurable with
`NITPICKER_GRADLE_TIMEOUT_MINUTES` as described above. On Linux and macOS, nitpicker starts each command
in its own process group and stops that group with SIGTERM at the deadline, then SIGKILL
after 500 ms. This also stops inherited Gradle/test-worker processes when the launcher exits
first or ignores SIGTERM. On Windows, the deadline force-stops the command tree with
`taskkill /T /F`. Cleanup adds at most 1.5 seconds on Linux/macOS or 2 seconds on Windows, plus process-launch overhead. Processes
that deliberately leave the command group, including a pre-existing shared Gradle daemon,
are outside this boundary; use `--no-daemon` when the whole build must stop with the command.
