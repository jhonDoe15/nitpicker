# Slow tests

Part of the [Kotlin preset guide](../kotlin-preset.md).

As for Java ([slow tests](../java-preset/slow-tests.md)): a test the change adds or edits fails over 5 s
as a unit test or 30 s as an integration test (`thresholds.unitTestSeconds`,
`thresholds.integrationTestSeconds`), measured on head from the JUnit XML of the test tasks, once and
without a rerun (see Java). A Kotlin test named with backticks is found by its name.
