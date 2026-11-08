# Slow tests

Part of the [Kotlin preset guide](../kotlin-preset.md).

As for Java ([slow tests](../java-preset/slow-tests.md)): a test the change adds or edits fails over 5 s
as a unit test or 30 s as an integration test (`thresholds.unitTestSeconds`,
`thresholds.integrationTestSeconds`), measured on head from the JUnit XML of the test tasks, once and
without a rerun (see Java). A Kotlin test named with backticks is found by its name.
A Kotest test nested in contexts is identified by its whole path, `twice/doubles the value`, on Gradle and
on Maven alike (Gradle's XML names only the test, so the init script records the contexts in a side file
next to it), so a project that switches build tools keeps its slow tests.
