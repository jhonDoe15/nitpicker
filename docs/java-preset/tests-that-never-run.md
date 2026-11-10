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

## Tests without production runtime

A test class that reaches no production class at run time is an enforceable `no-production-runtime`
finding (tool `test-runtime`, `languages/java/adapters/test-runtime/`), on Gradle and Maven builds, for
Java and Kotlin test classes alike. It reads the same jdeps reports as `test-only-export`
(`jdeps-test.txt`, `jdeps-classes.txt`), so a test counts as reaching production when its class files,
directly or through test helpers and base classes, reference a main class of any module of the build.

- **Which tests.** The finding is per test file. A class is judged when it declares tests (`@Test`,
  `@ParameterizedTest`, `@RepeatedTest`, `@TestFactory`, `@TestTemplate`, TestNG `@Test`, ArchUnit
  `@ArchTest`, a Kotest spec style such as `FunSpec`, a JUnit 3 `TestCase`) and is not abstract (nor,
  in Kotlin, `open` or `sealed`). The markers are the same list `test-not-run` uses. Helpers, fixtures
  and abstract bases are not judged. Nested, anonymous and Kotlin lambda classes count for the class
  that declares them. A class whose source file is not under a Java or Kotlin test source root is
  skipped, so Groovy and Spock tests are not judged.
- **End-to-end and contract tests.** A test under a folder named `e2e`, `end_to_end`, `endtoend`,
  `contract` or `contracts`, or under a source set folder such as `e2eTest`, `endToEndTest` or
  `contractTest` (any case), drives a deployed system and is not judged; it is counted as excluded.
- **Framework contexts.** A test annotated `@SpringBootTest`, a Spring Boot test slice (`@WebMvcTest`,
  `@DataJpaTest`, `@JsonTest`, ...), `@SpringJUnitConfig`, `@ContextConfiguration`, `@QuarkusTest`,
  `@QuarkusIntegrationTest`, `@MicronautTest` or ArchUnit's `@AnalyzeClasses` (or one that imports
  classes with `ClassFileImporter`), or one whose helper or base class carries one, runs production
  code through the framework and is not reported. So does a test that drives a build with Gradle's
  `GradleRunner`.
- **No type-only case.** The JVM has no import that exists only for the type checker, so
  `type-only-production-dependency` does not apply; a production type that a test names only as an
  erased generic argument leaves no reference in the bytecode and is reported as `no-production-runtime`.
- **Exception.** The message ends with the shared sentence naming
  `{ "rule": "no-production-runtime", "paths": ["<test file>"], "reason": "..." }`; `test-runtime/no-production-runtime`
  is accepted as the same rule and lifts the finding for the matching paths.
- **Limits.** The check reads class references, so a test that reaches production only by reflection
  (`Class.forName("shop.Cart")`, a service loaded by name) is reported; lift it with an exception. A
  production type used only in a field or parameter signature counts as reached. An annotation or
  base class that comes from a library jar (not from a module of the build) and starts a framework
  context is not seen, so such a test is reported. A test that extends a base class which declares
  the tests, and declares none itself, is not judged. Tests:
  `adapters/test-runtime/test-runtime-findings.test.mjs`.
