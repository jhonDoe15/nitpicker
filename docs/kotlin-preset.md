# Kotlin preset

Status: slices KT1 (ticket #176) and KT4 (ticket #179) implemented; KT2 and KT3 are planned below.

The Kotlin preset gates a Gradle project with Kotlin JVM modules (`org.jetbrains.kotlin.jvm`),
including modules that mix Java and Kotlin, with the same differential gate as the
[Java preset](java-preset.md): run the tools on the merge base and on head, turn each report into
findings, fail only on new enforceable findings. It is not a second implementation. It shares the
Gradle init script, the runner, the ingesters, the failure policy and the cache with the Java
preset, and adds Kotlin tools next to the Java ones.

## Selection

`"preset": "kotlin"` in `nitpicker.config.json`. Like `java`, it is explicit and never
auto-detected.

**Why a preset of its own and not the Java preset covering Kotlin sources (decision).** The Java
preset already builds a Kotlin module, because the Kotlin plugin applies `java`, but it would
change meaning for every project that already uses it with a Kotlin module the moment it started
running detekt and a Kotlin formatter: new findings and a different tool set under the same key.
A preset of its own is a pure opt-in, so the Java preset's behavior is unchanged by construction
(the Kotlin tasks exist only with `-Pnitpicker.kotlin=true`, which only this preset passes). It
also lets the reports say what ran: the analyzer is named `kotlin`, so a Gradle failure is a
`kotlin/gradle-failure` tool error and `baseline-expansion` findings carry the tool `kotlin`. What
stays shared is everything else: `languages/java/` holds both presets, and `createJavaAnalyzer`
takes `{ kotlin: true }`. A project whose build has no Kotlin module and sets `"preset": "kotlin"`
fails with a tool error saying so.

## How it works

```
gradle -Pnitpicker.kotlin=true -I languages/java/gradle/nitpicker.init.gradle nitpickerJava   (per snapshot)
  -> everything the Java preset writes, plus build/nitpicker/{detekt.sarif, ktlint.sarif | ktfmt.txt}
  -> readJavaFindings(root, { preset: 'kotlin' })   (languages/java/adapters/java-reports.mjs)
       -> readKotlinFindings                         (languages/java/adapters/kotlin-reports.mjs)
  -> compareFindings(base, head, renames)
```

The consumer build is not edited. In modules that apply the Kotlin plugin, the init script
registers `nitpickerDetekt`, `nitpickerKtlint` and `nitpickerKtfmt`, each running from its own
Gradle configuration (`nitpickerDetekt` and so on) so nothing touches the consumer's classpath,
and makes `nitpickerJava` depend on them. The tool versions are in the same pinned map as the
Java ones: detekt 1.23.8, ktlint 1.8.0, ktfmt 0.64. `manifest.json` gains `kotlin: true`,
`kotlinSourceRoots` and `kotlinFormatter`; its `sourceRoots` stay the Java source roots. Which
formatter, ktfmt style and detekt config to use is decided on the Nitpicker side
(`languages/java/adapters/kotlin-tools.mjs`, unit tested) and handed to the init script as Gradle
properties.

## What runs on what

| Tool                                                   | Java sources | Kotlin sources | Notes                                                                                                                   |
| ------------------------------------------------------ | ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| detekt                                                 |              | yes            | New. SARIF through the SARIF ingester; tool `detekt`.                                                                   |
| ktlint or ktfmt                                        |              | yes            | New, when the project uses one. ktlint: one finding per violation, with its rule; ktfmt: one `format` finding per file. |
| JaCoCo                                                 | yes          | yes            | `line-coverage` and `uncovered-method` (descriptive) and the `changed-branch-coverage` gate for both languages.         |
| PMD, Checkstyle, google-java-format                    | yes          | no             | Java-only tools. A Kotlin-only module has no Java files; the tasks are skipped and write empty reports.                 |
| SpotBugs                                               | yes          | no             | Runs on the classes compiled from Java only; Kotlin classes are on its auxiliary classpath. See below.                  |
| PIT                                                    | yes          | report-only    | Mutants of Kotlin classes are descriptive and never fail; see [Mutation](#mutation-report-only-for-kotlin).             |
| lizard (CRAP), structure, duplicates, jdeps (coupling) | yes          | no             | Java sources and classes only until KT3 teaches them Kotlin.                                                            |

**PMD and SpotBugs on Kotlin (decision).** PMD has no Kotlin analysis, so nothing is lost: it
keeps running on the Java files of a mixed module. SpotBugs analyzes bytecode, and on
Kotlin-generated bytecode it reports on compiler output the author cannot fix in source (null-check
intrinsics, synthetic accessors, lambdas, `when` tables). It is therefore restricted to the classes
Gradle compiled from Java sources (`compileJava`'s output); detekt is the Kotlin source-level
counterpart. The same restriction keeps jdeps off Kotlin classes until KT3 gives it a Kotlin-aware path and
source mapping. PIT is not restricted: it mutates the Java and the Kotlin classes (see
[Mutation](#mutation-report-only-for-kotlin)).

## detekt

- **Run.** The detekt CLI jar (`detekt-cli:1.23.8:all`) with `--input` the main Kotlin source
  directories, `--report sarif:...` and `--base-path` the project directory. Exit code 2 (findings)
  and 0 are success; any other exit code, or a missing report, fails the Gradle task. Source
  directories under the build directory (code generated by OpenAPI, protobuf or KSP and added with
  `srcDir`) or outside the project are not analyzed: nobody edits generated code, and the findings
  would be new for every regeneration. Only the main source set is analyzed, as the Java preset's
  PMD and Checkstyle only read main.
- **Config.** The project's detekt config is found at `config/detekt/detekt.yml`,
  `config/detekt.yml` or `detekt.yml` in the project (also with the `.yaml` extension, in that order)
  and set explicitly with `"kotlin": { "detektConfig": "path/inside/the/project.yml" }`, which wins.
  A configured file that does not exist is an error on head (and is ignored on base, so a pull
  request can add the file and the key together). The config is laid over detekt's default config
  (`--build-upon-default-config`): a rule the project sets `active: false` stays off, and a rule it
  omits runs with detekt's default, which is not what the detekt Gradle plugin does without
  `buildUponDefaultConfig`. Nitpicker keeps detekt's defaults on purpose: they are part of the one
  way, and a config that lists only the rules a project wants to turn on would otherwise gate
  almost nothing. Config validation is switched off (`languages/java/detekt/detekt-validation.yml`):
  a config may configure rulesets of detekt plugins, for example `formatting:` of detekt-formatting,
  that the CLI run does not load, and validation would end the run on them. The price is that a
  misspelled key is not reported. Rules that need type resolution do not run (no classpath is
  passed); that is a follow-up.
- **Findings.** Rule `detekt.<ruleset>.<Rule>`, for example `detekt.style.MagicNumber`. SARIF
  levels `warning` and `error` are enforceable; a rule the project sets to `severity: info` reports
  `note` and is descriptive.
- **Identity.** The message text through `partialFingerprints["nitpicker/subject"]`, like PMD,
  with every number replaced by `#`: it names the offending member where detekt says so
  (``Private property `unused` is unused.``), and repeats of one message in a file get `#2`, `#3`
  in report order. A line never takes part, so a moved finding stays baselined. A measured value
  does not take part either (`LongMethod`: "too long (62)", `TooManyFunctions`, complexity,
  nesting depth), so a legacy finding that improves or stays the same stays baselined and only a
  finding that is new fails. A legacy finding whose value gets worse is not new either; limits on
  size and complexity are the structure analyzer's job (KT3).
- **Exceptions.** Turn a rule off or tune it in the detekt config, or drop findings under a path
  with `exclude` in `nitpicker.config.json`. Both are files in the repository, so a lifted rule
  shows up in review. detekt honors `@Suppress("Rule")` and `@file:Suppress` in the source and
  hides the finding from the report; the `inline-suppression` check that fails those is KT2's.

## Format check: ktlint, ktfmt or none

The format check runs only for a project that uses a Kotlin formatter: Nitpicker does not make a
project adopt ktlint's style. `kotlin.formatter` (`"ktlint"`, `"ktfmt"` or `"none"`) overrides the
detection, and every format finding names it.

1. `"kotlin": { "formatter": "ktlint" | "ktfmt" | "none" }` in `nitpicker.config.json`.
2. Otherwise the build files (`build.gradle(.kts)`, `settings.gradle(.kts)`,
   `gradle/libs.versions.toml` of the project root; comments removed) are searched for the names:
   `ktlint` means ktlint, and only `ktfmt` means ktfmt (this finds the Gradle plugins and Spotless'
   `ktfmt()`). A Spotless `kotlinGradle { }` block is not searched, so
   `kotlin { ktfmt() } kotlinGradle { ktlint() }` is a ktfmt project. A project that names both tools
   gets ktlint; set the override if it uses ktfmt.
3. Otherwise `ktlint_` properties in `.editorconfig` mean ktlint.
4. Otherwise none: no format check runs.

Build logic that lives in `buildSrc`, an included build or a submodule is not searched; use the
override there.

- **ktlint.** The pinned CLI reads the project's `.editorconfig` itself (code style, disabled rules,
  `max_line_length`). Each violation is one finding: rule `ktlint.<ruleset>:<rule>` (for example
  `ktlint.standard:no-wildcard-imports`), the line, and ktlint's message. Not every violation is
  fixed by `ktlint --format`; the message says how to lift the rule instead. The identity is the
  message with its numbers replaced, like detekt's. **Exception route.** Turn a rule off in
  `.editorconfig`: `ktlint_standard_no-wildcard-imports = disabled` (`ktlint_<ruleset>_<rule>`),
  or drop findings under a path with `exclude`.
- **ktfmt.** `--dry-run` lists the files that would change. The style is `--kotlinlang-style` or
  `--google-style` when the build files name `kotlinLangStyle`/`googleStyle`, else ktfmt's default
  (Meta); `--enable-editorconfig` is passed when the project has an `.editorconfig`. One `format`
  finding per file, tool `ktfmt`, identity `format`; a file that already failed on the base stays
  baselined, new files and files that start failing do not.

## Coverage

JaCoCo, as for Java: the pinned JaCoCo agent runs the project's tests and the XML report is read
through `ingestJacoco` for both source languages (`kotlinSourceRoots` map the report's package-relative
paths to files). `line-coverage` and `uncovered-method` are descriptive. Kover is not detected: JaCoCo
is applied by the init script whatever the project uses, so a Kover-only project still gets coverage;
reading Kover's own report is a follow-up only if it is wanted.

### Changed-branch coverage (`changed-branch-coverage`)

The rule and its differential mechanics are the Java ones (see
[java-preset.md](java-preset.md#slice-8-gate-on-changed-coverage)): per source line, JaCoCo's covered
and missed branch outcomes; a line below 95% is an enforceable `jacoco` finding whose identity is a
hash of the line's source text, and it is new when its line is in a range `git diff` says changed.
For Kotlin the source text is read from the `.kt` files under `kotlinSourceRoots` (before KT4 only
`.java` files were read), so a changed `if`, `when` entry, elvis or `&&` that no test takes fails, also when the statement spans
lines.

**Generated branches (decision and measurement).** The Kotlin compiler emits branches that have no
source counterpart. JaCoCo 0.8.12 already filters most of them. Verified on real reports of a
fixture whose tests take every branch the author wrote (any missed outcome is then generated by
construction): no branch outcome is reported for null-check intrinsics (parameter checks, `!!`,
`as`, `as?`, platform-type checks, `lateinit` access), `when` over sealed types, enums, integers
and strings (including the implicit throwing `else`), default-argument bridges (`$default`,
`@JvmOverloads`), inline function bodies, `use`, `try`/`finally`, `for` over ranges, collections and
`indices`, `by lazy`, delegated properties, value classes, interface default methods and named
`suspend` functions. What it leaves is the coroutine state machines of suspend lambdas:
`sequence { yield(1) }`, `flow { emit(1) }`, `coroutineScope { ... }`, `a.await()` each report one to
three missed outcomes (the "call returned `COROUTINE_SUSPENDED`" arm no test can take): 9 lines in
the fixture.

One filter removes them, in `kotlin-branches.mjs`, and it fails open: **a Kotlin line is dropped
only when it calls a suspension function and contains nothing that can branch**. The suspension
calls are `emit`, `emitAll`, `yield`, `yieldAll`, `delay`, `await`, `awaitAll`, `withContext`,
`withTimeout`, `withTimeoutOrNull`, `coroutineScope`, `supervisorScope`, `flow`, `channelFlow`,
`callbackFlow` and `sequence` followed by `(` or `{`. What can branch is `if`, `when`, `while`,
`for`, `do`, `is`, `in`, `as`, `&&`, `||`, `?.`, `?:`, any of `<`, `>`, `!`, `==`, a call to
`require`, `check`, `assert`, `requireNotNull`, `checkNotNull`, or an inline standard library
function that branches (`takeIf`, `takeUnless`, `ifEmpty`, `ifBlank`, `orEmpty`, `getOrElse`,
`maxOf`, `minOf`, `coerce*`). The line is judged on its code alone: string literals, comments, type
arguments and `->` are removed first, and a line with a string template (`${`) is always kept.
Every other line is kept, including the continuation lines JaCoCo attributes a branch to when a
statement spans lines (the operand after a trailing `&&`, the `?:` on the next line, the condition
of a multi-line `if (`), because the report has a branch count per line and no instruction detail,
so a line the filter does not recognize is judged as written. On the fixture this drops exactly the
9 coroutine lines and keeps the 5 real misses (a range loop never given a negative bound, an `if`
and an `else -> throw` no test reaches, two `in 90..100 ->` entries). The cost of failing open is a
report of a generated outcome on a line that also branches. It is never a missed real branch.

Limits. A line that branches and also suspends (`if (ready) emit(1)`, `for (n in 1..2) emit(n)`)
counts the generated outcome too, so it can fail with every branch the author wrote taken. The
message then names the call (`Not taken: emit suspending (move the call to its own line if no
branch of yours is untested)`); put the suspension call on a line of its own, or, when that is not
possible, lift the rule for the file with `exclude` in `nitpicker.config.json` (path-level, so it
also stops gating the real branches of that file). A line is judged as a whole, as for Java, and a
reformatted line is a changed line. Lines of inline functions that the compiler copies into other
files are not in the report (JaCoCo maps them outside the file).

**Alternatives not used.** A newer JaCoCo does not remove the coroutine arms (the pin is 0.8.12, and
its `<method>` entries show `invokeSuspend` but no per-branch origin); reading the bytecode for
`COROUTINE_SUSPENDED` checks would need the class files of both snapshots matched to source lines,
which is a larger tool than this filter. The text filter is the smallest thing that is right in the
direction that matters: it only ever hides lines that cannot hold a branch the author wrote.

**Source files.** A report's source file is found as `<root>/<package directory>/<File>.kt` under
the Java and Kotlin source roots, and, when no directory matches (Kotlin style leaves the root
package out of the directory tree, `src/main/kotlin/Flat.kt` with `package demo.flat`), by walking
the source roots for that file name and reading its `package` declaration, which has to equal the
report's package. The same lookup resolves the source file of a PIT mutant. A `.kt` file with
missed branches that is not found, outside the `kotlin` and `kotlinx` packages (inlined standard
library code such as `Delegates.kt`), is a descriptive `branch-source-not-found` finding saying so;
nothing is gated for it.

## Mutation (report-only for Kotlin)

**Decision: PIT runs on Kotlin classes and its mutants are reported, but as descriptive findings
that never fail the gate.** `mutant-survived` and `mutant-nocoverage` stay enforceable for Java
classes, including the Java classes of a mixed module; for a class whose source file is `.kt` they
are descriptive, next to the `mutation-summary` counts. The reason is measured, below. The
Arcmutate Kotlin plugin, which exists for this problem, is a paid product and is not used.

**What runs.** The Java preset's `nitpickerPit` (PIT 1.17.4, `pitest-junit5-plugin` 1.2.1, default
mutators, the project's own tests) now mutates `sourceSets.main.output.classesDirs`, which holds the
Kotlin classes next to the Java ones; the other class tools keep to `compileJava`'s output. The
ingester finds a class's source file under both kinds of source root from PIT's `sourceFile`
(also when the directory does not match the package, as for coverage).
PIT's built-in `FKOTLIN` filter (on by default) removes only mutants at line 0 of a `.kt` file,
which is not enough.

**Cost.** The mutants of Kotlin classes are generated and run although they change no outcome. A
Gradle project of about 200 lines of Kotlin (160 mutants: 66 killed, 51 without coverage, 28
survived, 15 timed out) took PIT 2 minutes on one snapshot, against 45 seconds for JaCoCo, and PIT
runs on the base and on head. A PIT crash on Kotlin bytecode is a Gradle failure and ends the run
with exit code 2 like any other. PIT cannot be turned off for the preset: `disable` takes analyzer
names, and the only analyzer of a Gradle preset is `kotlin` (`"disable": ["mutation"]` is a config
error), so it is all or nothing. Skipping PIT for Kotlin classes, or enforcing their mutants, would
each need a new setting (a `kotlin.mutation` key) or a rule (skip PIT in a module without Java
classes); both are open decisions.

**Measurement.** The Gradle project `languages/java/ingest/fixtures/kotlin-measurement` has 5
Kotlin files (about 330 lines: sealed classes and data classes, enums, `when` over each subject,
nullables, default arguments, inline functions, loops, `use`, delegates, a value class, coroutines
with `sequence`, `flow`, `async`) and tests for every behavior, though not for every boundary value.
Measured in October 2026 with PIT 1.17.4 (default mutators), Kotlin 2.4.21, kotlinx-coroutines 1.9.0
and JaCoCo 0.8.12; the numbers are not checked by CI and move with the tool versions:

| Mutants                                                    | Whole fixture | Without coroutine code |
| ---------------------------------------------------------- | ------------- | ---------------------- |
| Generated                                                  | 240           | 126                    |
| Killed                                                     | 174           | 104                    |
| Timed out (descriptive for Java too)                       | 6             | 3                      |
| Survived or no coverage: would fail the gate               | 60            | 19                     |
| Of those, in compiler-generated code no test can kill      | 46 (77%)      | 11 (58%)               |
| Of those, test gaps (boundary values, a removed `close()`) | 14            | 8                      |

The 46 unkillable ones, by origin: coroutine plumbing `ResultKt.throwOnFailure` removed (25),
generated property accessors of `val` constructor parameters that no test reads (7), return value
of a suspend lambda's `invokeSuspend` (6), null-check intrinsics `Intrinsics.checkNotNull*`
removed (3), the original body of an `inline fun` that tests only run inlined (2), a compatibility
bridge and an interface `DefaultImpls` method (2), a negated conditional in a state machine (1).

**Filters considered.**

- _A filter that cannot remove a real mutant:_ drop the removal of calls to `Intrinsics.*` and
  `ResultKt.throwOnFailure`, and conditional mutants on a line with no branching syntax (the same
  rule as for coverage). It removes 29 of the 46 (17 of the 31 remaining would still be junk, 55%),
  but only 2 of the 11 in code without coroutines (9 of 17 remain, 53%). It is not enough alone.
- _Structural rules_ that would remove the rest: generated accessors, `invokeSuspend` return values,
  inline function bodies, `DefaultImpls`. On this fixture they would leave one junk mutant, but
  each has collateral (real code lives in `invokeSuspend`, and a getter written as `get() = ...`
  is real), and the list is open-ended: serialization plugins' generated serializers, Compose,
  KSP/KAPT output, `$WhenMappings`, mangled value-class functions. A list tuned to a fixture
  would fail agents on mutants it has not seen and cannot be satisfied; the Arcmutate plugin is
  that list, maintained.
- _PIT's `--avoidCallsTo kotlin.jvm.internal.Intrinsics`_ drops every mutant on a line that calls
  the intrinsic, and the compiler puts a parameter check on the function's declaration line, so the
  body of a one-line function with a non-null parameter goes with it. Measured on the fixture: 227
  mutants instead of 240, of which 7 fewer killed (real, killable mutants of ordinary code) and
  only 3 fewer junk survivors; 42 of the 56 mutants that would fail are still junk (75%).

A gate that fails on mutants nobody can fix breaks the premise of the differential gate, so Kotlin
mutation reports for now. Enforcing it needs a filter validated on real projects (or the plugin);
that is a follow-up, and flipping it is the single `reportOnlyKotlinMutants` call in
`languages/java/adapters/java-reports.mjs`. To reproduce the numbers: run
`gradle -Pnitpicker.kotlin=true -I <nitpicker>/languages/java/gradle/nitpicker.init.gradle nitpickerPit`
in that project and read `build/nitpicker/pit/mutations.xml`.

## Failure policy

As for Java: a Gradle failure on either snapshot (Kotlin does not compile, a test fails, a tool
crashes, a tool jar cannot be downloaded, no `gradle` on the PATH) is one `kotlin/gradle-failure`
finding with classification `tool-error`, which the comparison reports for that snapshot, skipping
the comparison and exiting with 2. Nothing is silently skipped and nothing throws.

## Config keys

`base`, `disable`, `analyzers`, `thresholds`, `exclude`, `legacyInventory` as for the Java preset
(legacy inventory sources are the findings' `identity`, for example
`fp:nitpicker/subject=This expression contains a magic number. ...`). `kotlin.formatter` and
`kotlin.detektConfig` are new and valid only with this preset. `layout` and `exceptions` are a
config error.

## Tests

- `core/java-cli.test.mjs`: the CLI with the fake `gradle`
  (`languages/java/adapters/fixtures/fake-gradle.mjs`, which writes the Kotlin reports when it sees
  `-Pnitpicker.kotlin=true`, and a JaCoCo or PIT report the test provides): pass, new detekt finding,
  new unformatted file with each formatter, an uncovered changed Kotlin branch, a Kotlin mutant that
  does not fail and a Java one that does, baseline expansion, Gradle failure on either snapshot.
- `languages/java/adapters/kotlin-reports.test.mjs`: a real detekt SARIF
  (`languages/java/ingest/fixtures/detekt.sarif`, recorded from detekt 1.23.8) and the format list
  through `readJavaFindings`; JaCoCo roots; branch gating of Kotlin files; Kotlin mutants being
  descriptive and Java ones enforceable; the Java preset ignoring Kotlin reports.
- `languages/java/ingest/kotlin-branches.test.mjs`: the generated-line filter (what it drops and the
  lines it must keep), a JaCoCo report recorded from 0.8.12 on the measurement project
  (`fixtures/jacoco-kotlin.xml`, class elements dropped; the project is
  `fixtures/kotlin-measurement`) that yields exactly the real misses, and a recorded report of
  statements that span lines (`fixtures/jacoco-kotlin-multiline.xml` with its sources in
  `fixtures/kotlin-multiline`).
- `languages/java/adapters/kotlin-tools.test.mjs`: formatter and ktfmt style detection (Spotless
  blocks, comments, `.editorconfig`, the override), detekt config detection and the override, and
  the Gradle arguments (including `--no-configuration-cache`).
- `core/config.test.mjs`, `languages/java/adapters/java-policy.test.mjs`: the config keys and the runner
  arguments.
- `languages/java/adapters/kotlin-preset.e2e.test.mjs`: real Gradle, behind `NITPICKER_KOTLIN_E2E=1`
  (`npm run test:kotlin`). Needs Java 21, Gradle, lizard (the Java preset's) and network access
  to Maven Central and the Gradle plugin portal. A mixed Kotlin and Java fixture project
  (`languages/java/adapters/fixtures/kotlin-project`): a tested change passes with its legacy detekt
  finding baselined; new detekt and ktlint findings fail; a Java change in the Kotlin module is
  still gated by the Java tools; a detekt config in `config/detekt.yml` (with a `formatting:`
  ruleset) lifts a rule; ktfmt by override and by detection; no format check without a formatter;
  generated sources are not linted; a Kotlin-only module (a second repository without Java); a
  changed Kotlin branch that no test takes fails while its mutants are only reported, also when the
  statement spans lines or the file is outside its package directory; a
  `sequence { }`, `when`, default argument, `!!` and `lateinit` fixture with tests for every branch
  the author wrote passes although JaCoCo reports generated outcomes; a Kotlin compile error becomes
  a tool error.

## Remaining slices

| #   | Slice                                        | Scope                                                                                                                                                   |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KT1 | Gradle integration, detekt, format           | This document: done.                                                                                                                                    |
| KT2 | One-way rules and skill (#177)               | The Kotlin rules that narrow the language to one way of doing each thing, enforced through detekt and custom rules, and the agent skill for the preset. |
| KT3 | Structure, CRAP, duplicates, coupling (#178) | The shared structure limits, CRAP (lizard has a Kotlin mode), jscpd with the Kotlin format and package coupling from Kotlin sources and classes.        |
| KT4 | Changed coverage and mutation (#179)         | This document: done. `changed-branch-coverage` on Kotlin with generated-branch filtering; PIT on Kotlin classes, report-only.                           |

## Known limits

- Multi-module builds: every module with the Kotlin plugin gets the tasks, but Nitpicker reads the
  root project's `build/nitpicker`, as for Java. A root project that does not apply the Kotlin plugin
  (an aggregator with the code in submodules) writes no reports, which is a tool error saying so; and
  when the root and a submodule both have Kotlin, the submodule's reports are not read. Aggregating
  per-module reports is not done for either preset yet.
- Only main sources are linted, and generated sources under the build directory are skipped.
- Kotlin Multiplatform and Android modules are not covered (`org.jetbrains.kotlin.jvm` only).
- detekt runs without type resolution; its results can differ from a project's own detekt run that
  has a classpath.
- ArchUnit rule tests written in Kotlin run with the other tests, but the resolution of their
  findings to source files is only verified for Java.
