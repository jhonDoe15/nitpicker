# File limits

Part of the [Kotlin preset guide](../kotlin-preset.md).

The shared file-limit rule (`shared/rules/file-limits.mjs`) checks the `.kt` and `.java` files of the
Kotlin and Java source roots, main and test (roots under `build/` are generated and skipped): 300
lines per file, 500 per test file, and 6 files (and separately 6 test files) directly in one package
folder. The thresholds are `fileLines`, `testFileLines` and `folderFiles`. Packages more than 4 levels
below the root package (the longest package prefix all the code shares) fail `folder-depth-limit`,
`thresholds.folderDepth` and an exception for that rule change it. The Java class limits
(`class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`) apply to the `.java` files of a
Kotlin project, with `classMethods`, `classFields` and `inheritanceDepth`; the Kotlin classes get the same limits (see [Class limits](structure-limits.md#class-limits)). The `java.indentation` convention (`"4"`) switches the Java sources' format check
to 4 spaces. The Kotlin files' line length is
detekt's `MaxLineLength` (120 by default, set in `config/detekt/detekt.yml`), the `.java` files use
the width of the Java formatter (100 for google-java-format, 120 for palantir-java-format, or the width of the project's Checkstyle `LineLength`, see the Java preset; `line-length-limit`, which an exception lifts for some paths), and
`thresholds.lineLength` is a config error with this preset. A file or folder already over a limit
fails only when it grows, and a package folder moved to a new path is matched to its old path.
