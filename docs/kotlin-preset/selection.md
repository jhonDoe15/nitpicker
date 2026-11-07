# Selection

Part of the [Kotlin preset guide](../kotlin-preset.md).

`"preset": "kotlin"` in `nitpicker.config.json`. Like `java`, it is explicit and never
auto-detected.

**Why a preset of its own and not the Java preset covering Kotlin sources (decision).** The Java
preset already builds a Kotlin module, because the Kotlin plugin applies `java`, but it would
change meaning for every project that already uses it with a Kotlin module the moment it started
running detekt and a Kotlin formatter: new findings and a different tool set under the same key.
A preset of its own is a pure opt-in, so the Java preset's behavior is unchanged by construction
(the Kotlin tasks exist only with `-Pnitpicker.kotlin=true`, which only this preset passes). It
also lets the reports say what ran: the analyzer is named `kotlin`, so a Gradle failure is a
`kotlin/gradle-failure` tool error and `baseline-expansion` findings carry the tool `kotlin`. What
stays shared is everything else: `languages/java/` holds both presets, and `createJavaAnalyzer`
takes `{ kotlin: true }`. A project whose build has no Kotlin module and sets `"preset": "kotlin"`
fails with a tool error saying so, and so does a Maven project whose build never applies
`kotlin-maven-plugin` (`kotlin/maven-failure`): such a project uses the java preset.
