# Kotlin preset

Status: slices KT1 (ticket #176), KT2 (ticket #177), KT3 (ticket #178) and KT4 (ticket #179)
implemented.

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
  -> everything the Java preset writes, plus build/nitpicker/{detekt.sarif, kotlin-format.txt}
  -> readJavaFindings(root, { preset: 'kotlin' })   (languages/java/adapters/java-reports.mjs)
       -> readKotlinFindings                         (languages/java/adapters/kotlin-reports.mjs)
  -> compareFindings(base, head, renames)
```

The consumer build is not edited. In modules that apply the Kotlin plugin, the init script
registers `nitpickerDetekt`, `nitpickerKtlint` and `nitpickerKtfmt`, each running from its own
Gradle configuration (`nitpickerDetekt` and so on) so nothing touches the consumer's classpath,
and makes `nitpickerJava` depend on them. The tool versions are in the same pinned map as the
Java ones: detekt 1.23.8, ktlint 1.8.0, ktfmt 0.64. `manifest.json` gains `kotlin: true`,
`kotlinSourceRoots` and `kotlinFormatter`; its `sourceRoots` stay the Java source roots.

## What runs on what

| Tool                                     | Java sources | Kotlin sources | Notes                                                                                                                |
| ---------------------------------------- | ------------ | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| detekt                                   |              | yes            | New. SARIF through the SARIF ingester; tool `detekt`.                                                                |
| ktlint or ktfmt                          |              | yes            | New. One `format` finding per file, like google-java-format; tool `ktlint` or `ktfmt`.                               |
| JaCoCo                                   | yes          | yes            | `line-coverage` and `uncovered-method` (descriptive) and the `changed-branch-coverage` gate for both languages.      |
| PMD, Checkstyle, google-java-format      | yes          | no             | Java-only tools. A Kotlin-only module has no Java files; the tasks are skipped and write empty reports.              |
| SpotBugs                                 | yes          | no             | Runs on the classes compiled from Java only; Kotlin classes are on its auxiliary classpath. See below.               |
| lizard (CRAP of Java)                    | yes          | no             | Java sources only. Kotlin CRAP uses its own complexity, see [CRAP](#crap).                                           |
| PIT                                      | yes          | report-only    | Mutants of Kotlin classes are descriptive and never fail; see [Mutation](#mutation-report-only-for-kotlin).          |
| Structure limits, CRAP, jscpd duplicates | yes          | yes            | Kotlin through `KotlinMetrics.java` and jscpd's `kotlin` format. See below.                                          |
| jdeps (stability direction)              | yes          | yes            | Reads the Java and the Kotlin classes of the module together, one module per source file. See [Coupling](#coupling). |

**PMD and SpotBugs on Kotlin (decision).** PMD has no Kotlin analysis, so nothing is lost: it
keeps running on the Java files of a mixed module. SpotBugs analyzes bytecode, and on
Kotlin-generated bytecode it reports on compiler output the author cannot fix in source (null-check
intrinsics, synthetic accessors, lambdas, `when` tables). It is therefore restricted to the classes
Gradle compiled from Java sources (`compileJava`'s output); detekt is the Kotlin source-level
counterpart. jdeps reads every main class directory (see [Coupling](#coupling)). PIT is not
restricted either: it mutates the Java and the Kotlin classes (see
[Mutation](#mutation-report-only-for-kotlin)).

## detekt

- **Run.** The detekt CLI jar (`detekt-cli:1.23.8:all`) with `--input` the main Kotlin source
  directories, `--report sarif:...` and `--base-path` the project directory. Exit code 2 (findings)
  and 0 are success; any other exit code, or a missing report, fails the Gradle task.
- **Config.** Three layers, later ones win: detekt's default config (`--build-upon-default-config`),
  `config/detekt/detekt.yml` (or `detekt.yml`) in the root project, and Nitpicker's own
  `languages/java/detekt/nitpicker-detekt.yml` with the [one-way rules](#one-way-rules). A rule the
  project sets `active: false` stays off, unless Nitpicker's file turns it on; a rule it omits runs
  with its default.
- **Type resolution.** The task passes `--classpath` and `--jdk-home`, so rules that need types run:
  the module's compile classpath, its compiled Java classes, and the Kotlin standard library that
  detekt itself embeds (2.0.21, pinned as `detektKotlin`), in place of the project's own. detekt 1.23
  cannot read the metadata of a newer standard library, and then no call to it resolves, so
  `run`, `with` and `!!` would pass unseen. A library compiled with a Kotlin newer than 2.1 stays
  unresolved the same way: rules report less on it, never more.
- **Findings.** Rule `detekt.<ruleset>.<Rule>`, for example `detekt.style.MagicNumber`. SARIF
  levels `warning` and `error` are enforceable; a rule the project sets to `severity: info` reports
  `note` and is descriptive.
- **Identity.** The message text through `partialFingerprints["nitpicker/subject"]`, like PMD:
  it names the offending member where detekt says so (``Private property `unused` is unused.``), and
  repeats of one message in a file get `#2`, `#3` in report order. A line never takes part, so a
  moved finding stays baselined. Messages that embed a measured value (`LongMethod`: "too long (62)")
  change identity when the value changes, as for Checkstyle.
- **Exceptions.** For a rule that is not a one-way rule: turn it off or tune it in the detekt config,
  or drop findings under a path with `exclude` in `nitpicker.config.json`. Both are files in the
  repository, so a lifted rule shows up in review. One-way rules have `exceptions` (below).

## One-way rules

The common many-ways spots of Kotlin are narrowed with detekt rules, set in
`languages/java/detekt/nitpicker-detekt.yml`. They are existing detekt rules (no custom rule jar, so
no separate build to ship), turned on and configured. Every message ends with the allowed form;
the gate appends it to detekt's text when detekt's own text does not name it, and appends the
exception route to all of them. Each rule has a banned and an allowed fixture in
`languages/java/adapters/fixtures/kotlin-rules/cases.mjs`.

| Spot              | Banned                                | Allowed                                                           | Rule (detekt)                                                            |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Scope functions   | `run`, `with`, `also`                 | `let` (`value?.let { ... }`) and `apply` (configure an object)    | `style.ForbiddenMethodCall` (`kotlin.run`, `kotlin.with`, `kotlin.also`) |
|                   | `let` or `apply` that changes nothing | call the member directly                                          | `style.UnnecessaryLet`, `style.UnnecessaryApply`                         |
| Nullable handling | `!!`                                  | `?:`, `?.let`, `checkNotNull(value) { "why" }`                    | `potential-bugs.UnsafeCallOnNullableType`                                |
|                   | `value as String` on a nullable value | handle null first, or `as?`                                       | `potential-bugs.CastNullableToNonNullableType`                           |
|                   | `if (x == null) null else ...`        | `x?.let { ... }`                                                  | `style.UseLet`                                                           |
| Coroutines        | `GlobalScope`                         | `coroutineScope { launch { ... } }`, or a scope its owner cancels | `coroutines.GlobalCoroutineUsage`                                        |
|                   | `runBlocking` (import)                | a `suspend` caller (`suspend fun main()`)                         | `style.ForbiddenImport` (`kotlinx.coroutines.runBlocking`)               |
| Records           | a class that only holds data          | `data class`                                                      | `style.UseDataClass`                                                     |
|                   | a `data class` with a `var`           | `val` and `copy(...)`                                             | `style.DataClassShouldBeImmutable`                                       |

Rule ids in findings are `detekt.<ruleset>.<Rule>`. Only main source sets are analyzed, so
`runBlocking` in tests is not seen.

**Why these allowed forms (decision).** One function per job: `let` binds a value to a name for a
block (and is the null-handling form), `apply` configures an object and returns it. `run` and `with`
are `let` with `this`, and `also` is `apply` with `it`, so each is a second way to the same thing.
`let` and `apply` are the ones that cover the other three.

**Owned by Nitpicker.** The file is laid over the project's detekt config, so a project cannot
switch these rules off in `detekt.yml`; its values for the keys the file sets (for example the
`methods` list of `ForbiddenMethodCall`) are ignored. Other rules and keys in the project's config
work as before.

**Exceptions.** A rule that flags legitimate code is lifted for paths with the same `exceptions` key as
the TypeScript preset, `{ "rule", "paths", "reason" }`, all required:

```json
{
  "preset": "kotlin",
  "exceptions": [
    {
      "rule": "detekt.style.ForbiddenImport",
      "paths": ["src/main/kotlin/app/Main.kt"],
      "reason": "The entry point blocks on its coroutine."
    }
  ]
}
```

`rule` is one of the ids above (anything else is a config error naming them). Findings of that rule
under the globs are dropped on both snapshots, like `exclude`, and the exception changes the
analyzer's cache key. The rule is lifted for the whole file, so one exception for
`kotlin.run` also lifts `kotlin.with` and `kotlin.also` there (they share a detekt rule).

**Inline suppression.** `@Suppress("UnsafeCallOnNullableType")` (and `@file:Suppress`, `@SuppressWarnings`,
`names = [...]`) would hide a finding from the report, so a source scan fails any suppression
that names a one-way rule in any form detekt honors (`detekt.Rule`, `detekt:ruleset:Rule`, ...), a
ruleset that contains one (`style`, `potential-bugs`, `coroutines`) or `all`. Rule `inline-suppression`,
tool `detekt`, one finding per token, identified by the token. detekt's own `ForbiddenSuppress` is not
used: it cannot report `all` or `style`, because the suppression hides its report too. The scan reads
string literals of those annotations in `.kt` files of the Kotlin source roots, after removing comments;
a constant used as the argument is not seen.

**Gaps.**

- Custom rules would need a detekt plugin jar built from Kotlin, which the package does not ship; this
  is why `let` is not limited to `?.let` (detekt cannot tell the two apart), `takeIf`, `takeUnless`,
  `lateinit` and unstructured `CoroutineScope(...)` are not covered, and `runBlocking` is found by
  its import (a fully qualified call without an import is not).
- Type resolution reports less where a library is built with a newer Kotlin than detekt's (above);
  `!!` on a value of such a type is not seen.

## Format check: ktlint or ktfmt

The project's formatter is detected, and `kotlin.formatter` overrides it:

1. `"kotlin": { "formatter": "ktlint" | "ktfmt" }` in `nitpicker.config.json`.
2. Otherwise the build files (`build.gradle(.kts)` of the module and the root, `settings.gradle(.kts)`,
   `gradle/libs.versions.toml`) are searched for the names: only `ktfmt` means ktfmt (this finds
   the `com.ncorti.ktfmt.gradle` plugin and Spotless' `ktfmt()`); `ktlint` anywhere, or `ktlint_`
   properties in `.editorconfig`, means ktlint.
3. Otherwise ktlint, the default, with the `ktlint_official` code style unless `.editorconfig` says
   otherwise. A project that names both tools gets ktlint; set the override if it uses ktfmt.

Build logic that lives in `buildSrc` or an included build is not searched; use the override there.

- **ktlint.** The pinned CLI reads the project's `.editorconfig` itself (code style, disabled rules,
  `max_line_length`). A file with any violation is one finding, since most of its rules are
  formatting rules that `ktlint --format` fixes.
- **ktfmt.** `--dry-run` lists the files that would change. The style is `--kotlinlang-style` or
  `--google-style` when the build files name `kotlinLangStyle`/`googleStyle`, else ktfmt's default
  (Meta); `--enable-editorconfig` is passed when the project has an `.editorconfig`.
- **Findings.** Reused from the Java formatter check (`ingestFormatCheck`): rule `format`, identity
  `format`, one enforceable finding per file, tool `ktlint` or `ktfmt`, message `File is not
formatted with ktlint`. A file that already failed on the base stays baselined, new files and
  files that start failing do not.

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
`.java` files were read), so a changed `if`, `when` entry, elvis or `&&` that no test takes fails.

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

One filter removes them, in `kotlin-branches.mjs`: **a Kotlin line counts only when its source text
contains syntax that can branch**: `if`, `when`, `while`, `for`, `do`, `is`, `in`, `as`, `&&`, `||`,
`?.`, `?:`, any of `<`, `>`, `!`, `==` (which also covers `->`, `!!`, `!=`, `<=`), or a call to
`require`, `check`, `assert`, `requireNotNull` or `checkNotNull`. Type arguments (`flow<Int> {`) are
ignored first. A line that only calls something (`yield(1)`, `delay(1)`, `emit(it)`) has no branch
the author wrote, so its outcomes are generated by construction. On the fixture this drops exactly
the 9 coroutine lines and keeps the 5 real misses (a range loop never given a negative bound, an
`if` and an `else -> throw` no test reaches, two `in 90..100 ->` entries). The filter is
conservative: it keeps every line it is unsure of, so the cost is a report of generated outcomes,
never a missed real branch.

Limits. A line that has branching syntax and also a suspension point inside such a lambda
(`if (ready) emit(1)`) still counts the generated outcome: put the suspension call on a line of its
own. A line is judged as a whole, as for Java, and a reformatted line is a changed line. Lines of
inline functions that the compiler copies into other files are not in the report (JaCoCo maps them
outside the file), and a `.kt` file whose name exists only as a generated class source (for example
`Delegates.kt` for inlined stdlib code) is ignored because it is not in the source tree.

## Mutation (report-only for Kotlin)

**Decision: PIT runs on Kotlin classes and its mutants are reported, but as descriptive findings
that never fail the gate.** `mutant-survived` and `mutant-nocoverage` stay enforceable for Java
classes, including the Java classes of a mixed module; for a class whose source file is `.kt` they
are descriptive, next to the `mutation-summary` counts. The reason is measured, below. The
Arcmutate Kotlin plugin, which exists for this problem, is a paid product and is not used.

**What runs.** The Java preset's `nitpickerPit` (PIT 1.17.4, `pitest-junit5-plugin` 1.2.1, default
mutators, the project's own tests) now mutates `sourceSets.main.output.classesDirs`, which holds the
Kotlin classes next to the Java ones; the other class tools keep to `compileJava`'s output. The
ingester finds a class's source file under both kinds of source root from PIT's `sourceFile`.
PIT's built-in `FKOTLIN` filter (on by default) removes only mutants at line 0 of a `.kt` file,
which is not enough.

**Measurement.** The Gradle project `languages/java/ingest/fixtures/kotlin-measurement` has 5
Kotlin files (about 330 lines: sealed classes and data classes, enums, `when` over each subject,
nullables, default arguments, inline functions, loops, `use`, delegates, a value class, coroutines
with `sequence`, `flow`, `async`) and tests for every behavior, though not for every boundary value.
PIT 1.17.4 with default mutators:

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

## Structure limits

The shared structure rule (`shared/rules/structure.mjs`) runs on Kotlin functions: more than 50 lines,
15 statements or 3 parameters, or control nesting deeper than 2, fails with the rule ids
`function-lines-limit`, `function-statements-limit`, `function-parameters-limit` and
`function-control-nesting-limit` and the messages of the other languages, under the tool name
`structure`. A function that already exceeded a limit on the base and was edited fails only when
that number grew (`{name} grew from 4 to 5 parameters (limit 3)...`); a function that only moved,
or was edited without getting worse, stays baselined. That is the shared "only if worse" ratchet,
keyed by function name and occurrence in the file, with a hash of the function text in the identity.
The only exception mechanism is `nitpicker.config.json`: `exclude` drops the findings under a path
(generated code, a legitimately wide function), `thresholds.crapLimit` changes the CRAP limit;
there are no inline disables.

**Metric source (decision).** `languages/java/gradle/KotlinMetrics.java` parses the Kotlin sources
(parse only, no compilation) with the PSI parser of the Kotlin compiler and writes
`build/nitpicker/kotlin-metrics.json`. It runs in Java's single-file source mode in the JVM that
runs Gradle, with `org.jetbrains.kotlin:kotlin-compiler-embeddable` on the class path. The version is
pinned as `kotlinCompiler` in the init script (2.4.21) and resolved from its own Gradle configuration
(`nitpickerKotlinCompiler`), like the other tools. It uses the compiler's PSI classes, so bumping the
pin means running `npm run test:kotlin` again. lizard cannot be the source: it has no statement count
or control nesting, and its Kotlin reader (1.24.1) misreads ordinary Kotlin. It drops extension
functions (`fun String.shout() = ...`), ends an expression-bodied function at the next `fun`, and
turns the `->` of a lambda into an anonymous function that swallows the declarations after it. A
complexity per function from lizard would be attributed to the wrong lines.

**What is measured, all from the one parse, with the definitions of the other languages.**

| Metric              | Definition                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lines`             | Last line minus first line plus 1; annotations and modifiers count, KDoc and comments do not.                                                                                                            |
| `statements`        | Every element of a block (declarations, expressions, `return`), plus the unbraced body of an `if`, `else`, loop or `when` branch that is itself a statement, plus 1 for an expression body.              |
| `maxControlNesting` | Deepest nesting of `if`, `for`, `while`, `do`, `when` (like Java's `switch`) and `catch`; an `else if` nests one level deeper, as in TypeScript and Java. `try` itself and lambdas are not control flow. |
| `parameters`        | Declared value parameters. An extension receiver is not one; a parameter with a default value is.                                                                                                        |
| complexity          | 1 plus each `if`, `for`, `while`, `do`, `when` branch other than `else`, `catch`, `&&`, `                                                                                                                |     | `and`?:`. It is the CRAP input, below. |

A unit is a function with a body, a property accessor with a body, or a secondary constructor with a
block body. Lambdas and local functions count towards the function that contains them; members of
nested, local and anonymous classes and objects are units of their own. Init blocks, property
initializers, primary constructors and functions without a body (abstract, interface, `expect`) are
not units, as initializer blocks are not in the Java preset. Names are `function` (top level),
`Class.function`, `Class.Receiver.function` for an extension, `Class.property.get` for an accessor,
`Class.Class` for a secondary constructor and `<anonymous>` for an object expression. Script files
(`.kts`) are not read.

## CRAP

Kotlin functions get the shared CRAP rule: `crap-score-limit` at a score of 9 or more
(`thresholds.crapLimit` overrides it) and `crap-coverage-unknown` when no coverage is known, tool
`crap`, with the same ratchet for edited functions that were already over the limit. The score is
`ccn^2 * (1 - coverage)^3 + ccn`, with the lower of line and branch coverage, as for Java, and the
CRAP ingester (`ingestCrapFunctions`) is the Java one.

**Complexity and coverage (decisions).** The complexity is the one from `KotlinMetrics.java`, not
lizard's, for the reason above; it counts what lizard counts for Java. Coverage is JaCoCo's per-method
data. The match is by file and line, not by function name, because Kotlin's JVM names do not follow
the source: JaCoCo keys classes by `package/sourcefilename`, so `FileNameKt` facades, companions,
nested classes and `DefaultImpls` of one file are all that file's methods. A JaCoCo method belongs to
the function whose line range holds its first line, unless it lies inside a unit of its own (a member
of a class declared in the function). So the getter `getDoubled` belongs to `val doubled get() = ...`,
the lambda `bump$lambda$0` and a local function belong to the function that declares them, and their
lines and branches are summed into its coverage. The synthetic `name$default` method that Kotlin
generates for default arguments is ignored: it has no source of its own and delegates to the function.
A `@JvmStatic` companion function, which compiles to the function and a static method that delegates
to it on the same line, is counted once, through the method that holds the code. The score of a
function whose range holds no instrumented method is unknown, which is a finding.

**`inline` functions have no CRAP score (decision).** The compiler copies the body of an `inline`
function into every caller and the original is never run, so JaCoCo reports it as uncovered (a
`reified` one as missing), whatever the tests do. A score computed from that could not be brought down
by any test and would fail a complex inline function for good. They are left out of the CRAP rule;
`function-lines-limit` and the other structure limits apply to them as to any function, and a
complex inline function should be split up. The metrics step marks them (`inline: true` in
`kotlin-metrics.json`).

lizard stays in the pipeline for the Java sources of a mixed module (`-l java`); it never reads a
`.kt` file.

## Duplicates

The shared duplicates rule runs on Kotlin: jscpd (the version of the TypeScript preset, mode `mild`)
with `--format kotlin` over each Kotlin source root from the manifest, ignoring `build`, `generated`,
`target` and `out`. Any new clone fails with `duplicate-clone`, tool `duplicates`, identity from the file pair,
the cloned text and the n-th occurrence, never a line. Clones are found within one source root and
within the Kotlin files; a clone between a `.kt` and a `.java` file, or between two source roots, is not
(the same as for several Java roots).

## Coupling

The stability-direction rule runs on Kotlin. `nitpickerJdeps` runs the JDK's `jdeps` over every main
class directory (the Java and the Kotlin one, so references in both directions between the languages
count) and the Nitpicker side builds the package graph as for Java (see the
[Java preset](java-preset.md#coupling-and-stability-ticket-sh6)): a package depending on a less stable
package fails with `stability-direction`, with the report-only coupling metrics beside it.

**Module and package (decisions).** A module is a source file, as in Java and TypeScript. The Kotlin
metrics step lists the JVM class names of each file: its top-level classes, objects and interfaces and
the file facade (`FooKt`, or the `@file:JvmName` name) when the file has top-level functions or properties.
Nested classes, companions, lambdas and `WhenMappings` fold into their outermost class by the `$` in
the name, and classes of one file are merged into one module, so the metrics count files and not the
classes Kotlin generates. The package is the one in the bytecode, that is the `package` statement of
the file and not its directory. A class that no file lists (for example a `@JvmMultifileClass` part)
is its own module.

## Failure policy

As for Java: a Gradle failure on either snapshot (Kotlin does not compile, a test fails, a tool
crashes, a tool jar cannot be downloaded, no `gradle` on the PATH) is one `kotlin/gradle-failure`
finding with classification `tool-error`, which the comparison reports for that snapshot, skipping
the comparison and exiting with 2. Nothing is silently skipped and nothing throws.

## Config keys

`base`, `disable`, `analyzers`, `thresholds`, `exclude`, `legacyInventory` as for the Java preset
(legacy inventory sources are the findings' `identity`, for example
`fp:nitpicker/subject=This expression contains a magic number. ...`). `kotlin.formatter` is new
and valid only with this preset. `exceptions` lifts the [one-way rules](#one-way-rules) per path.
`layout` is a config error.

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
- `languages/java/ingest/kotlin-branches.test.mjs`: the branching-syntax filter, and a JaCoCo report
  recorded from 0.8.12 on the measurement project (`fixtures/jacoco-kotlin.xml`, class elements
  dropped; the project is `fixtures/kotlin-measurement`) that yields exactly the real misses.
- `core/config.test.mjs`, `languages/java/adapters/java-policy.test.mjs`: the config keys (including
  Kotlin `exceptions`) and the runner arguments.
- `languages/java/adapters/kotlin-rules.test.mjs`, `kotlin-suppressions.test.mjs`: every case of
  `fixtures/kotlin-rules/cases.mjs` gets its message from the recorded detekt text and must name the
  allowed form and the exception route; the suppression scan; `core/java-cli.test.mjs` runs an
  exception through the CLI.
- `languages/java/adapters/kotlin-metrics.test.mjs`: structure findings, the JaCoCo method selection
  (facade, accessor, lambda, `$default`, nested function) and the CRAP score and ratchet on recorded
  data; `java-coupling.test.mjs` (Kotlin classes, file modules, stability direction) and the CLI tests
  with the fake `gradle` (structure ratchet, a clone found by jscpd).
- `languages/java/adapters/kotlin-preset.e2e.test.mjs`: real Gradle, behind `NITPICKER_KOTLIN_E2E=1`
  (`npm run test:kotlin`). Needs Java 21, Gradle, lizard (the Java preset's) and network access
  to Maven Central and the Gradle plugin portal. A mixed Kotlin and Java fixture project
  (`languages/java/adapters/fixtures/kotlin-project`): a tested change passes with its legacy detekt
  finding baselined; new detekt and ktlint findings fail; a Java change in the Kotlin module is
  still gated by the Java tools; a detekt config lifts a rule; ktfmt by override and by detection;
  a Kotlin compile error becomes a tool error; for each case of the one-way rules the banned fixture
  fails with the recorded message and the allowed one passes; a project detekt config cannot switch
  a one-way rule off; an exception lifts one rule for one path; a new function over the nesting limit
  fails and a moved legacy function stays baselined; a legacy function that grows past a limit, or
  whose CRAP score rises, fails and one edited without getting worse passes; CRAP over a file facade,
  a class with a secondary constructor, accessor, lambda and default argument; a new clone; a
  stability-direction violation between Kotlin packages, new and baselined; a changed Kotlin branch
  that no test takes fails while its mutants are only reported; a `sequence { }`, `when`, default
  argument, `!!` and `lateinit` fixture with tests for every branch the author wrote passes although
  JaCoCo reports generated outcomes. It needs network access to Maven Central for the Kotlin
  compiler as well.

## Remaining slices

| #   | Slice                                        | Scope                                                                                                                                                       |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KT1 | Gradle integration, detekt, format           | This document: done.                                                                                                                                        |
| KT2 | One-way rules and skill (#177)               | This document: done.                                                                                                                                        |
| KT3 | Structure, CRAP, duplicates, coupling (#178) | Done: structure limits and CRAP from a PSI metrics step (lizard's Kotlin reader is unreliable), jscpd with the Kotlin format and jdeps over Kotlin classes. |
| KT4 | Changed coverage and mutation (#179)         | This document: done. `changed-branch-coverage` on Kotlin with generated-branch filtering; PIT on Kotlin classes, report-only.                               |

## Known limits

- Multi-module builds: every module with the Kotlin plugin gets the tasks, but Nitpicker reads the
  root project's `build/nitpicker`, as for Java.
- Kotlin Multiplatform and Android modules are not covered (`org.jetbrains.kotlin.jvm` only).
- detekt's type resolution uses detekt's own Kotlin standard library (see [detekt](#detekt)), so its
  results can differ from a project's own detekt run, and a library built with a newer Kotlin stays
  unresolved.
- The Kotlin metrics step needs network access to Maven Central for `kotlin-compiler-embeddable`
  (about 60 MB, cached by Gradle) on the first run. It parses with the pinned compiler, so syntax newer
  than that version is read with parse errors tolerated, which can miscount the function that uses it.
- `inline` functions are not measured by CRAP (see [CRAP](#crap)); their structure limits still apply.
- ArchUnit rule tests written in Kotlin run with the other tests, but the resolution of their
  findings to source files is only verified for Java.
