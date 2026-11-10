# Maven builds

Part of the [Java preset guide](../java-preset.md).

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
   dependency plugin pinned), with `-Dmaven.test.failure.ignore=true`,
   `-Dsurefire.rerunFailingTestsCount=0` and `-Dfailsafe.rerunFailingTestsCount=0` (no reruns), and
   the project's own
   Checkstyle, PMD, CPD, SpotBugs and Spotless checks skipped, and Spring AOT processing too
   (`-Dspring-boot.aot.skip=true`, unless the tests run in AOT mode, see Spring AOT above):
   `process-test-aot` would copy generated classes into `target/test-classes` and `process-aot`
   into `target/classes`. `dependency:list` writes every
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
   jMolecules (`jmolecules-ddd`), or any module when the head checkout has a feature folder (see
   [Contract types](spring-architecture-rules.md#contract-types)), also runs the Spring architecture rules: ArchUnit is resolved with
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
  Surefire's or Failsafe's reports, is a `java/tests-failed` tool error (exit 1) that names up to
  50 failing tests with the line of the failing assertion and the expected and received values. A `<rerunFailingTestsCount>` in a POM's plugin configuration wins over the `-D`
  properties, so a test case Surefire or Failsafe marked `flakyFailure` or `flakyError` is a failure
  as well (the Test retries bullet above has the message). On the base snapshot the failing tests
  are listed instead of thrown: that module skips JaCoCo and PIT, and the failure becomes a
  `tests-failed` tool error for that module that the core reads as a red base, the same as a Gradle
  base whose tests fail. The other modules keep their
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
  detection scans one source root at a time, so a clone between two modules is not found, as a clone
  between two source roots is not; on Maven the scan runs once from the project root over the roots of
  all modules, as on Gradle, and its clone findings carry the module-prefixed paths.
- **Binary.** `NITPICKER_MAVEN` when set; otherwise the project's `mvnw` (`mvnw.cmd` on Windows),
  run with `sh` when not executable; otherwise `mvn` from the PATH. A missing `mvn` is a tool error
  that names these three ways. The JDK tools (`java`, `jar`, `jdeps`) come from `JAVA_HOME` when
  set, else the PATH.
- **Kotlin.** A Maven project that applies `kotlin-maven-plugin` runs with the Kotlin preset (see
  [Maven](kotlin-preset.md#maven)); the java preset on it analyzes the Java sources only.
- **Not covered.** A surefire or Failsafe configuration that sets
  `<testFailureIgnore>false</testFailureIgnore>`, or a `jacoco:check` that sets
  `<haltOnFailure>true</haltOnFailure>`, explicitly overrides the command line, so a violated
  ArchUnit rule or coverage rule stops the build as a tool error. Maven 3 cannot resolve a
  `test-jar` dependency on another module in the `test` phase; such reactors fail as they would with
  `mvn test` (a `verify` build packages them first). Gradle multi-project builds still read only the
  root project's reports (see [Slice 1](slice-1-what-is-deliberately-not-included.md)).
