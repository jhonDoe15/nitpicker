# Tests

Part of the [Kotlin preset guide](../kotlin-preset.md).

- `core/command/java/java-cli.test.mjs`: the CLI with the fake `gradle`
  (`languages/java/adapters/fixtures/fake-gradle.mjs`, which writes the Kotlin reports when it sees
  `-Pnitpicker.kotlin=true`, and a JaCoCo or PIT report the test provides): pass, new detekt finding,
  new unformatted file with each formatter, an uncovered changed Kotlin branch, a Kotlin mutant and a
  Java one that fail and a generated Kotlin mutant that does not, baseline expansion, Gradle failure on either snapshot.
- `languages/java/adapters/reporting/kotlin-*-reports.test.mjs` (lint, coverage, metrics): a real detekt SARIF
  (`languages/java/ingest/fixtures/detekt.sarif`, recorded from detekt 1.23.8) and the format list
  through `readJavaFindings`; JaCoCo roots; branch gating of Kotlin files; Kotlin and Java mutants
  being enforceable; the Java preset ignoring Kotlin reports.
- `languages/java/ingest/coverage-reports/kotlin-branches.test.mjs`: the generated-line filter (what it drops and the
  lines it must keep), a JaCoCo report recorded from 0.8.12 on the measurement project
  (`fixtures/jacoco-kotlin.xml`, class elements dropped; the project is
  `fixtures/kotlin-measurement`) that yields exactly the real misses, and a recorded report of
  statements that span lines (`fixtures/jacoco-kotlin-multiline.xml` with its sources in
  `fixtures/kotlin-multiline`), and the measured branch counts of lines that call an inlined
  library function: dropped when the count is the library's, kept with the null-arm hint
  otherwise (negation, wrapped `if (` and `&&` operands, `getOrNull`, `repeat`, an `Array?`
  receiver, a `fun` named like the call). The gated e2e test changes lines that call `orEmpty`,
  `isNullOrBlank` and `maxOf` and expects only the untested `?:`, a `!isNullOrBlank()` and the
  operand of a wrapped `if (` to fail; a second branch adds an `interface`, a `fun interface` and
  exhaustive `when`s over a sealed interface and an enum, all tested, and expects no coverage
  finding.
- `languages/java/ingest/kotlin-mutants/`: every filter rule with the junk it drops and the
  look-alike it keeps (`generated-filter.test.mjs`, `generated-filter-gaps.test.mjs`,
  `generated-filter-precision.test.mjs`), `ingestPit` with and without the filter
  (`pit-generated.test.mjs`), and the real PIT 1.17.4 report of the measurement project with the
  facts of its sources (`kotlin-measurement.test.mjs`: the counts of the unfiltered report, the 45
  mutants left out by rule and the 14 that stay, listed one by one).
  `languages/java/adapters/reporting/kotlin-generated-filter.test.mjs` reads the mutation facts of a
  report directory: a good report, the empty report of a module without Kotlin files, a missing
  one and unusable ones. `languages/java/adapters/kotlin/report-names/kotlin-report-contract.test.mjs`
  fails when the no-Kotlin-files branch of a build tool lacks one of the three reports.
- `languages/java/adapters/kotlin-e2e/mutation/kotlin-mutation-facts.e2e.test.mjs` (with `npm run test:kotlin`):
  the facts program on a source file with every construct the rules use, and on the measurement
  project, whose facts must equal the committed `kotlin-measurement-facts.json`
  (`ingest/kotlin-mutants/test-support/`).
- `languages/java/adapters/kotlin/kotlin-tools.test.mjs`: formatter and ktfmt style detection (Spotless
  blocks, comments, `.editorconfig`, the override), detekt config detection and the override, and
  the Gradle arguments (including `--no-configuration-cache`).
- `languages/java/adapters/kotlin/kotlin-metrics.test.mjs`: structure findings, the JaCoCo method selection
  (facade, accessor, lambda, `$default`, nested function) and the CRAP score and ratchet on recorded
  data; `java-coupling.test.mjs` (Kotlin classes, file modules, stability direction) and the CLI tests
  with the fake `gradle` (structure ratchet, a clone found by jscpd).
- `core/configuration/config.test.mjs`, `languages/java/adapters/java-policy.test.mjs`: the config keys (including
  Kotlin `exceptions`) and the runner arguments.
- `languages/java/adapters/kotlin/rules/kotlin-rules.test.mjs`, `kotlin-suppressions.test.mjs`: every case of
  `kotlin/rules/test-support/kotlin-rule-cases.mjs` gets its message from the recorded detekt text and must name the
  allowed form and end with the exception route; the rule keys and pins of `nitpicker-detekt.yml`
  against `ONE_WAY_RULES`; the suppression scan, with its string and comment traps;
  `core/command/java/java-cli.test.mjs` runs an exception through the CLI.
- `languages/java/adapters/kotlin-e2e/red-base/kotlin-red-base.e2e.test.mjs` (its Java twin is
  `java-e2e/red-base/java-red-base.e2e.test.mjs`, under `NITPICKER_JAVA_E2E=1`): a base whose tests
  fail and a head that repairs them. See "A base whose tests fail" in `usage.md`.
  `red-base/tests-failed.test.mjs` covers the rerun with a fake Gradle.
- `languages/java/adapters/kotlin-e2e/**/*.e2e.test.mjs`: real Gradle, behind `NITPICKER_KOTLIN_E2E=1`
  (`npm run test:kotlin`). Needs Java 21, Gradle and network access
  to Maven Central and the Gradle plugin portal. A mixed Kotlin and Java fixture project
  (`languages/java/adapters/fixtures/kotlin-project`): a tested change passes with its legacy detekt
  finding baselined; new detekt and ktlint findings fail; a Java change in the Kotlin module is
  still gated by the Java tools; a detekt config in `config/detekt.yml` (with a `formatting:`
  ruleset) lifts a rule; ktfmt by override and by detection; no format check without a formatter;
  generated sources are not linted; a Kotlin-only module (a second repository without Java); a
  changed Kotlin branch that no test takes fails together with its surviving mutants, also when the
  statement spans lines or the file is outside its package directory; a
  `sequence { }`, `when`, default argument, `!!` and `lateinit` fixture with tests for every branch
  the author wrote passes although JaCoCo reports generated outcomes; a
  Kotlin compile error becomes a tool error; for each case of the one-way rules the banned fixture
  fails with the recorded message and the allowed one passes; a project detekt config cannot switch
  a one-way rule off, lower its severity or exclude paths, and a config with the `formatting` and
  `compose` rulesets still runs; a `.kts` script in the source directory does not crash detekt;
  `runBlocking` behind a wildcard import is caught; an exception lifts one rule for one path; Kotlin test sources
  (`kotlin-e2e/test-sources/kotlin-test-sources.e2e.test.mjs`) are linted: a legacy broad catch in a test stays baselined when its line
  moves, a new `!!`, `lateinit`, `runBlocking` and misindented line in a test are checked against the
  rules detekt excludes for tests, an inline suppression in a test file is reported, and an exception lifts the
  broad-catch ban for a test path; a new
  function over the nesting limit fails and a
  moved legacy function stays baselined; a legacy function that grows past a limit, or whose CRAP
  score rises, fails and one edited without getting worse passes; CRAP over a file facade, a class
  with a secondary constructor, accessor, lambda and default argument, a lambda property, a file
  outside the directory of its package and a package named `build`; a new clone; and a
  stability-direction violation between Kotlin packages, new and baselined. These cases share one
  head commit and one diff, and the project forces another Kotlin version onto the compiler
  configuration. It needs network access to Maven Central for the Kotlin compiler as well.
- `languages/java/adapters/kotlin/scan/**/*.test.mjs`: each source check on its banned forms and on
  the correct code next to them (aliases, comments, strings, framework annotations), the
  position-keeping scanner, the composition root and the framework allowances.
  `kotlin/rules/kotlin-messages.test.mjs`: every enforceable Kotlin finding ends with the shared
  exception sentence for the rule it prints, the config accepts that rule, and no Kotlin message
  file writes a route of its own except the suppression scan. `kotlin-compiler.test.mjs` and
  `kotlin-class-limits.test.mjs`: the kotlinc lint reader and the class limits.
- `languages/java/adapters/kotlin/review-rules/spring/spring-findings.test.mjs`: the Spring rules on facts
  recorded from `languages/java/adapters/fixtures/kotlin-spring-project` (`kotlin-spring-facts.json`): every
  banned form in `bad/` is reported, nothing in `good/`, every ported rule has a banned case, the ids exist
  in `spring-ruleset.xml` and accept an exception, finality only with the all-open options, and a
  repository declared in Java. `kotlin-e2e/kotlin-spring-rules.e2e.test.mjs` runs the same project through
  real Gradle, checks that the findings equal those of the recorded facts (so the recording stays
  current and the all-open options reach the manifest), and lifts one rule with an exception.
- `languages/java/adapters/kotlin-e2e/kotlin-preset-guards.e2e.test.mjs`: real Gradle on the source
  checks, the compiler warnings and the class limits, banned and allowed, with their exception route
  and an exception for one path.
- `kotlin-psi` on a fixture (units, lambda properties, package, multifile parts, byte
  order mark, parse error, very deep nesting, test roots) is tested in the same opt-in suite, so a bump of
  the pinned compiler is checked
  with `npm run test:kotlin`.
