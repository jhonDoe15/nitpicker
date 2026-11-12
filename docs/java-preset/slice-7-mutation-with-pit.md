# Slice 7: mutation with PIT

Part of the [Java preset guide](../java-preset.md).

- **Profile.** As decided in [`mutation-testing.md`](../mutation-testing.md) (X10): one default
  profile, no wider scope, no score gate. Every main class of the Gradle project is mutated (on each
  path of the compiled main classes, the first package that holds classes: a project rooted in
  `org.example` targets `org.example.*`. PIT refuses `org.*` because it matches PIT's own classes,
  so classes directly in `org` are named one by one), against the project's own tests. The only
  profile can produce enforceable findings. In a comparison, head starts from the base run's results (see
  [Mutation in a comparison](mutation-in-a-comparison.md)).
- **What runs.** `nitpickerPit` (`languages/java/gradle/nitpicker.init.gradle`) runs the pinned `pitest-command-line` (1.22.1, the newest release that still has the history
  [mutation in a comparison](mutation-in-a-comparison.md) uses: 1.23.0 moved it to a commercial plugin) with the test
  plugins the project's framework needs (`pitest-junit5-plugin` 1.2.1, `pitest-testng-plugin`
  1.0.0, both pinned, added on the conditions below), nitpicker's mutator list (see
  [Mutators](../mutation-testing.md#java-and-kotlin-mutators)), XML output, two threads, to
  `pit/mutations.xml` in the report directory. Tests are named class by class (`--targetTests`), and
  `--mutableCodePaths` limits mutation to the main classes. Every test task the build checks (`test`
  and each task `check` depends on) is a run of its own, `nitpickerPit<Task>`, with that task's test
  classes (its `include` and `exclude` patterns applied), its runtime classpath, so tasks on
  different library versions never share one, and, for a JUnit Platform task, its `includeTags` and
  `excludeTags`, which select the tests PIT runs during the green-suite check and mutation testing,
  including method-level tags. Each run also gets the JVM arguments its test task gives the tests,
  because PIT's minion JVMs run them: the task's `jvmArgs`, its `systemProperties` (a property set to
  `null` as `-Dname`, as Gradle passes it), `minHeapSize` and `maxHeapSize` as `-Xms` and `-Xmx`, and
  the arguments of its `jvmArgumentProviders`, except the JaCoCo plugin's agent: PIT measures coverage
  itself, and the agent in every minion would write into the test task's JaCoCo data. So a flag the
  tests need, such as `--add-opens` or BlockHound's `-XX:+AllowRedefinitionToAddDeleteMethods`,
  reaches them. Debug options, `enableAssertions` (`-ea`) and the encoding and locale properties
  Gradle sets on every test JVM are not passed, on Maven neither. The arguments are written one per
  line to a Java argument file, `jvm-arguments` next to the run's `mutations.xml`, and PIT gets
  `--argLine "@<file>"`, so an argument holding spaces, quotes or commas arrives as the tests got it
  (PIT's `--jvmArgs` splits on every comma). On Maven the arguments come from maven-surefire-plugin
  in the module's effective POM, read the way surefire reads them: the `<argLine>` of the
  `default-test` execution (else of the first execution of the `test` goal) or of the plugin, else
  the `argLine` property. A `@{name}` reference takes the value of that POM property, the line is
  split on whitespace with a single- or double-quoted part kept in one argument without its quotes,
  and an argument that still holds a `@{...}` or `${...}` reference is left out whole: JaCoCo's
  `@{argLine}` when the POM defines no `argLine` property (JaCoCo sets it to its agent during the
  build), or a value the effective POM does not resolve, such as `${settings.localRepository}`.
  Then come `<systemProperties>` and
  `<systemPropertyVariables>` as `-Dname=value` (an empty value as `-Dname=`), in that order, so
  they win over an `-D` of the same name in the argLine, as in surefire; an entry whose value holds
  an unresolved reference is left out too. A task the build skips has no run. With more than one
  run, each writes `pit/<task>/mutations.xml` and `nitpickerPit` merges them into `pit/mutations.xml`: a mutant
  counts as killed when any run killed it, as when one run holds every test, which is what Maven's
  single PIT run does. The JUnit Platform is not pinned by
  Nitpicker: the plugin's own platform dependencies are excluded and the project's are used, with a
  launcher of the project's engine version added when the project does not declare one. PIT
  requires a green test run: a failing test suite fails the build. When the failed build left JUnit
  reports with failing tests (the init script lists the report directory of every test task in
  `test-results.json` of the report base), it is a `java/tests-failed` tool error (exit 1) that
  names up to 50 of them with the same text as on Maven (`1 test fails; the build stopped, so no
other check ran. Fix the tests and rerun:`) instead of Gradle's own failure output, with the path
  of the full Gradle log on its last line; otherwise it is a `java/gradle-failure` tool error. Projects without main classes produce no report and no findings.
  The `pitest-junit5-plugin` and the launcher are added only when the project's test runtime has
  `junit-platform-engine`; a JUnit 4 project runs PIT's built-in JUnit 4 support. When the test
  runtime has a `testng` jar, the pinned `pitest-testng-plugin` (1.0.0) is added too, without a
  TestNG of its own: PIT refuses to run a TestNG project without it. Maven builds put the same
  plugins on PIT's classpath on the same conditions. See [Test frameworks](test-frameworks.md).
- **Equivalent mutants.** A survived mutant's message names the common equivalent cases (a
  `compareTo` boundary, a discarded lambda return, a field set to the value it already has, a
  redundant `trim()` or `sorted()`) and the way out: simplify the code, or add an
  `exceptions` entry for `mutant-survived` narrowed to the mutated `function`.
- **The `main` method.** A `mutant-nocoverage` on a line inside the body of a
  `static void main(String[])` method is dropped (`adapters/reporting/main-method.mjs`, after
  every report is read, so it is the same on Gradle and Maven): the method only hands the real
  standard streams to code that tests reach through a writer, so no test runs it. Only that method
  and only the not-covered status: a `main` that a test does run keeps its survived mutants, and
  every other method is mutated as before. The same filter drops the `errorprone/SystemOut` and
  `pmd/SystemPrintln` findings of a line in that body (see
  [Error Prone and NullAway](#error-prone-and-nullaway)). The method is found with the brace-depth
  scan the entry-point detection of the review rules uses (`mainMethodLines` in
  `review-rules/source-declarations.mjs`): any `void main` declared with no parameter or one
  `String[]` parameter, in any modifier order, so the JDK 25 launch-protocol forms count and
  `main(int)` does not. Java files only: Kotlin sources have their own rules.
- **Ingester.** `languages/java/ingest/pit.mjs` (`ingestPit`). PIT statuses map to the names the
  Stryker-based area uses: `SURVIVED` and `NO_COVERAGE` give enforceable `mutant-survived` and
  `mutant-nocoverage`; `TIMED_OUT`, `MEMORY_ERROR`/`RUN_ERROR`, `NON_VIABLE` and `STARTED` give
  descriptive `mutant-timeout`, `mutant-runtimeerror`, `mutant-compileerror`, `mutant-ignored`;
  killed mutants produce no finding. `mutation-summary` carries one descriptive count per status
  (`path` `.`, identity `status:<Status>`).
- **Identity.** `<mutated class>|<method><descriptor>|<mutator>|<description>#<n>`, with every
  package left out: the class is its simple name, `Lcom/shop/Order;` in the descriptor becomes
  `LOrder;` and `com/shop/Order::total` in the description becomes `Order::total` (the symbol
  likewise). The path already tells classes apart, and the gate maps a renamed path to its base
  counterpart, so moving a class to another package keeps its legacy mutants matched. The numbers
  javac gives synthetic names (`lambda$count$0`, the anonymous class `Order$1`) are dropped from the
  class, the method and the description too, so adding a lambda or an anonymous class elsewhere in
  the class, which renumbers the others, keeps their mutants matched. There is no
  line number: `n` is the mutant's position among those with the same key and status, ordered by
  line and then block index, so the numbering follows source order and not PIT's (multi-threaded)
  report order. Edits above a mutant keep it; a second identical mutation in the same method is a
  new occurrence. Removing the first of two identical mutants renumbers the second, which the gate
  then shows as one resolved and one new; this mirrors the TypeScript area's occurrence counter.
  Unlike Stryker, PIT's report has no source text for the mutant, so the key cannot include a hash
  of the mutated expression.
- **Timeouts.** A loop condition forced to `true` (`REMOVE_CONDITIONALS`) or a loop counter that no
  longer moves (`REMOVE_INCREMENTS`) runs until PIT's timeout (4 s plus 1.25 times the normal test
  time) or until the minion runs out of memory. Such mutants are descriptive `mutant-timeout` or
  `mutant-runtimeerror` findings and never fail the gate, but loop-heavy code with slow tests makes
  PIT take longer than the measurement in
  [Mutators](../mutation-testing.md#java-and-kotlin-mutators) suggests.
- **Path.** The source file of the mutated class, found under the manifest's source roots from the
  class's package and PIT's `sourceFile`. Mutants of classes without a source file there
  (generated code) are skipped.
- **Tests.** `ingesters.test.mjs` (sample report `fixtures/pit-mutations.xml`), `java-reports.test.mjs`
  (glue), and gated e2e cases: a tested change with a surviving boundary mutant fails; the clean
  change now adds a test for its new method, because new untested code is a new `mutant-nocoverage`.
