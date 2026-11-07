# Tests that never run

Part of the [Java preset guide](../java-preset.md).

A test class that the build compiles but no test task runs is an enforceable `test-not-run`
finding (tool `test-runtime`, `languages/java/adapters/test-runs/unrun-tests.mjs`), on Java, Kotlin
and Groovy test sources alike. A class counts as a test when its source declares one (`@Test`,
`@ParameterizedTest`, `@RepeatedTest`, `@TestFactory`, `@TestTemplate`, a Spock `Specification` or
a Kotest spec) and it is not abstract, an interface or an annotation.

- **Maven.** Surefire skips the classes Failsafe's default includes name (`IT*`, `*IT`, `*ITCase`).
  In a module where Failsafe does not run (see [Maven builds](maven-builds.md); the manifest says
  `runsFailsafe`), such a class under the test source roots (and `src/test/kotlin` next to
  `src/test/java`) that has no report in `test-results/` (Surefire was not set up to run it) is
  reported: "Bind the integration-test and verify goals of maven-failsafe-plugin in this module so
  OrderIT runs: ...". The correct forms are a module that binds Failsafe, or test classes Surefire
  runs.
- **Gradle.** A test task runs every class of its source set whatever its name, so `*IT` in
  `src/test/java` runs under `test`. The silent skip is a test source set (a source set other than `main` whose name, split at capitals, `-` and `_`, has the word `it` or a word starting with `test`, such as `integrationTest` or `testFixtures`, but not `latest`) that no `Test` task takes its
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
