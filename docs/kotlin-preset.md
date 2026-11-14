# Kotlin preset

Status: slices KT1 (ticket #176), KT2 (ticket #177), KT3 (ticket #178) and KT4 (ticket #179) implemented.

The Kotlin preset gates a Gradle project with Kotlin JVM modules (`org.jetbrains.kotlin.jvm`), Kotlin
Multiplatform or Android modules (their sources only, see [Known limits](kotlin-preset/known-limits.md)), or a
Maven project that applies `kotlin-maven-plugin`, including modules that mix Java and Kotlin, with the same differential gate as the
[Java preset](java-preset.md): run the tools on the merge base and on head, turn each report into
findings, fail only on new enforceable findings. It is not a second implementation. It shares the
Gradle init script or Maven runner, the ingesters, the failure policy and the cache with the Java
preset, and adds Kotlin tools next to the Java ones. The build tool is detected: a
project with a Gradle build runs through Gradle, one with only a `pom.xml` through Maven, and
`"java": { "buildTool": "maven" | "gradle" }` picks one when both exist (see
[Maven](kotlin-preset/maven.md)). The JDK and Gradle a CI job needs, and recipes for GitHub Actions, GitLab CI and
Jenkins, are in [nitpicker in CI](ci.md#toolchains-by-preset).

Every rule the preset can report has an entry in the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md): [detekt](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/kotlin-detekt.md), [the Kotlin source checks, compiler warnings and format checks](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/kotlin-nitpicker.md), and the [Java rules](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-pmd.md) that run on Java sources. `nitpicker explain <tool/rule>` prints an entry.

## Contents

Each topic has its own page, so two changes to different topics never edit the same file.

- [Test retries](kotlin-preset/test-retries.md)
- [Selection](kotlin-preset/selection.md)
- [How it works](kotlin-preset/how-it-works.md)
- [What runs on what](kotlin-preset/what-runs-on-what.md)
- [detekt](kotlin-preset/detekt.md)
- [One-way rules](kotlin-preset/one-way-rules.md)
- [Source checks](kotlin-preset/source-checks.md)
- [Source scans](kotlin-preset/source-scans.md)
- [Effects rules](kotlin-preset/effects-rules.md)
- [Compiler warnings](kotlin-preset/compiler-warnings.md)
- [Doc comments](kotlin-preset/doc-comments.md)
- [Frameworks](kotlin-preset/frameworks.md)
- [Review rules](kotlin-preset/review-rules.md)
- [Format check: ktlint, ktfmt or none](kotlin-preset/format-check-ktlint-ktfmt-or-none.md)
- [Coverage](kotlin-preset/coverage.md)
- [Mutation](kotlin-preset/mutation.md)
- [Structure limits](kotlin-preset/structure-limits.md)
- [CRAP](kotlin-preset/crap.md)
- [Duplicates](kotlin-preset/duplicates.md)
- [Coupling](kotlin-preset/coupling.md)
- [Maven](kotlin-preset/maven.md)
- [Failure policy](kotlin-preset/failure-policy.md)
- [Config keys](kotlin-preset/config-keys.md)
- [Slow tests](kotlin-preset/slow-tests.md)
- [File limits](kotlin-preset/file-limits.md)
- [Tests](kotlin-preset/tests.md)
- [Remaining slices](kotlin-preset/remaining-slices.md)
- [Tools evaluated and not integrated](kotlin-preset/tools-evaluated-and-not-integrated.md)
- [Known limits](kotlin-preset/known-limits.md)
- [Troubleshooting](kotlin-preset/troubleshooting.md)
