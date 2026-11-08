# Maven

Part of the [Kotlin preset guide](../kotlin-preset.md).

A project with a `pom.xml` and no Gradle build runs through the Maven runner of the Java preset
(`languages/java/maven/`). The Kotlin tools run next to the Java ones, in the same module loop, with
the same reports and the same findings as on Gradle. Nothing is configured: a module counts as a
Kotlin module when its effective POM (`mvn help:effective-pom`, parents, profiles and
`pluginManagement` resolved) applies `org.jetbrains.kotlin:kotlin-maven-plugin` with an execution of
a compile goal (`compile`, `kapt`, `test-compile` or `test-kapt`) whose phase is not `none`. A build
where no module does is a `kotlin/maven-failure` tool error saying so.

**Source roots** are the ones the build compiles, from the effective POM: the `sourceDirs` of the
plugin's `compile` and `kapt` executions for main code, those of `test-compile` and `test-kapt` for
test code (a `sourceDirs` set on the plugin itself serves main code only); where none are set, the
plugin compiles the Maven source roots (`sourceDirectory`, `testSourceDirectory` and the roots
build-helper adds), and so do these; one reader, `kotlin-roots.mjs`, serves the Kotlin preset and
the Java preset's `kotlinSourceRoots`. A folder the build does not compile, such as a leftover
`src/main/kotlin` that no `sourceDir` and no `sourceDirectory` names, is not analyzed. Only
directories that exist, lie inside the module and are not under its build directory are kept, and
of nested roots only the outermost, so a generator that writes Kotlin to `target/generated-sources`
is neither linted nor measured. `manifest.json` carries
`sourceRoots`, `kotlinSourceRoots`, `kotlinTestSourceRoots` and `kotlinFormatter` per module, as for
Gradle. The code is in `languages/java/maven/kotlin/` (roots, setup, Java classes, module) and
`languages/java/maven/kotlin/tools/` (one file per tool).

| Tool               | On Maven                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compile and tests  | The project's own `mvn` run with the JaCoCo agent, so the Kotlin tests that Maven's Surefire runs (JUnit 5, JUnit 4, TestNG and Kotest through its JUnit platform runner) work as in the Java preset. A compile error is `kotlin/maven-failure` and names the file.                                                                                   |
| detekt             | Run outside Maven with the pinned jars. `--base-path` is the module directory, so paths and fingerprints match Gradle's. Exit codes 0 and 2 (findings) are accepted, as on Gradle.                                                                                                                                                                    |
| ktlint, ktfmt      | Run outside Maven with the pinned jars on the Kotlin files of the module; the formatter is detected from the effective POM (see [Format check](format-check-ktlint-ktfmt-or-none.md)).                                                                                                                                                                |
| kotlin-psi         | The same `kotlin-psi` program as on Gradle (metrics and the facts of the [review rules](review-rules.md)), compiled once per run with the `javac` of the JDK that runs Maven and run on the pinned `kotlin-compiler-embeddable` (2.4.21) for each module. Structure limits, CRAP, the review rules, and the clone and stability inputs are identical. |
| JaCoCo, PIT, jdeps | Cover the Java and the Kotlin classes of the module together; the Kotlin handling (generated branches, report-only mutants, file modules) is the Gradle code, because it reads the reports and not the build.                                                                                                                                         |
| Java-only tools    | PMD, Checkstyle, google-java-format and Error Prone see only the `.java` files. SpotBugs runs on the classes whose `SourceFile` attribute is a `.java` file (or that carry none, as with `-g:none`), copied to `target/nitpicker/java-classes`; the rest of the module's classes are on its auxiliary classpath.                                      |

**Tool jars** are resolved once per run through a generated tools project and
`dependency:build-classpath`, from the same pinned map as Gradle (detekt 1.23.8, its Kotlin 2.0.21,
ktlint 1.8.0, ktfmt 0.64, compiler 2.4.21). The detekt, ktlint and ktfmt jars are fat jars and are
taken without their dependencies; the Kotlin compiler (`kotlin-compiler-embeddable`) keeps its
transitive dependencies. Nothing of the project's own dependency tree reaches a tool. They need
Maven Central, like the Java tools do.

**detekt with type resolution.** The classpath is detekt's own Kotlin standard library (2.0.21), the
module's Java classes (`target/nitpicker/java-classes`) and the module's main and test compile classpaths minus the project's `kotlin-stdlib`, for the reason
given under [detekt](detekt.md). `--jdk-home` is the JDK that the build's toolchain selects (the `jdk`
of a `maven-toolchains-plugin` configuration, or the `jdkToolchain` of `maven-compiler-plugin`),
looked up in the toolchains files as Maven finds them: the user file named by `-t`/`--toolchains` in
`.mvn/maven.config` or `MAVEN_ARGS`, else `~/.m2/toolchains.xml`, and the global file named by
`-gt`/`--global-toolchains`, else `conf/toolchains.xml` of the Maven installation. A toolchain none
of them lists falls back to the JDK of `JAVA_HOME` (or of the `java` on the PATH), with a note in
the report that says so; a run that finds no JDK home stops with an error. The config layering, the one-way rules and the `kotlin.detektConfig` override are the same
code as on Gradle.

**Mixed modules.** Kotlin and Java files in one module share the compile; Java files are linted by
the Java tools only and Kotlin files by the Kotlin tools only. Test sources are linted as on Gradle:
Java and Kotlin, in main and test (the test classes of the module and its test compile classpath go
into detekt's type resolution). Multi-module reactors are analyzed module by module, with
`filePrefix` set to the module folder in the findings, and a module without Kotlin (a Java-only
module next to Kotlin ones) is analyzed exactly as in the Java preset; the project-wide steps
(duplicates, coupling, file limits) take the merged Java and Kotlin roots of all modules. The clone
scan runs once from the project root over those roots, one source root at a time, as on Gradle.

**Failure.** A Maven failure on either snapshot (Kotlin does not compile, a test fails, a tool jar
cannot be resolved, no `mvn` on the PATH) is one `kotlin/maven-failure` finding with classification
`tool-error`, handled as for Gradle (see [Failure policy](failure-policy.md)).

**Mutation.** PIT runs through the Java preset's Maven PIT step on all classes, and the Kotlin
mutants are descriptive, as on Gradle.

**Tests.** The Maven Kotlin unit tests sit next to the code (`kotlin-roots.test.mjs`,
`kotlin-setup.test.mjs`, `java-classes.test.mjs`, `tools/kotlin-arguments.test.mjs`,
`module/maven-module-kotlin.test.mjs`, `configuration/toolchain/toolchain-jdk.test.mjs`) and use the
fixture `languages/java/maven/fixtures/kotlin-single`; the real-Maven end-to-end suites are in
[Tests](tests.md).

# Spring

A Kotlin project that uses Spring gets the Spring checks of the [Java preset](java-preset.md#spring-rules)
that make sense for Kotlin, on Gradle and on Maven. Three kinds of check exist, and this section says
for each whether it applies and what differs.

**Source-independent checks apply unchanged.** The configuration checks (`spring/open-in-view`,
`spring/ddl-auto`, `spring/risky-startup-flags`, `spring/datasource-without-timeout`, the secret and
profile checks) read the project's
`application*.properties` and `application*.yml`, not the sources, so Kotlin projects get all of
them. `spring/open-in-view` looks for JPA in the main sources and now scans `.kt` files for the
`jakarta.persistence` and `javax.persistence` imports as well as `.java`. The ArchUnit rules (layers,
cycles, naming, placement) run as tests in the project's own test run, and their violations are
resolved to the Kotlin source file of the violating class as to a Java one. Both are lifted through
`exceptions` with the same `spring/<rule>` and `archunit/<rule>` names as in the Java preset.

**The PMD Spring rules.** PMD cannot read Kotlin, so nitpicker runs its own implementation of the
Spring rules on the main Kotlin sources, with the same ids and the same
exception route; see [Spring rules](review-rules.md#spring-rules) for what it covers and how it differs from Java.
The JPA and Spring Data rules run on the same sources and facts. The rules read the Kotlin facts the
`kotlin-psi` program writes, on Gradle and on Maven alike, and the all-open options of the build for
the finality of a class: on Maven they are read from the `kotlin-maven-plugin` configuration of the
module (`<compilerPlugins><plugin>spring</plugin>` is the all-open plugin with the `spring` preset;
`all-open:annotation=` and `all-open:preset=` are read from `<pluginOptions>`) and written to the
manifest as `kotlinAllOpen`, as the init script does for `compileKotlin` on Gradle.
