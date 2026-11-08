# Slow tests

Part of the [Kotlin preset guide](../kotlin-preset.md).

As for Java ([slow tests](../java-preset/slow-tests.md)): a test the change adds or edits fails over 5 s
as a unit test or 30 s as an integration test (`thresholds.unitTestSeconds`,
`thresholds.integrationTestSeconds`), measured on head from the JUnit XML of the test tasks, once and
without a rerun (see Java). A Kotlin test named with backticks is found by its name.
A Kotest test nested in contexts is identified by its whole path, `twice/doubles the value`, on Gradle and
on Maven alike (Gradle's XML names only the test, so the init script records the contexts in a side file
next to it), so a project that switches build tools keeps its slow tests.

## Tests without production runtime

As for Java ([tests without production runtime](../java-preset/tests-that-never-run.md#tests-without-production-runtime)): a
Kotlin test class (a `@Test` class, a Kotest spec) whose class files reach no production class, directly
or through test helpers, base classes and top-level functions of a `...Kt` file, fails as
`no-production-runtime`. A test that starts a framework context (`@SpringBootTest`, a Spring Boot
slice, `@QuarkusTest`, `@MicronautTest`, ArchUnit's `@AnalyzeClasses`) is not reported. The exception
entry is `{ "rule": "no-production-runtime", "paths": ["src/test/kotlin/..."], "reason": "..." }`.
The test's source file is found in the Kotlin test source roots of the build (`src/test/kotlin`, or
the Gradle source sets and the Maven `sourceDirs` of `kotlin-maven-plugin`'s `test-compile`). A Kotest
spec style (`FunSpec`, `StringSpec`, ...) marks a test; an `open`, `sealed` or `abstract` class is a
base and is not judged, and tests under `e2e`, `end_to_end`, `contract` folders or an `e2eTest`
or `contractTest` source set are excluded, as for Java. A `const val` or `inline fun` may leave no
reference to its class, so a test that uses only that may be reported; lift it with an exception, as
for reflection-only use. Annotations or base classes from a library jar are not seen.
