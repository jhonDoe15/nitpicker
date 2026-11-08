# Compiler warnings

Part of the [Kotlin preset guide](../kotlin-preset.md).

The task `nitpickerKotlinLint` (`languages/java/gradle/kotlin/kotlin-lint.gradle`) compiles the main
Kotlin sources, generated ones included, with the pinned compiler into a throwaway directory, with the
module's compile classpath, its compiled Java classes, its language and API version, JVM target,
opt-ins, free compiler arguments and compiler plugins, and `-Xrender-internal-diagnostic-names`. The
arguments that silence warnings (`-nowarn`, `-Werror`, `-Xsuppress-warning`, `-Xwarning-level`) are
dropped, so a build setting cannot hide them. A second task, `nitpickerKotlinTestLint`, compiles the
test sources the same way against the compiled main classes (`-Xfriend-paths` makes `internal` members
visible), the module's test class path and its compiled Java test classes, and writes `kotlinc-test.json`.
Three groups of warnings are findings of the tool `kotlinc`, on the main and test source roots, each
message naming the allowed form first:

| Rule          | Kotlin diagnostics                               | Allowed form                                                               |
| ------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `deprecation` | `DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION` | the replacement the deprecation names (`ReplaceWith`, or the Java Javadoc) |
| `unchecked`   | `UNCHECKED_CAST`                                 | a typed API, a checked conversion (`as? List<*>`) or a reified function    |
| `cast`        | `USELESS_CAST`                                   | remove the cast                                                            |

Like `-Werror` on changed code: a new warning fails, a legacy one stays baselined (the identity is
the rule and the message with numbers replaced, not the line). Their `@Suppress` is an
`inline-suppression` finding, in test sources too. A lint compile that fails (a compiler plugin it could
not load, a test class path that does not resolve) is one descriptive `kotlinc/lint-not-run` finding
naming the first error, one for the main and one for the test compile, so a broken test compile does not
hide the main warnings.
