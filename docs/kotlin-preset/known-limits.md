# Known limits

Part of the [Kotlin preset guide](../kotlin-preset.md).

- Multi-module builds: every project with the Kotlin plugin is analyzed and its findings carry
  the project's folder, as for Java. A build where no project applies the Kotlin plugin is a tool
  error saying so.
- Kotlin and Java files are linted in main and test sources, as in the Java preset. Generated
  sources under the build directory are skipped.
- The Kotlin metrics step needs network access to Maven Central for `kotlin-compiler-embeddable`
  (about 60 MB, cached by Gradle) on the first run. It parses with the pinned compiler, so syntax newer
  than that version ends the run with an error naming the file and the version. A version that the
  project forces on `org.jetbrains.kotlin` (a `resolutionStrategy` rule, Spring's dependency
  management) does not reach that compiler: the pin is applied last.
- The review rules read syntax only (see [Review rules](review-rules.md)): a call is tied to a
  declaration by name and imports, so an extension or a same-named function from another module
  can hide a finding, and generated sources under the build directory are not read.
- `inline` functions are not measured by CRAP (see [CRAP](crap.md)); their structure limits still apply.
- Kotlin Multiplatform and Android modules are not covered (`org.jetbrains.kotlin.jvm` only).
- detekt's type resolution uses detekt's own Kotlin standard library (see [detekt](detekt.md)), so its
  results can differ from a project's own detekt run, and a library built with a newer Kotlin stays
  unresolved.
- ArchUnit rule tests written in Kotlin run with the other tests, but the resolution of their
  findings to source files is only verified for Java.
- The kotlinc lint compiles the sources a second time with the pinned compiler, so it adds a
  compile's time to the run, and a compiler plugin that the module applies some other way than
  through the Kotlin Gradle plugin is not loaded (the run is then `kotlinc/lint-not-run`).
- The source checks read code shapes, not types: a logger or repository under another name, an I/O
  call behind a helper, or a secret read through a constant is not seen.
