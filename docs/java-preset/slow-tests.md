# Slow tests

Part of the [Java preset guide](../java-preset.md).

- **Rule.** `slow-test` (tool `test-runtime`) fails a test the change adds or edits when it takes more than 5 s
  as a unit test, or more than 30 s as an integration test (`thresholds.unitTestSeconds` and
  `thresholds.integrationTestSeconds`). The rule, message shape, budgets and exception are the same
  for [TypeScript and JavaScript](../typescript-strict-preset.md#slow-tests) and
  [Python](../python-preset.md#slow-tests); the finding prints the bare id `slow-test`, and
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
  (see [Integration tests on Gradle](how-it-works.md)), on Maven the `test` phase, or `verify` when
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
  Failsafe's to `test-results/failsafe/` (see [Maven builds](maven-builds.md)); `surefire` counts as
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
