# Slice 3: Checkstyle

Part of the [Java preset guide](../java-preset.md).

- **Gradle side.** The init script applies the Gradle `checkstyle` plugin (version pinned in the
  map, `checkstyle: 10.21.1`) and makes `nitpickerJava` depend on the Checkstyle task of the
  main source set and of every test source set (see [Coupling and stability](coupling-and-stability-ticket-sh6.md)
  for which source sets are tests; a `jmh` or `benchmark` set is not checked). `ignoreFailures` is on and the XML reports are written to `checkstyle.xml` (main
  sources) and `checkstyle-<source set>.xml` (`checkstyle-test.xml`, `checkstyle-integration.xml`,
  ...) in the report directory; the HTML report is off.
- **Configuration.** The preset uses `google_checks.xml` from the pinned
  Checkstyle jar, with the layout checks the formatter owns (see [Style](style.md)) and `MissingJavadocMethod` and
  `MissingJavadocType` suppressed (`languages/java/gradle/checkstyle-suppressions.xml`): Javadoc is
  allowed on public API but not required, the same rule as the TypeScript preset. Member and method
  names may be a single lowercase letter (`x`, `y`), as record components can. Javadoc that is
  there still has to be well formed. With this bundled config the tasks run on nitpicker's own
  `nitpickerCheckstyle` configuration, so a project that declares its own Checkstyle version in
  `checkstyle` (Spring PetClinic declares 12.3.1) still gets the pinned version and its config.
  A project config chosen by policy (`tools.checkstyle.precedence` lists `"project"`) is merged
  into this one module by module (`adapters/tool-config/checkstyle/checkstyle-layers.mjs`, run in
  Node by `checkstyle-merge.mjs` between two Gradle runs (the first exports nitpicker's config, the second
  gets the merged file as `-Pnitpicker.checkstyle.mergedConfig`) and by `writeCheckstyleSetup` for Maven): the project's property
  values win for the modules both configs name, the modules only one names stay, so nitpicker's
  checks are never dropped, and the merged file still runs on the pinned Checkstyle. Decision to review: google_checks is noisy on
  code that was never written for it, but the gate is differential, so existing violations stay
  baselined and only new ones fail.
- **Ingestion.** `ingestCheckstyle` (X6) unchanged, `tool` `checkstyle`, absolute file paths made
  project-relative. Severities `error` and `warning` are enforceable, `info` is descriptive. The
  rule is the check's short name (`checkstyle/Indentation`, not the class
  `com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck`), or the `id` the config
  gives the module (`checkstyle/RightCurlySame`); see [Rule messages](rule-messages.md).

| Tool                      | Report         | Ingester           | Classification                                         | Identity                                                                                                                                                                                                                   |
| ------------------------- | -------------- | ------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkstyle (`checkstyle`) | Checkstyle XML | `ingestCheckstyle` | enforceable (`error`, `warning`); descriptive (`info`) | Hash of check class (rule), path and message text; repeats of the same message in a file get `#2`, `#3` in order. No line number; the path is part of the hash, so a renamed file shows its findings as resolved plus new. |

Messages that embed a measured value (for example "found 120" in a line-length violation) change
identity when the value changes: editing such a line counts as a resolved plus a new finding. A
count rule is the exception: it carries a ratchet keyed by the message without its count, so a
legacy finding whose count fell or stayed is held and one whose count grew fails with
`Lines grew from 160 to 161. Put the new code in a new function.` before the tool's message. Of the
shipped rules that covers Checkstyle `VariableDeclarationUsageDistance` and PMD
`AvoidDuplicateLiterals`; it also covers the Checkstyle size, metrics and depth checks
(`MethodLength`, `ParameterNumber`, `ExecutableStatementCount`, `CyclomaticComplexity`,
`NPathComplexity`, `JavaNCSS`, `NestedIfDepth` and the rest), `ReturnCount`, `ThrowsCount` and
`MultipleStringLiterals`, and PMD `CognitiveComplexity`, `CyclomaticComplexity`, `NPathComplexity`,
`NcssCount` and `CouplingBetweenObjects`, when the project's own config adds them. Renaming a
method keeps its count findings while its body is unchanged, and an overload added above an edited
legacy method does not take its base.

- **Wildcard imports follow the project.** Wildcard and explicit imports are both valid, so
  the `java.wildcardImports` convention (`explicit` or `wildcard`, default `explicit`) marks a file
  `wildcard` when it has any wildcard import except a static one in a test source set, and the plurality
  of files wins. With `wildcard`, `checkstyle/AvoidStarImport` and `errorprone/WildcardImport` are
  dropped on Gradle and on Maven alike (the Kotlin preset's Java files too); PMD and google-java-format
  have no such rule. Static wildcards in test sources (`import static org.assertj.core.api.Assertions.*;`)
  are their own convention, `java.testStaticImports`, measured over the test source sets
  (`src/test`, `src/integrationTest`, ...): with `wildcard`, only star findings on a
  `import static` line of a test file are dropped, and the ban stays everywhere else. Pin either in
  `conventions` (see [Configuration](../usage.md#configuration)).
