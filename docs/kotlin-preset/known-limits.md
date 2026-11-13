# Known limits

Part of the [Kotlin preset guide](../kotlin-preset.md).

- Multi-module builds: every project with the Kotlin plugin is analyzed and its findings carry
  the project's folder, as for Java. A build where no project applies the Kotlin plugin is a tool
  error saying so.
- Kotlin and Java files are linted in main and test sources, as in the Java preset. Generated
  sources under the build directory are skipped.
- The Kotlin metrics step needs network access to Maven Central for `kotlin-compiler-embeddable`
  (about 60 MB, cached by Gradle or Maven) on the first run. It parses with the pinned compiler, so syntax newer
  than that version ends the run with an error naming the file and the version. A version that the
  project forces on `org.jetbrains.kotlin` (a `resolutionStrategy` rule, Spring's dependency
  management) does not reach that compiler: the pin is applied last.
- The review rules read syntax only (see [Review rules](review-rules.md)): a call is tied to a
  declaration by name, package, imports and the form of its receiver, not by type, so a call on a local
  value of another type can still count for a same-named extension, member or `object` function, and
  generated sources under the build directory are not read.
- `inline` functions are not measured by CRAP (see [CRAP](crap.md)); their structure limits still apply.
- Kotlin Multiplatform and Android modules (a Gradle project with a `kotlin` extension and without the
  `java` plugin: `org.jetbrains.kotlin.multiplatform`, `org.jetbrains.kotlin.android`). A descriptive
  `kotlin/build-note` finding names each such project and what did not run on it.
  - What runs on every such project: the steps that read sources only, among them the review rules, the source
    checks, the test honesty rules, structure and class limits and duplicates, on every Kotlin source set
    (`commonMain`, `jvmMain`, `androidMain`, `main`, a variant's `debug`, ...; a source set whose name starts
    with `test` or has `Test` holds tests, such as `commonTest`, `jvmTest`, `test`, `testDebug` and
    `androidTest`), and the format check (ktlint or ktfmt, when `kotlin.formatter` names one).
  - What also runs on a Multiplatform project with a JVM target (`jvm()`): detekt with type resolution, on every
    Kotlin source set, with the compile classpath of the `main` and `test` compilations of the JVM targets;
    the kotlinc lint, compiling the common and JVM sources together as a Multiplatform build does; the tests of
    the target (`jvmTest`), their JaCoCo coverage of the JVM compilation's classes and CRAP, where a failing
    `jvmTest` is handled as on a JVM module. With several JVM targets, the lint, tests, coverage and CRAP cover
    the first one only; detekt uses the classpath of all of them. A quick run skips the tests, coverage and CRAP.
  - What does not run: mutation testing (PIT) on a Multiplatform project (its task is written for the Java
    source sets of a JVM module and is not shared yet); the tests, coverage and CRAP of any non-JVM target;
    detekt, the lint, the tests, coverage and CRAP of an Android project, an Android target or a project with no
    JVM target (their variants need the Android SDK, which the end-to-end tests here cannot install); the
    `.java` files of an Android module and of a Multiplatform JVM target that uses `withJava()`. Sources of
    other targets (`iosMain`, `jsMain`, `androidMain`) are read with the JVM classpath, so a call that resolves
    only on their platform stays unresolved and detekt's rules report less there.
  - A Multiplatform build cannot apply the `java` plugin (the Kotlin Gradle plugin rejects it), so a
    `withJava()` project is read as a Multiplatform one, Kotlin sources included. The end-to-end tests build a
    Multiplatform project with a JVM target and one with `withJava()`; the Android end-to-end test needs an
    Android SDK.
- Source-set excludes: a `.kt` file under a Kotlin source directory that the build leaves out of its
  source set (`kotlin.exclude("**/Legacy*.kt")`) and that no other source set keeps is not read by the review
  rules, duplicates and the reuse checks, and no finding of any tool is reported on it. A Kotlin JVM module reads
  the excludes of its `main` and `test` source sets, the ones its Kotlin steps check; an Android or
  Multiplatform module those of every source set. On Maven, `kotlin-maven-plugin` has no excludes and every file
  is read.
- When `settings.gradle(.kts)` sets `repositoriesMode` to `FAIL_ON_PROJECT_REPOS`, nitpicker adds no
  repository to the projects and resolves its tools from the repositories the settings declare, which then
  must include Maven Central or a mirror of it.
- detekt's type resolution uses detekt's own Kotlin standard library (see [detekt](detekt.md)), so its
  results can differ from a project's own detekt run, and a library built with a newer Kotlin stays
  unresolved.
- On Maven the Kotlin source roots come from `kotlin-maven-plugin`'s `sourceDirs`, else the POM's
  source directory and `build-helper-maven-plugin` `add-source` roots, as the plugin compiles them.
  A root that a plugin adds in any other way is not read.
- On Maven the project's own ktlint and detekt plugins are skipped with `-Dktlint.skip` and
  `-Ddetekt.skip` while nitpicker runs the build (a check bound to the lifecycle does not fail the
  run; the Maven lint end-to-end file binds both and pins it). A formatter plugin that uses another
  property name, and a formatter run through `exec-maven-plugin`, still run, and a failure of one
  fails the build. The formatter that nitpicker follows is the one the effective POM names through
  the ktlint Maven plugin or the Spotless `kotlin` step.
- On Maven the Kotlin metrics and `kotlin-psi` programs run on the JDK that runs Maven (`JAVA_HOME`), as on
  Gradle they run on the JVM of Gradle; detekt's `--jdk-home` follows the build's toolchain. detekt
  itself runs on JDK 17 to 21, so on a build running on JDK 25 it uses the newest JDK from 17 to 21
  that the build can find (a toolchain on Gradle, an installed JDK on Maven) and is skipped with a `tool-skipped` tool error when there is none (see
  [JDK versions](../java-preset.md#jdk-versions)).
- ArchUnit rule tests written in Kotlin run with the other tests, but the resolution of their
  findings to source files is only verified for Java.
- The kotlinc lint compiles the sources a second time with the pinned compiler, so it adds a
  compile's time to the run, and a compiler plugin that the module applies some other way than
  through the Kotlin Gradle plugin is not loaded (the run is then `kotlinc/lint-not-run`).
- The source checks read code shapes, not types: a logger or repository under another name, an I/O
  call behind a helper, or a secret read through a constant is not seen.
