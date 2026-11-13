# How it works

Part of the [Java preset guide](../java-preset.md).

```
gradle -I languages/java/gradle/nitpicker.init.gradle nitpickerJava   (per snapshot: base, head; Maven builds: see below)
  -> <report dir>/modules.json and, per Gradle project that applies java, <report dir>/<key>/{pmd.sarif, spotbugs.sarif, errorprone.json, format.txt, jacoco.xml, checkstyle.xml, checkstyle-<source set>.xml, archunit/*.xml, spring-arch.json, structure.json, classes.json, pit/mutations.xml, jdeps.txt, jdeps-classes.txt, forbidden-apis.txt, cpd.xml, dependencies.json, guards-plan.json, javac-lint.txt, permits.txt, manifest.json}
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
  exactly in one map at the top of the file (PMD 7.16.0, SpotBugs 4.9.8, google-java-format 1.35.0,
  JaCoCo 0.8.16, PIT 1.22.1, Checkstyle 13.5.0, Error Prone 2.50.0, NullAway 0.14.2). Tools run from their own configurations (`nitpickerPmd` and so on), so they never
  touch the consumer's compile classpath. Nitpicker passes `-Pnitpicker.reportDir=<dir>`, a
  temporary directory outside the project, and the task writes only below it, one subdirectory per
  Gradle project (layout in [internals.md](../internals.md#java-report-directory)). A build script
  that writes to `build/nitpicker` therefore changes nothing nitpicker reads. Run by hand without the property, the task
  writes to `build/nitpicker/` of each project. The tools resolve from Maven Central, which the init script adds to each
  project, unless `settings.gradle(.kts)` sets `repositoriesMode` to `FAIL_ON_PROJECT_REPOS` (Gradle then refuses a
  project repository): the repositories the settings declare are used, and they must include Maven Central or a mirror.
- **Multi-project builds.** Every project that applies the `java` plugin is analyzed, the root
  included when it applies it; paths in findings are relative to the directory Gradle runs in, so a
  subproject's findings carry its folder (`lib/src/main/java/...`). A build where no project applies
  the plugin, or a project whose reports are missing, is a tool error, never a pass. Projects of
  an `includeBuild` composite build (in `settings.gradle` or in `pluginManagement`, such as a
  `build-logic` convention-plugin build) and `buildSrc` are separate builds: they are neither
  analyzed nor configured, so Gradle builds their plugins as it would without nitpicker. Each project
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
- **Test retries.** A test that fails once is a failing test, whatever retry the build configures.
  On Gradle, after the projects are evaluated and again when the task graph is ready, the init
  script sets `maxRetries` to 0 (and `failOnPassedAfterRetry` to true) on the `retry` extension of
  every `Test` task (the `org.gradle.test-retry` plugin) and on Develocity's `develocity.testRetry`
  when it has one; a project without them is untouched. The JUnit XML is also read after a build
  that succeeded, so a failing test still fails the run when the build ignores test failures
  (`ignoreFailures = true`) or retries in some other way. A test case that failed an attempt and
  passed a later one is listed as failing, as `failed, then passed on a rerun` with a hint to fix
  the flaky test. Maven is below.
- **Spring AOT.** With the GraalVM native plugin, Spring Boot adds the `aot` and `aotTest` source
  sets, whose sources `processAot` and `processTestAot` generate, and puts the `aotTest` output on
  the `test` classpath, so `test` would run `processTestAot` (a Spring context start per test
  context) and compile what it generates. Nitpicker skips both tasks (`onlyIf`), as it skips Spring
  AOT processing on Maven (`-Dspring-boot.aot.skip=true`), so the tests run on the JVM as usual.
  The processing still runs when the tests may run in AOT mode: on Gradle, when a `Test` task has
  `-Dspring.aot.enabled=true` among its JVM arguments (from `systemProperty`, `jvmArgs` or an
  argument provider) or in its environment, or when any build script, `gradle.properties` or
  `spring.properties` of the build mentions `spring.aot.enabled` (a setting made in `doFirst` is
  only visible that way); on Maven, when the effective `argLine` or system properties of Surefire
  or Failsafe set it. A source set with at least one source directory under the build directory and
  no existing one outside it is generated code (unless the build directory holds the project
  itself): it is never a test source set unless a `Test` task runs its classes, so no tool
  compiles, lints or counts it.
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
  [slow test](slow-tests.md) rule (any task but `test`). Every checked task also has its own PIT run
  and, when the task holds ArchUnit classes, its own ArchUnit run (see
  [Slice 4](slice-4-archunit.md) and [Slice 7](slice-7-mutation-with-pit.md)).
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
  (the library entry) throws; the CLI path maps the failure to a `tool-error` finding, see slice 2:
  `gradle-failure` (exit 2). Failing tests are not a Gradle failure: when the test reports name
  them, the build runs again without the tests of those projects, and each one gets a
  `tests-failed` tool error (exit 1 on the head, a red-base note on the base) while the other
  checks keep their findings.
  A head that does not compile is not a tool failure: each compiler error (javac, Error Prone,
  kotlinc; on Maven the compiler plugin's `[ERROR] file:[line,column]` lines) becomes a
  `build/compile-error` finding at its file and line (exit 1), and one `compile-failed-skipped`
  notice says the other checks did not run. The comparison then reports no base finding as
  resolved. A base that does not compile stays a `gradle-failure` (or `maven-failure`).
  The one exception is a base snapshot whose test reports name failing tests while the head passes:
  that is a note and the run goes on (see [A base whose tests fail](../usage.md#a-base-whose-tests-fail)).
  A base that fails for another reason, or whose tests fail without a named failing test, still
  fails.
