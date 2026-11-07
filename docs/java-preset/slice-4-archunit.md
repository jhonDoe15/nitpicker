# Slice 4: ArchUnit

Part of the [Java preset guide](../java-preset.md).

- **What runs.** The project's own ArchUnit rules, executed as JUnit tests by the init script's
  `nitpickerArchunit` task (a `Test` task on the project's test classes and runtime classpath,
  `ignoreFailures`). It runs on the framework the declared ArchUnit library needs: JUnit 4 for
  `archunit-junit4` rules (`@RunWith(ArchUnitRunner.class)`), the JUnit Platform for
  `archunit-junit5`; with both or neither declared, on the framework of the task whose classes it
  runs. The ArchUnit classes are left out of every test task, and those of each checked test task
  (`test` and each task `check` depends on) run by their own `nitpickerArchunit` task,
  `nitpickerArchunit<Task>` for a task other than `test` (on that task's test classes and runtime
  classpath), so a rule in an integration test source set is a finding, not a failed build.
  When the test classes hold ArchUnit classes and none of them produced a report, the task fails
  (a Gradle failure, `tool-error`), as Maven does, instead of passing without findings. The
  project must have one of the two libraries on its test classpath; Nitpicker adds no dependency
  and so pins no ArchUnit version (the version map is unchanged). Test classes named `*ArchTest` or
  `*ArchitectureTest` are selected; `-Pnitpicker.archunit.includes=<Gradle class patterns,
comma-separated>` changes that. Those classes are excluded from the regular `test` task in
  Nitpicker runs, so a violated rule produces findings instead of failing the JaCoCo step. No
  matching classes means no `archunit` report directory and no findings.
- **Report.** Gradle's JUnit XML, one file per test class, in `archunit/` of the report directory.
  `manifest.json` additionally lists `testSourceRoots`.
- **Ingester.** `languages/java/ingest/archunit.mjs` (`ingestArchunit`). Per failed test case it parses
  the violation lines of the assertion message (`Method <a.B.run()> calls ... in (B.java:12)`) and
  groups them by the offending class, the class owning the first `<...>` element. One enforceable
  finding per rule and offending class. Findings are anchored at that class's source file
  (project-relative, found in the main or test source roots), else at the test class that declares
  the rule.
- **Identity.** Rule: the test case name (the `@ArchTest` field or method name). Identity: the
  fully qualified offending class (nested classes as `a.B$C`). Line numbers (`in (B.java:12)`), the
  number of violations and the violation text never take part, so edits above a violation keep it
  baselined. The message carries the count and the first violation, without its line.
- **Failures that are not violations.** A failed or errored test case without ArchUnit violation
  lines (the rule could not run, classes could not be imported) becomes one enforceable
  `test-failure` finding for that rule, identity `<test class>:test-failure`.
- **Known limit.** Because the finding is per class, a second violation of the same rule in a class
  that already violated it on the base is not new. This follows the slice definition (one finding
  per rule and offending class); a per-dependency identity would catch it but would make identities
  depend on the exact violation text.
- **Tests.** `ingesters.test.mjs` (sample report `fixtures/archunit-junit.xml`, schema validity,
  line-shift stability), `java-reports.test.mjs` (glue, path resolution), and a gated e2e case
  (`adapters/java`: a class and a nested class using `java.util.Date` against the fixture's
  `ArchitectureTest` rule).
