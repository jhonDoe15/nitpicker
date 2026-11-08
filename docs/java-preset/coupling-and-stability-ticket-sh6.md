# Coupling and stability (ticket SH6)

Part of the [Java preset guide](../java-preset.md).

- **What runs.** The init script's `nitpickerJdeps` task (a dependency of `nitpickerJava`) runs the
  JDK's `jdeps -verbose:class -filter:none` once over the main and test class directories and
  splits the edges by the side that declares the source class: `jdeps.txt` in the report directory
  (main classes), `jdeps-classes.txt` (the main classes, one binary name per line) and
  `jdeps-test.txt` (test classes), which only the [test-only class check](review-rules.md) reads. A
  test source set is one a `Test` task runs or one whose name contains `test` (`integrationTest`,
  `testFixtures`) and that is not generated (Spring Boot's `aotTest`, see Spring AOT); the task
  compiles only those, so a `jmh` or `benchmark` source set is neither compiled for it nor counted
  as a test. Maven runs the same single jdeps call over
  `target/classes` and `target/test-classes` (`builds/jdeps-reports.mjs`). Neither build holds
  the jdeps output in memory: Gradle splits it line by line as jdeps writes it, Maven writes it to
  a file in the report directory and splits that in 1 MB chunks, so a module of any size works.
  jdeps comes with the JDK that runs Gradle; nothing is downloaded and no version is pinned. The
  task lives in `languages/java/gradle/tasks/jdeps-task.gradle`, and its arguments come from the
  `jdeps` entry of `languages/java/builds/tools/tool-commands.json`.
- **Conversion.** `languages/java/adapters/metrics/java-coupling.mjs` parses the class graph, folds nested classes
  into their top-level class, keeps only edges between two main classes, computes the metrics and
  hands the neutral report to `evaluateCoupling` in `shared/rules/coupling.mjs`. The findings are
  the TypeScript ones: report-only `coupling`, `module-coupling`, `package-coupling` and
  `stability-direction-metric` metrics, and the enforceable `stability-direction` finding
  (`<package> depends on less stable package <package>`), under the tool name `coupling`. The
  policy (`shared/policy.mjs`) marks `stability-direction` as enforced for Java.
- **Same semantics as TypeScript, at Java granularity.** The TypeScript preset's module is a source
  file and its package the top-level directory under the source root; here a module is a source
  file (a top-level class with its nested classes) and a package a Java package. Fan-in and fan-out
  count distinct files, a package's fan-in and fan-out count distinct files outside the package,
  instability is `fanOut / (fanIn + fanOut)`, and a package pair whose source is more stable than
  its target is reported once.
- **Differences.** (1) Java packages are flat: `a.b` and `a.b.c` are different packages, so a
  `stability-direction` finding can appear between a package and its sub-package; TypeScript groups
  by the top-level directory. The default package is `(root)`. (2) jdeps cannot tell type-only from
  runtime references, so the `runtime*` module metrics and the `runtimeDependencies` and
  `typeOnlyDependencies` summaries are not reported. (3) A second top-level class in a file named
  after another class is attributed to `<package>/<Class>.java`, which may not exist; only the
  metric path is affected. (4) Reflection and other references that are not in the bytecode are
  invisible to jdeps. (5) Test classes and library classes are not part of the graph. (6) The `path` of a `stability-direction` finding is the package name (`stable`), not a file, so its `exceptions` entry names the package: `"paths": ["stable"]`; a glob over source directories never matches it.
- **Baselining.** Identities are `package-edge:<source>-><target>`, `package:<name>:<metric>` and
  `module:<metric>` with the file path, never a line, so an existing violation stays baselined and
  only a new package edge, or a new instability inversion, fails.
- **Tests.** `languages/java/adapters/metrics/java-coupling.test.mjs` (parsing, metrics, stability edges, the
  neutral report through the shared rule), `java-reports.test.mjs` (glue), and two gated e2e cases
  (a package depending on a less stable package fails; the same violation on the base stays
  baselined).
