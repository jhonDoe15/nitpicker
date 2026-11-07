# Test retries

Part of the [Kotlin preset guide](../kotlin-preset.md).

The retry rules of the [Java preset](../java-preset/how-it-works.md) apply to Kotlin on Gradle: the
same init script switches off the test-retry and Develocity retries of every `Test` task and reads
the JUnit XML after a successful build. Maven support is separate.
