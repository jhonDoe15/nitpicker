# How it works

Part of the [Kotlin preset guide](../kotlin-preset.md).

```
gradle -Pnitpicker.kotlin=true -I languages/java/gradle/nitpicker.init.gradle nitpickerJava   (per snapshot)
  -> everything the Java preset writes, plus {detekt.sarif, ktlint.sarif | ktfmt.txt} in each project's report directory
  -> readJavaFindings(root, { preset: 'kotlin' })   (languages/java/adapters/reporting/java-reports.mjs)
       -> readKotlinFindings                         (languages/java/adapters/reporting/kotlin-reports.mjs)
  -> compareFindings(base, head, renames)
```

The consumer build is not edited. In modules that apply the Kotlin plugin, the init script
registers `nitpickerDetekt`, `nitpickerKtlint` and `nitpickerKtfmt`, each running from its own
Gradle configuration (`nitpickerDetekt` and so on) so nothing touches the consumer's classpath,
and makes `nitpickerJava` depend on them. The tool versions are in the same pinned map as the
Java ones: detekt 1.23.8, ktlint 1.8.0, ktfmt 0.64. `manifest.json` gains `kotlin: true`,
`kotlinSourceRoots` and `kotlinFormatter`; its `sourceRoots` stay the Java source roots. Which
formatter, ktfmt style and detekt config to use is decided on the Nitpicker side
(`languages/java/adapters/kotlin/kotlin-tools.mjs`, unit tested) and handed to the init script as Gradle
properties; the style texts (the `.editorconfig` files to mirror, the ktlint defaults, the detekt
convention layer) are generated on the Nitpicker side into one JSON file in a temporary folder, whose
path is the property `nitpicker.kotlin.styleFile`, and only written out by the init script
(`kotlin-e2e/style/kotlin-style-files.e2e.test.mjs`, in `npm run test:kotlin`, runs its two small tasks
against a stand-in Kotlin plugin).
