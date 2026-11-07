# Tools evaluated and not integrated

Part of the [Kotlin preset guide](../kotlin-preset.md).

- [Infer](../infer-evaluation.md): not integrated; the license finding applies to Kotlin too, and its Kotlin
  support captures `kotlinc` invocations only, not Gradle or Maven Kotlin builds.
- [BlockHound](../blockhound-evaluation.md): not integrated by nitpicker. With the `kotlinx-coroutines-debug`
  integration on the test classpath it flags a blocking call on `Dispatchers.Default` and accepts it on
  `Dispatchers.IO`; a project opts in with its own test dependencies and JVM flag.
