# Test frameworks

Part of the [Java preset guide](../java-preset.md).

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
  [Slice 4](slice-4-archunit.md)); on Maven Surefire runs the rule classes with the provider it picks
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
