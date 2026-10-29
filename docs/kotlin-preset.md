# Kotlin preset

Status: slices KT1 (ticket #176), KT2 (ticket #177), KT3 (ticket #178) and KT4 (ticket #179) implemented.

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
fails with a tool error saying so, and so does a Maven project (`kotlin/maven-failure`): the
Kotlin tasks live in the Gradle init script, so a Maven project uses the java preset.

## How it works

```
gradle -Pnitpicker.kotlin=true -I languages/java/gradle/nitpicker.init.gradle nitpickerJava   (per snapshot)
  -> everything the Java preset writes, plus {detekt.sarif, ktlint.sarif | ktfmt.txt} in each project's report directory
  -> readJavaFindings(root, { preset: 'kotlin' })   (languages/java/adapters/reporting/java-reports.mjs)
       -> readKotlinFindings                         (languages/java/adapters/reporting/kotlin-reports.mjs)
  -> compareFindings(base, head, renames)
```

The consumer build is not edited. In modules that apply the Kotlin plugin, the init script
registers `nitpickerDetekt`, `nitpickerKtlint` and `nitpickerKtfmt`, each running from its own
Gradle configuration (`nitpickerDetekt` and so on) so nothing touches the consumer's classpath,
and makes `nitpickerJava` depend on them. The tool versions are in the same pinned map as the
Java ones: detekt 1.23.8, ktlint 1.8.0, ktfmt 0.64. `manifest.json` gains `kotlin: true`,
`kotlinSourceRoots` and `kotlinFormatter`; its `sourceRoots` stay the Java source roots. Which
formatter, ktfmt style and detekt config to use is decided on the Nitpicker side
(`languages/java/adapters/kotlin/kotlin-tools.mjs`, unit tested) and handed to the init script as Gradle
properties; the style texts (the `.editorconfig` files to mirror, the ktlint defaults, the detekt
convention layer) are generated on the Nitpicker side into one JSON file in a temporary folder, whose
path is the property `nitpicker.kotlin.styleFile`, and only written out by the init script
(`kotlin-e2e/style/kotlin-style-files.e2e.test.mjs`, in `npm run test:kotlin`, runs its two small tasks
against a stand-in Kotlin plugin).

## What runs on what

| Tool                                                           | Java sources | Kotlin sources | Notes                                                                                                                   |
| -------------------------------------------------------------- | ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| detekt                                                         |              | yes            | New. SARIF through the SARIF ingester; tool `detekt`.                                                                   |
| ktlint or ktfmt                                                |              | yes            | New, when the project uses one. ktlint: one finding per violation, with its rule; ktfmt: one `format` finding per file. |
| JaCoCo                                                         | yes          | yes            | `line-coverage` and `uncovered-method` (descriptive) and the `changed-branch-coverage` gate for both languages.         |
| PMD, Checkstyle, google-java-format, Error Prone with NullAway | yes          | no             | Java-only tools, with the Java preset's suppression and `tools` rules. A Kotlin-only module skips them.                 |
| Review rules (`pmd/...` ids and `unused-option`)               | yes (PMD)    | yes            | On Kotlin the same rule ids come from the PSI facts, not from PMD. See [Review rules](#review-rules).                   |
| SpotBugs                                                       | yes          | no             | Runs on the classes compiled from Java only; Kotlin classes are on its auxiliary classpath. See below.                  |
| Java structure metrics (CRAP of Java)                          | yes          | no             | `StructureMetrics.java`, Java sources only. Kotlin CRAP uses its own complexity, see [CRAP](#crap).                     |
| PIT                                                            | yes          | report-only    | Mutants of Kotlin classes are descriptive and never fail; see [Mutation](#mutation-report-only-for-kotlin).             |
| Structure limits, CRAP, jscpd duplicates                       | yes          | yes            | Kotlin through the `kotlin-psi` program and jscpd's `kotlin` format. See below.                                         |
| jdeps (stability direction)                                    | yes          | yes            | Reads the Java and the Kotlin classes of the module together, one module per source file. See [Coupling](#coupling).    |
| Kotlin source checks                                           |              | yes            | A source scan on the Node side; tool `kotlin-source`. See [Source checks](#source-checks).                              |
| kotlinc lint                                                   |              | yes            | The pinned Kotlin compiler on the main sources; tool `kotlinc`. See [Compiler warnings](#compiler-warnings).            |
| Class limits                                                   |              | yes            | Methods, fields and inheritance depth from the `kotlin-psi` program. See [Class limits](#class-limits).                 |

**PMD and SpotBugs on Kotlin (decision).** PMD has no Kotlin analysis, so it keeps running on the Java files of a
mixed module only; the review rules that PMD runs on Java (`pmd/FixedSleepInTest` and the others) are
evaluated for Kotlin by the facts step (see [Review rules](#review-rules)), and their findings carry the same
`pmd` tool and rule ids. SpotBugs analyzes bytecode, and on
Kotlin-generated bytecode it reports on compiler output the author cannot fix in source (null-check
intrinsics, synthetic accessors, lambdas, `when` tables). It is therefore restricted to the classes
Gradle compiled from Java sources (`compileJava`'s output); detekt is the Kotlin source-level
counterpart. The same restriction keeps PIT's Kotlin mutants out of this tool: PIT mutates the Java and the
Kotlin classes (see [Mutation](#mutation-report-only-for-kotlin)), and jdeps reads every main class directory (see [Coupling](#coupling)).

## detekt

- **Run.** The detekt CLI jar (`detekt-cli:1.23.8:all`) with `--input` the main and test Kotlin source
  directories and `--includes '**/*.kt'` (a `.kts` script under the source directories, for example a
  precompiled Gradle script plugin, crashes detekt's type resolution), `--report sarif:...` and `--base-path` the project directory. Exit code 2 (findings)
  and 0 are success; any other exit code, or a missing report, fails the Gradle task. Source
  directories under the build directory (code generated by OpenAPI, protobuf or KSP and added with
  `srcDir`) or outside the project are not analyzed: nobody edits generated code, and the findings
  would be new for every regeneration. Test sources (the `test` source set, which `compileTestJava` and the
  test compile classpath belong to) are analyzed like main ones, as the Java preset's PMD and
  Checkstyle do. What differs for tests is detekt's own default config, which excludes a rule from
  `**/test/**` where it is noise in tests: `MagicNumber`, `TooManyFunctions`,
  `LateinitUsage`, `SpreadOperator`, `FunctionNaming`, `ForEachOnRange`, `InstanceOfCheckForException`,
  `ThrowingExceptionsWithoutMessageOrCause`, the `KDocReferencesNonPublicProperty` and `Undocumented*` rules. These stay
  off for tests. The [one-way rules](#one-way-rules) are pinned with `excludes: []`, so they apply
  in tests too (`!!`, `GlobalScope`, `runBlocking`, scope functions, the broad catch). A legacy finding in a test
  file is baselined like one in main code, because both snapshots are analyzed with the same init script.
- **Config.** By default detekt runs without the project's config: the layers are detekt's defaults
  (`--build-upon-default-config`), the convention layer (a `style: WildcardImport: active: false`
  file, only when `kotlin.wildcardImports` is `wildcard`), Nitpicker's own
  `languages/java/detekt/nitpicker-detekt.yml` with the [one-way rules](#one-way-rules), and a last file
  that switches validation off. A detekt finding of a rule that is not a one-way rule tells a project
  that has a detekt config how to opt in. Behavior change: a project whose `detekt.yml` set rules is now checked
  with detekt's defaults until it opts in with
  `"tools": { "detekt": { "precedence": ["project", "nitpicker"] } }`; then its config is found at
  `config/detekt/detekt.yml`, `config/detekt.yml` or `detekt.yml` in the head checkout (also with the
  `.yaml` extension, in that order; none found is a tool error) or set explicitly with
  `"kotlin": { "detektConfig": "path/inside/the/project.yml" }`, which wins and, being a named
  file, is used without a `tools` entry. The layers are then, later ones winning: defaults, the
  convention layer, the project's config, Nitpicker's file (with `["nitpicker", "project"]` the
  project's config comes below the convention layer). A configured file that does not exist is an
  error on head (and is ignored on base, so a pull request can add the file and the key together).
  A rule the project sets `active: false` stays off, unless Nitpicker's file turns it on, and a rule
  it omits runs with detekt's default, which is not what the detekt Gradle plugin does without
  `buildUponDefaultConfig`. Nitpicker keeps detekt's defaults on purpose: they are part of the one
  way, and a config that lists only the rules a project wants to turn on would otherwise gate
  almost nothing. Config validation is switched off by a last file
  (`languages/java/detekt/detekt-validation.yml`): a config may configure rulesets of detekt plugins,
  for example `formatting:` of detekt-formatting, that the CLI run does not load, and validation
  would end the run on them. The price is that a misspelled key is not reported.
- **Type resolution.** The task passes `--classpath` and `--jdk-home`, so rules that need types run.
  `--jdk-home` is the JDK of the project's Gradle Java toolchain (`java.toolchain`, `kotlin { jvmToolchain(17) }`)
  when it declares one, otherwise the JDK that runs Gradle. The classpath is
  the module's compile classpath, its compiled Java classes, and the Kotlin standard library that
  detekt itself embeds (2.0.21, pinned as `detektKotlin`), in place of the project's own. detekt 1.23
  cannot read the metadata of a newer standard library, and then no call to it resolves, so
  `run`, `with` and `!!` would pass unseen. A library compiled with a Kotlin newer than 2.1 stays
  unresolved the same way: rules report less on it, never more.
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
- **Exceptions.** Two routes, as in the Java preset. Every detekt finding, one-way rule or not, ends
  with the shared exception sentence for its rule as the finding prints it (`If this is intended, add {"rule":"detekt.style.MagicNumber","paths":[...],"reason":"..."} to "exceptions" in nitpicker.config.json.`),
  the same sentence the Java and TypeScript findings end with: an `exceptions` entry lifts that rule
  for the paths it names. A rule that is not a one-way rule has a second route, the project's detekt
  config, where it can be turned off or tuned; a one-way rule has only the first, because the preset
  pins it (see [Owned by Nitpicker](#one-way-rules)). `exclude` drops findings under a path.

## One-way rules

The common many-ways spots of Kotlin are narrowed with detekt rules, set in
`languages/java/detekt/nitpicker-detekt.yml`. They are existing detekt rules (no custom rule jar, so
no separate build to ship), turned on and configured. Every message names the allowed
form (in detekt's text, or in a sentence the gate appends when detekt's text does not name it) and
ends with the exception route, which the gate appends to all of them. The `inline-suppression`
message names the fix and both routes. Each rule has a banned and an allowed fixture in
`languages/java/adapters/kotlin/rules/test-support/kotlin-rule-cases.mjs`.

| Spot              | Banned                                                                                                                                            | Allowed                                                                                                                      | Rule (detekt)                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Scope functions   | `run`, `with`, `also`                                                                                                                             | `let` (`value?.let { ... }`) and `apply` (configure an object)                                                               | `style.ForbiddenMethodCall` (`kotlin.run`, `kotlin.with`, `kotlin.also`)                           |
|                   | `let` or `apply` that changes nothing                                                                                                             | call the member directly                                                                                                     | `style.UnnecessaryLet`, `style.UnnecessaryApply`                                                   |
| Nullable handling | `!!`                                                                                                                                              | `?:`, `?.let`, `checkNotNull(value) { "why" }`                                                                               | `potential-bugs.UnsafeCallOnNullableType`                                                          |
|                   | `value as String` on a nullable value                                                                                                             | handle null first, or `as?`                                                                                                  | `potential-bugs.CastNullableToNonNullableType`                                                     |
|                   | `if (x == null) null else ...`                                                                                                                    | `x?.let { ... }`                                                                                                             | `style.UseLet`                                                                                     |
| Coroutines        | `GlobalScope`                                                                                                                                     | `coroutineScope { launch { ... } }`, or a scope its owner cancels                                                            | `coroutines.GlobalCoroutineUsage`                                                                  |
|                   | `runBlocking`                                                                                                                                     | a `suspend` caller (`suspend fun main()`); `runTest` in a test                                                               | `style.ForbiddenMethodCall` (`kotlinx.coroutines.runBlocking`)                                     |
| Exceptions        | `catch (e: Exception)`, `Throwable`                                                                                                               | catch the specific exception type; `assertFailsWith` in a test                                                               | `exceptions.TooGenericExceptionCaught`                                                             |
| Records           | a class that only holds `val`s                                                                                                                    | `data class`                                                                                                                 | `style.UseDataClass` (`allowVars: true`)                                                           |
|                   | a `data class` with a `var`                                                                                                                       | `val` and `copy(...)`                                                                                                        | `style.DataClassShouldBeImmutable`                                                                 |
| Output            | `print`, `println`                                                                                                                                | the application logger (`logger.info(...)`)                                                                                  | `style.ForbiddenMethodCall` (`kotlin.io.print`, `kotlin.io.println`)                               |
| Configuration     | `System.getenv` outside the composition root                                                                                                      | read once into a config class in the file with `fun main`, the `@SpringBootApplication` class or a Ktor `Application` module | `style.ForbiddenMethodCall` (`java.lang.System.getenv`)                                            |
| Time              | `Instant.now()`, `LocalDate.now()` and the other `java.time` `now()`, `System.currentTimeMillis()`, `kotlinx.datetime.Clock.System.now()`         | an injected `java.time.Clock`: `Instant.now(clock)`, `clock.millis()`                                                        | `style.ForbiddenMethodCall`                                                                        |
| Randomness        | `Random.nextInt()` on the default generator, `items.random()`, `shuffled()`, `Math.random()`, `ThreadLocalRandom.current()`, `java.util.Random()` | an injected `kotlin.random.Random` (`Random(seed)` in tests)                                                                 | `style.ForbiddenMethodCall`, `style.ForbiddenImport` (`java.util.Random`)                          |
| Blocking          | `Thread.sleep`, `TimeUnit.sleep`                                                                                                                  | schedule the work (`ScheduledExecutorService`) or wait on the condition                                                      | `style.ForbiddenMethodCall`                                                                        |
| Threads           | `Thread(...).start()`, `thread { }`                                                                                                               | a coroutine in a scope its owner cancels, or an injected `ExecutorService`                                                   | `style.ForbiddenMethodCall`                                                                        |
| Processes         | `Runtime.exec`, every overload (the argument-array ones too)                                                                                      | `ProcessBuilder("git", "log", ref)` with an argument list                                                                    | `style.ForbiddenMethodCall` (all overloads)                                                        |
| Deserialization   | `ObjectInputStream(...)`                                                                                                                          | JSON or another data format (kotlinx.serialization)                                                                          | `style.ForbiddenMethodCall` (`java.io.ObjectInputStream.<init>`)                                   |
| Date and time     | `java.util.Date`, `Calendar`, `GregorianCalendar`, `TimeZone`, `SimpleDateFormat`                                                                 | `java.time`; convert a `Date` another API returns with `toInstant()`                                                         | `style.ForbiddenImport`, `style.ForbiddenMethodCall` (the constructors and `Calendar.getInstance`) |
| Comments          | `TODO`, `FIXME`, `XXX`, `HACK` or `STOPSHIP` without an issue (`// TODO fix`)                                                                     | `TODO(#123): ...`, `TODO PROJ-123: ...` or a link                                                                            | `style.ForbiddenComment`                                                                           |
| Parameters        | a parameter the body never reads (main sources); overrides, `main`, annotated functions and `ignored*`/`unused*` names are skipped                | remove the parameter and update the callers                                                                                  | `style.UnusedParameter`                                                                            |

A parameter is unused when the body never reads it. A function is skipped when it overrides something, is `main`, or carries any annotation other than `@Deprecated`, `@Suppress`, `@Throws`, `@JvmStatic`, `@JvmOverloads` and `@JvmName` (the same rule Java's PMD check applies): the annotation means a framework or a reflective caller fixes the signature. A parameter that a signature requires takes a name starting `ignored` or `unused`, the Java convention (Python, TypeScript and JavaScript use a `_` prefix; Kotlin parameters cannot be `_`), or the rule takes an exception. `@Suppress("unused")`, `"UNUSED_PARAMETER"` and `"UNUSED_VARIABLE"` are banned in main sources on a function with parameters (or on a class or file that holds one), because detekt reads them as `UnusedParameter` suppressions; elsewhere they stay allowed, and a rule-set-qualified token such as `style:UnusedParameter` is banned everywhere.

Rule ids in findings are `detekt.<ruleset>.<Rule>`. Test sources are analyzed with the same rules, so
`runBlocking` in a test is a finding too; its message points to `runTest`. A broad catch in a test
(`catch (error: Exception)`) is a finding as well: assert on the specific exception with
`assertFailsWith`, or catch the specific type. No variable name lifts the rule (`catch (ignored:
Exception)` is a finding too); the only exit is an `exceptions` entry with a reason. The calls from
`System.getenv` down to the legacy date classes (legacy date and time, the clock, sleeping,
`Runtime.exec`, Java deserialization, starting threads) each name their allowed form first and count in
main sources only, and so does the literal duplication: both are dropped on `kotlinTestSourceRoots`
after detekt runs, not by a path glob, so a `test` package inside the main sources is still checked.
`Runtime.exec` is banned in every overload, the `String[]` ones included: they skip the shell, but
`ProcessBuilder` is the one way to start a process. Randomness and
`System.currentTimeMillis` are banned in Kotlin as well, and a shell run through
`ProcessBuilder("sh", "-c", ...)` is a [source check](#source-checks). The environment ban is lifted
in the composition root by the gate (a file with a top-level `fun main`, an `@SpringBootApplication`
class or a Ktor `fun Application.module()`), see [Frameworks](#frameworks).

**Why these allowed forms (decision).** One function per job: `let` binds a value to a name for a
block (and is the null-handling form), `apply` configures an object and returns it. `run` and `with`
are `let` with `this`, and `also` is `apply` with `it`, so each is a second way to the same thing.
`let` and `apply` are the ones that cover the other three.

**Owned by Nitpicker.** The file is laid over the project's detekt config. For each of its rulesets
and rules it sets `active: true`, `excludes: []`, `includes: []` and `ignoreAnnotated: []` (the annotation skip of `UnusedParameter` runs after detekt, so that `@Suppress` cannot hide the rule), and for
each rule `severity: warning`, so a project cannot switch these rules off, lower them to `info`
(which the gate reads as descriptive) or skip paths or annotated classes in `detekt.yml`; paths are
lifted only by `exceptions`. A
test keeps the rule keys of the file equal to the rules the gate knows. Other rules and keys in the
project's config work as before. The lists the preset sets are merged: detekt replaces a list
instead of merging it, so Nitpicker reads the project's detekt file and the effective list is the
preset's entries followed by the project's own (strings or `value`/`reason` entries; an entry both
list keeps the preset's reason). That holds for `ForbiddenMethodCall.methods`,
`ForbiddenImport.imports`, `ForbiddenComment.comments` and `UseDataClass.excludeAnnotatedClasses`.
A project can add forbidden calls, imports or comment markers, but never drop one of ours. A method
entry is a method name with an optional parameter list (`java.lang.System.exit` or
`java.lang.Thread.sleep(long)`); an entry of any other shape, a key that is not a list or a file
that does not parse adds nothing. Findings for a project's own entry have the preset's rule id as
well, so an exception lifts them the same way. `UseDataClass` skips classes annotated `@Entity`,
`@Embeddable`, `@MappedSuperclass`, `@Document`, `@Table` or `@Node` (JPA, Spring Data), whose
equality must not become value equality, and a project adds its own annotations to that list.
`UseDataClass` has `allowVars: true`, because `DataClassShouldBeImmutable` bans the `var` in a data
class. Detekt's `ForbiddenClassName` and `PackageNaming` are not used for generic names: the first
matches substrings and the second takes one pattern, which would replace the project's own; the
[source checks](#source-checks) apply the Java preset's generic-name rules instead.

**Exceptions.** A rule that flags legitimate code is lifted for paths with the same `exceptions` key as
the TypeScript preset, `{ "rule", "paths", "reason" }`, all required:

```json
{
  "preset": "kotlin",
  "exceptions": [
    {
      "rule": "detekt.style.ForbiddenMethodCall",
      "paths": ["src/main/kotlin/app/Main.kt"],
      "reason": "The entry point blocks on its coroutine."
    }
  ]
}
```

`rule` is the rule as the finding prints it: any `detekt.<ruleset>.<Rule>`, a
`kotlin-source/<Rule>` of the [source checks](#source-checks), `kotlinc/deprecation`,
`kotlinc/unchecked` or `kotlinc/cast`, one of the [review rules](#review-rules) (`pmd/FixedSleepInTest`,
`pmd/NegativeWaitInTest`, `pmd/DisabledTest`, `pmd/FocusedTest`, `pmd/AssertionInControlFlow`,
`pmd/CoroutineEscapesTest`, `pmd/SpringUnusedContext`, `pmd/ExhaustiveEnumPredicate`,
`pmd/StaticForwardingWrapper`, `pmd/SingularAndPluralMember`, `pmd/ClassLoadEffect`, `unused-option`), a class limit, a file
limit or `test-runtime/slow-test`; for the structure, CRAP and coverage findings below,
`function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`,
`function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown` or `changed-branch-coverage`
with an optional `function` (required for the last one); `duplicate-clone` and `stability-direction`
(the package name as printed, for example `"paths": ["stable"]`) per path; and, for the Java sources of
the project, a Java finding as it is printed, `<tool>/<rule>` (`pmd/UnusedPrivateField`) or
`mutant-survived` and `mutant-nocoverage` for the PIT mutants of Java classes (Kotlin mutants are
report-only and need none). Anything else is a config error naming them. `function` is the name the
finding prints, matched exactly: `Big.run`, `Boot.<init>` for an `init` block, `Boot.table` for a
property initializer that holds a block, a backtick name in full. Every enforceable Kotlin finding ends
with that entry in the shared exception sentence. Findings of that rule under the globs are dropped on
both snapshots, like `exclude`, and the exception changes the analyzer's cache key. The rule is
lifted for the whole file, so one exception for
`kotlin.run` also lifts `kotlin.with`, `kotlin.also` and `runBlocking` there (they share a
detekt rule).

**Inline suppression.** `@Suppress`, `@SuppressWarnings` and `@file:Suppress` (with any use-site target, for
example `@get:Suppress`, and `names = [...]`) would hide a finding from the report, so a source scan
fails every token that targets a detekt or ktlint rule: `all`, anything starting with `detekt`,
`detekt.`, `detekt:`, `ktlint`, `ktlint.` or `ktlint:`, a detekt ruleset (`style`, `naming`, ...) and a
PascalCase rule id (`MagicNumber`), and the compiler warnings the [kotlinc lint](#compiler-warnings)
reports: `UNCHECKED_CAST`, `DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION` and `USELESS_CAST`, whose
message gives the exception route of the `kotlinc/<rule>` it hides. Those four are banned in main
sources only: the kotlinc lint compiles the main sources, so in a test they hide nothing. Other compiler diagnostics stay
allowed. `unused`, `UNUSED_PARAMETER` and `UNUSED_VARIABLE` are banned in main sources when they would hide `UnusedParameter` (detekt honors them as its aliases): on a function or constructor with parameters, or on a class or file that holds one; on a parameterless declaration or in a test they stay allowed, and the message routes to the `detekt.style.UnusedParameter` exception. A rule-set-qualified token (`style:UnusedParameter`, `style.UnusedParameter`) is banned everywhere. Rule `inline-suppression`, tool `detekt`, one finding per
token, identified by the token. detekt's own `ForbiddenSuppress` is not used: it cannot report
`all` or `style`, because the suppression hides its report too. The scan reads the string literals of
those annotations in `.kt` files of the Kotlin source roots, after masking comments (including
nested block comments) and string literals, so a `//` or `/*` inside a string does not hide an
annotation and an annotation inside a string is not one. A constant used as the argument is not
seen. The only routes for generated code are `exclude` and the code itself: `inline-suppression` is
not a rule with `exceptions`.

**Gaps.**

- Custom rules would need a detekt plugin jar built from Kotlin, which the package does not ship; this
  is why `let` is not limited to `?.let` (detekt cannot tell the two apart), `takeIf`, `takeUnless`,
  `lateinit` and unstructured `CoroutineScope(...)` are not covered. `GlobalScope` imported under
  another name (`import kotlinx.coroutines.GlobalScope as G`) is not seen by detekt's rule.
- Type resolution reports less where a library is built with a newer Kotlin than detekt's (above);
  `!!` on a value of such a type is not seen.

## Source checks

A scan of the Kotlin sources on the Node side (`languages/java/adapters/kotlin/scan/`) applies the
preset's source checks, under the tool `kotlin-source`, rule
`<Rule>`; the exception names it `kotlin-source/<Rule>`. It reads the code with comments and string
bodies masked in place, so lines keep their numbers and a rule never matches inside a string or a
comment (the comment rules read the comments). Identity is the rule and a hash of the subject (the
declaration name, or the line text), numbered per file, so a moved finding stays baselined. A file
whose first comment says it is generated (`@generated`, "generated ... do not edit") is skipped.

| Rule                            | Flags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Allowed form                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GeneratedOnHandWrittenCode`    | an annotation named `Generated` (any package, also `@get:`/`@set:`) on a class, object, interface, function or constructor (JaCoCo and PIT skip it), as the Java rule; `@GeneratedValue` and `@Generated` on a property pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | remove it                                                                                       |
| `MutationIgnoreMarker`          | `@DoNotMutate`, `@CoverageIgnore`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | remove it and kill the mutants with a test                                                      |
| `CommentedOutCode`              | a run of line comments, or a block comment, whose first code-shaped line is a declaration, call, assignment, control header, `fun`, `class`, import or return                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | delete it                                                                                       |
| `MutableModuleState`            | a top-level `var`, or a mutable collection, array, atomic or `MutableStateFlow` in a top-level `val`, or either in an `object` or companion object                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | state in an instance the composition root creates and passes in                                 |
| `RepeatedStringLiteral`         | a string of 5 or more characters (with a letter or digit, no `$` template) used three times in a main source file; every use from the third on is reported. A `const val` initializer counts as a use. Not counted: annotation arguments, `when (subject)` branch labels, named arguments (`label = "..."`), map and `to` pair keys, `x["key"]` subscripts, the value of a `"type"`/`"kind"`/`"tag"`/`"variant"` pair, the first argument of a translation or message-key call (`t`, `translate`, `formatMessage`, `getMessage`, `getString`, `gettext` and the like) and idiomatic text (encodings, HTTP methods, MIME types, time formats, argparse actions). Test sources are not scanned | one `private const val NAME = "..."`                                                            |
| `GenericTypeName`               | a class, interface or object named `*Util(s)`, `*Utility`, `*Utilities`, `*Helper`, `*Manager`, `*Common(s)`, `*Misc`; framework roles and a type that extends one with the same ending are skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | a name for the job (`PriceRounder`)                                                             |
| `GenericPackageName`            | a package segment `util`, `utils`, `utility`, `helpers`, `manager`, `common`, `commons`, `misc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | a package named for what it holds; shared pure logic in `shared`                                |
| `LogStringConcatenation`        | an `info`, `warn`, `error`, `log`, `config`, `warning` or `severe` call on a logger (the levels of the Java rule) whose message is a string template, `+` or `format` with a value that is not a compile-time constant (a literal, a `CONSTANT_CASE` name or a `const val` is one)                                                                                                                                                                                                                                                                                                                                                                                                           | placeholders (`log.info("user {}", user)`) or a lambda message (`logger.info { "user $user" }`) |
| `ShellCommand`                  | a shell and its command flag as consecutive literals (`"sh", "-c"`, `"bash", "-c"`, `"cmd", "/c"`, `"powershell", "-Command"`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | the program with an argument list (`ProcessBuilder("git", "log", ref)`)                         |
| `IoCallInLoop`                  | a repository, DAO, JDBC or HTTP client call in a `for`, `while` or `do` body or an iterating lambda (`forEach`, `map`, `filter` and similar); paging and polling loops (a `while` or `do` whose condition, `if (...) break` or `?: break` reads what the call returned) and retries (the call in a `try` that leaves the loop) pass; file calls are not checked                                                                                                                                                                                                                                                                                                                              | fetch or write all items at once (`findAllById`, `saveAll`)                                     |
| `CatchOnlyLogsOrReturnsDefault` | a `catch` that neither throws, nor uses the exception, nor answers with an error response; log calls and `printStackTrace` do not count (so it is the one finding for a catch that only logs); an interrupt and a retry loop are skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                     | rethrow with the cause, or `Result.failure(e)`                                                  |
| `BooleanFlagParameter`          | an unannotated `Boolean` parameter (not a nullable `Boolean?`) of a public function that is the condition of an `if`, a `when` (its subject or a branch of a subject-less one) or a `while`, also as `== true` or in `&&`/`\|\|`, and a name the body rebinds (a loop variable, a lambda parameter, a `val`) is not the flag; private, `internal`, `protected` and `override` functions, functions of a private or `internal` class, local functions, setters, `with*`, `of`/`from`/`valueOf`/`builder` are skipped                                                                                                                                                                          | two functions, an enum or a data class                                                          |
| `HardcodedSecret`               | a secret-looking literal assigned to a name like `*password`, `*secret`, `*token`, `*apiKey`, also as a named argument, a `"key" to "value"` pair or a `"key", "value"` argument pair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | read it from the environment or a secrets manager                                               |
| `CredentialLiteral`             | an AWS key, a GitHub or Slack token, a `sk_live_`/`sk-proj-` key, a private key header, a password in a URL or a `Bearer`/`Basic` value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | the same                                                                                        |
| `SecretInLog`                   | a secret-named value passed to a log call (any level, Android `Log.d` too) or `print`, directly, in a `+`, in a template or in a lambda message (`logger.info { "token $token" }`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | log that it is set, or a masked tail                                                            |
| `SqlStringBuilding`             | SQL text built from a runtime value with a string template, `+`, `String.format` or `.format`: text that starts like a statement or clause in capitals (`SELECT ... FROM`, `UPDATE ... SET`, `AND name =`), or any case when it reaches a JDBC, Spring `JdbcTemplate`, JPA or R2DBC query call directly or through a `val`                                                                                                                                                                                                                                                                                                                                                                   | bind parameters (`?`, `:id`) or a query DSL                                                     |
| `WeakHash`                      | `MessageDigest`, `Signature`, `DigestUtils` with MD2, MD4, MD5 or SHA-1 (a literal, a constant in the file or a commons-codec constant), commons-codec, Spring, Guava and Okio MD5/SHA-1 helpers, and HMAC-MD5 (`Mac`, `KeyGenerator`, `HmacUtils`, its own message); HMAC-SHA1 passes                                                                                                                                                                                                                                                                                                                                                                                                       | SHA-256 or stronger, `HmacSHA256`, Argon2 or bcrypt for passwords                               |
| `TlsVerificationOff`            | an empty `checkServerTrusted`, a host-name verifier or trust strategy that returns `true`, `NoopHostnameVerifier`, `TrustAllStrategy`, `TrustSelfSignedStrategy`, Netty's `InsecureTrustManagerFactory` (its use, not its import)                                                                                                                                                                                                                                                                                                                                                                                                                                                            | trust the CA through a `KeyStore` and `TrustManagerFactory`, or OkHttp `HandshakeCertificates`  |
| `HttpWithoutTimeout`            | a `java.net.http` request built without `.timeout(...)`, an `HttpURLConnection` from an HTTP URL whose block never sets `readTimeout`, `URL(...).readText()`/`readBytes()`/`openStream()`, `RestTemplate()`, `HttpClients.createDefault()`; OkHttp and Ktor pass (their engines set timeouts)                                                                                                                                                                                                                                                                                                                                                                                                | a request timeout, connection timeouts, or a client configured with them                        |
| `UnsafeDeserialization`         | `XMLDecoder`, Jackson `enableDefaultTyping`, `activateDefaultTyping` with `LaissezFaireSubTypeValidator`, `JsonTypeInfo.Id.CLASS`/`MINIMAL_CLASS`, `SerializationUtils.deserialize`, Kryo without class registration (`ObjectInputStream` is detekt's `ForbiddenMethodCall`)                                                                                                                                                                                                                                                                                                                                                                                                                 | JSON into a concrete type (kotlinx.serialization, Jackson), polymorphism by a logical name      |
| `TestHelperInSource`            | a main source that imports JUnit, kotlin.test, Kotest, MockK, Mockito, AssertJ, Truth, Strikt or Hamcrest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | move the helper to the test sources                                                             |
| `TestClassWithoutTestCases`     | (test sources) a class named `*Test`, `*Tests`, `*TestCase` or `*IT` with no test annotation in it; abstract and open classes, Kotest specs and classes with a superclass, suites and `@Nested` are skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | add tests, or rename the helper                                                                 |
| `DetachedTestCase`              | (test sources) a public no-argument function with a block body and no return type (or `: Unit`) named like a test (backticks, `test*`, `should*`) without an annotation, in a class that has tests; a helper or data provider that returns a value passes                                                                                                                                                                                                                                                                                                                                                                                                                                    | annotate it with `@Test`, or make it private                                                    |

A `TODO` without an issue is detekt's `ForbiddenComment` (a one-way rule). A repeated literal is
`kotlin-source/RepeatedStringLiteral`, not detekt's `StringLiteralDuplication` (pinned `active: false`
in the yml, so a project config cannot turn it back on): detekt cannot tell a `when` label, a
translation key or a named argument from a repeated message. The definition is shared with the
Python preset: five characters or more, three uses, tests excluded, and the lists of idiomatic texts,
translation and message-key calls and discriminant keys in
[`shared/literals/repeated-literal-exemptions.mjs`](../shared/literals/repeated-literal-exemptions.mjs).
Repeated literals are the norm in test data, so test sources are not scanned. What differs from the
other languages: Kotlin and Python exempt named arguments (the counterpart of a JSX attribute;
TypeScript and Java have none), Kotlin works on the scanned source without type information (a
`when` label is recognized by its subject and arrow, a translation call by its name), and escape
spellings are not normalized (`"\u0041"` and `"A"` are different texts). The forbidden-API entries of `ForbiddenMethodCall` and `ForbiddenImport`
count in main sources only (`framework-allowances.mjs` drops them on `kotlinTestSourceRoots`): a sleep in
a test is `pmd/FixedSleepInTest` of the [review rules](#review-rules), so each sleep is reported once, and
real time and randomness in unit tests wait for the test-honesty rules.

The security checks are the Kotlin side of the TypeScript and Python sinks. A value in SQL text is
fine when it cannot change the statement: a number literal, a constant (`$TABLE`, `${Tables.ORDERS}`,
a `val` holding a plain literal), `.size` or `.length`, a name whose every declaration in the file
has a number, `Boolean`, `UUID`, date or enum type, a member whose every declaration in the main
sources has one (`${order.id}` with `val id: Long`), placeholders built from placeholders alone
(`ids.joinToString(", ") { "?" }`, `List(n) { "?" }.joinToString(",")`, `"?, ".repeat(n)`), a
`mutableListOf` that only ever receives plain literals joined with a literal separator, and an
`if (...) "..." else "..."` of plain literals. The enums and property types come from every main
Kotlin file of the module.

## Source scans

Two checks read the `.kt` files themselves, after masking comments and string literals (the same
mask as `inline-suppression`), and report as tool `detekt`. Both can flag legitimate code, so both
take an `exceptions` entry per path.

**`catch-log-without-exception`.** A `catch (e: ...)` block that logs a failure must pass the caught
exception itself to the logger, so the stack trace is kept: `log.error("what failed", e)` (SLF4J, Log4j2),
`logger.error(e) { "what failed" }` or `logger.atError { cause = e }` (kotlin-logging),
`logger.log(Level.SEVERE, "what failed", e)` (java.util.logging), `Log.e(TAG, "what failed", e)` (Android).
`e.message`, `e.toString()` and a string template of the exception do not count, and neither does a log
call without the exception. Only the failure levels are checked: `warn` and `error` (and `fatal`), JUL
`warning`, `severe` and `log(Level.SEVERE | WARNING, ...)`, Android `Log.w`, `Log.e` and `Log.wtf`;
`debug`, `info` and `trace` logs in a catch are not findings. These pass as well: the SLF4J 2 fluent API
with the exception anywhere in the chain (`atError().setCause(e).log(...)`, `withThrowable(e)`), a cast of
the exception (`e as Throwable`), and a catch that rethrows `e` or throws a new exception with `e` as an
argument (its cause) after logging. A call is a log call when its receiver (also as `logger?.error(...)`) is
declared from `KotlinLogging.logger`, `LoggerFactory.getLogger`, `LogManager.getLogger` or
`getFormatterLogger`, `Logger.getLogger` or `System.getLogger`, or its name is `log` or `logger` (any case) or ends in one at a
camelCase or underscore boundary (`auditLog`, `appLogger`, `AUDIT_LOG`, `audit_log`; `dialog` and `catalog` are not loggers). The list lives in `languages/java/source/loggers.mjs`. The
innermost catch is the one checked, and a catch of `_`, `ignored...`, `expected...` or `unused...` is left
alone. Main and test sources are scanned. In main sources a catch that does nothing but log is
`kotlin-source/CatchOnlyLogsOrReturnsDefault` and only that (logging alone is not handling, as in the
Python preset), so this check looks at the catches that also handle the error some other way (throw,
return a failure, answer with an error response); in test sources, where that rule does not run, every
catch is checked. One finding per log call, identified by
`catch-log:<receiver>.<level>`.

**`test-without-assertion`.** A test method (`@Test`, `@ParameterizedTest`, `@RepeatedTest`,
`@TestTemplate`, block or expression body, backtick names) that calls no assertion. A call counts when its
name is `assert`, `check`, `verify`, `coVerify`, `expect` or `should` alone or followed by a capital
(`assertEquals`, `assertFailsWith`, `assertThrows`, `verifyOrder`, `expectThat`, `shouldThrow`; Kotest infix
`x shouldBe y` too), or `confirmVerified`, `fail`, `andExpect` or `forAll`. Variables (`expected`) and calls on
a receiver (`checkoutService.run()`) do not count. A test that is `@Test(expected = ...)` is skipped.
The project's own helpers are learned: the convention `kotlin.assertionHelpers` lists the names that end
the last statement of enabled tests without a known assertion in at least three test files, read like
an assertion (`ensure...`, `must...`, `validate...`, `is...`, `has...`, `await...`) and are defined in a test
or test-support source as a function whose body asserts or throws; pin a list of names in `conventions`
to set it yourself. `@Disabled` and `@Ignore` tests are skipped. Kotest specs written as `"name" { ... }` have no `@Test`
and are not scanned. The test sources are the Kotlin directories of the `test` source set.
One finding per test, identified by `test:<name>`.

## Compiler warnings

The task `nitpickerKotlinLint` (`languages/java/gradle/kotlin/kotlin-lint.gradle`) compiles the main
Kotlin sources, generated ones included, with the pinned compiler into a throwaway directory, with the
module's compile classpath, its compiled Java classes, its language and API version, JVM target,
opt-ins, free compiler arguments and compiler plugins, and `-Xrender-internal-diagnostic-names`. The
arguments that silence warnings (`-nowarn`, `-Werror`, `-Xsuppress-warning`, `-Xwarning-level`) are
dropped, so a build setting cannot hide them. Three groups of warnings are findings of the tool
`kotlinc`, on the source roots only, each message naming the allowed form first:

| Rule          | Kotlin diagnostics                               | Allowed form                                                               |
| ------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `deprecation` | `DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION` | the replacement the deprecation names (`ReplaceWith`, or the Java Javadoc) |
| `unchecked`   | `UNCHECKED_CAST`                                 | a typed API, a checked conversion (`as? List<*>`) or a reified function    |
| `cast`        | `USELESS_CAST`                                   | remove the cast                                                            |

Like `-Werror` on changed code: a new warning fails, a legacy one stays baselined (the identity is
the rule and the message with numbers replaced, not the line). Their `@Suppress` is an
`inline-suppression` finding. A lint compile that fails (a compiler plugin it could not load, for
example) is one descriptive `kotlinc/lint-not-run` finding naming the first error.

## Frameworks

Spring is detected from the compile classpath (`spring-context` or `spring-boot`), Ktor from the
source (`fun Application.module()`). What they require is not flagged: the composition root (the file
with `fun main`, the `@SpringBootApplication` class or a Ktor module) may read `System.getenv`;
`runApplication<App>(*args)` and `SpringApplication.run(App::class.java, *args)` are not
`SpreadOperator` findings in a Spring project; JPA and Spring Data entities are not asked to become
data classes; parameters with an annotation (`@RequestParam`, `@PathVariable`) are not boolean flags.

The Java preset's Spring architecture rules (feature layout, layering, bean lifetimes, request data in singletons (a `companion object` property counts as a static field), and the
jMolecules aggregate rules, which also run without Spring; "Spring architecture rules" in
[java-preset.md](java-preset.md)) read compiled classes, so they check Kotlin classes the same way, with the same `archunit/<rule>` exceptions and the same `spring.roles` config
key.

## Review rules

Checks that detekt has no rule for, and in a Spring project the Java preset's Spring rules
([Spring rules](#spring-rules)), run on a syntax tree of the Kotlin sources; the
[test honesty](#test-honesty) rules run on the Kotlin test sources read as masked text. They use the rule
ids and the exception route of the Java preset's PMD rules, so a finding reads the same in both
languages and one `exceptions` entry style covers either.

How it works: task `nitpickerKotlinPsi` compiles the sources of `languages/java/gradle/kotlin-psi/` with the `javac`
of the JVM that runs Gradle, once per build into the root project's `build/tmp/nitpickerKotlinPsi`, and runs them
once per module with the pinned Kotlin compiler's parser. Gradle must run on a JDK (Java 21): on a Java runtime
without `javac` the task fails and says so. One parse
of the main and test source roots writes `kotlin-metrics.json` (main only: structure, CRAP, coupling) and
`kotlin-facts.json` (main and test: classes, functions, properties, calls, type aliases, waits and
comparison chains; for main sources also the calls that run while a file or object loads, and the type or
initializer of each property). The rules are evaluated in Node (`languages/java/adapters/kotlin/review-rules/`) from the
facts, so they have no type resolution. A name is matched through the file's imports and the project's own
declarations, across all modules of the build; a call that cannot be tied to one declaration is left alone, so
an unclear case is not flagged. A file nested deeper than even the large stack of that program allows is
skipped with a note on stderr.

| Rule id                                  | Where                                       | Flags                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FixedSleepInTest`, `NegativeWaitInTest` | `review-rules/tests/test-waits.mjs`         | a fixed wait in a test: `Thread.sleep`, `TimeUnit.X.sleep`, `parkNanos`, `delay` in `runBlocking`, timed `join` or `wait`, `after(ms)`, kotest `continually`, `during`                                                                                            |
| `DisabledTest`                           | `review-rules/tests/honesty/`               | a skipped test: `@Disabled`, `@Ignore`, `@Ignored` (also aliased or carried by an annotation), Kotest `xtest`, `xcontext`, `xdescribe`, `xit`, `xshould`, `xgiven`, a `!` name prefix, a `.config(...)` that never runs, a constant false condition or assumption |
| `FocusedTest`                            | `review-rules/tests/honesty/`               | a Kotest focus that runs only part of the suite: the `f:` name prefix, `ftest`, `fcontext`, `fdescribe`, `fit`, `fshould`, `fgiven`                                                                                                                               |
| `AssertionInControlFlow`                 | `review-rules/tests/honesty/`               | an assertion that can be skipped: inside an `if` or a `when` whose branches do not all assert, a loop, a safe call, `&&`, `\|\|`, `?:`, a swallowing `try` or `runCatching`, or after an early return                                                             |
| `CoroutineEscapesTest`                   | `review-rules/tests/coroutines/`            | a `launch`, `async`, `launchIn`, `stateIn` or `shareIn` on a scope the test does not own (`CoroutineScope(...)`, a scope field, `viewModelScope`) that nothing joins, awaits or cancels                                                                           |
| `StaticForwardingWrapper`                | `review-rules/main/forwarding-wrappers.mjs` | a function whose body only passes its parameters, in order, to another function                                                                                                                                                                                   |
| `SingularAndPluralMember`                | `review-rules/main/member-names.mjs`        | a member and its plural form (`tag` and `tags`) in one class                                                                                                                                                                                                      |
| `SpringUnusedContext`                    | `review-rules/tests/spring-context.mjs`     | a `@SpringBootTest` class that uses nothing from the context                                                                                                                                                                                                      |
| `ExhaustiveEnumPredicate`                | `review-rules/main/enum-predicates.mjs`     | a test that lists only some constants of an enum (`==` chains, `in setOf(...)`), so a constant added later falls into the other case                                                                                                                              |
| `unused-option` (tool `structure`)       | `review-rules/main/unused-options.mjs`      | a defaulted parameter of a private or internal function or constructor that no call sets                                                                                                                                                                          |
| `ClassLoadEffect`                        | `review-rules/main/load-effects.mjs`        | a call with an external effect (database, network, files, processes, threads and pools, JVM-wide settings) that runs while a file, `object`, companion object or enum class loads                                                                                 |

Limits, all chosen to flag less rather than guess:

- Waits: a sleep inside a loop that checks a condition or reads a clock anywhere in its body (a `while`,
  `do`, or a `for` over a range, `until`, `downTo`, `step` or `indices`), in the body of `thread`, `Thread`, `Runnable`, `Callable`, `launch`, `async`, `produce`, `flow`,
  `channelFlow`, `callbackFlow`, `execute`, `submit`, `schedule`, `scheduleAtFixedRate`, `runAsync`,
  `supplyAsync`, `startVirtualThread`, `newThread`, `timer`, `fixedRateTimer` or a mock answer (`thenAnswer`,
  `doAnswer`, `answers`, `coAnswers`), in a `run` override of a `Thread`, or in a test fake that implements or extends a class of the project's main sources
  (in any module of the build) is allowed. A sleep in an inline lambda (`run`, `let`, `also`, `apply`, `with`,
  `repeat`, `takeIf`, `takeUnless`, `use`, `synchronized`, `forEach`, `forEachIndexed`, `onEach`) is judged by
  the loop or body around that lambda. A `for` over a collection is not a polling loop, as in the Java rule.
  `delay` is judged inside `runBlocking`, and inside a block that leaves the test scheduler (see
  [Test honesty](#test-honesty)); `runTest` runs it in virtual time. Only test sources are
  read: a sleep in main sources is `detekt.style.ForbiddenMethodCall` (see [One-way rules](#one-way-rules)).
- Which calls are waits: `Thread.sleep`, `TimeUnit.X.sleep` and `LockSupport.parkNanos`, also through an
  import or an alias of an import (`import java.lang.Thread.sleep as nap`); `join(ms)` and `wait(ms)` on any
  receiver, and `join(Duration)` as a statement; `after(ms)` from Mockito and `during(...)` and `until`
  from Awaitility, with an import of that library; kotest `continually`; Playwright `waitForTimeout`.
  `join`, `wait`, `delay` and `after` called without a receiver are not waits when a function of that name
  is declared anywhere in the project, whichever file declares it (the safer reading, since the declaration
  may be imported). The sleep message names Awaitility only when the module's tests use it.
- Forwarding wrappers: the body is one call that passes every parameter, in order and by name or position
  and without a default, vararg, spread or lambda, to a function with the same parameter types. The target is
  a top-level, `object` or `companion` function declared in the project (matched by name, owner and
  parameter types; imports are not checked), or any function called through a type name
  (`Math.abs(x)`, `Foo.make(x)` for a companion), whose signature cannot be verified. Skipped:
  functions with a receiver, type parameters, annotations, defaults, varargs, no parameters, local
  functions, `override`, `operator`, `infix`, `inline`, `open`, `abstract`, `actual` and `expect`; the names
  `main`, `valueOf`, `fromString`, `of`, `from`, `invoke` and `copy`; copies such as `copyOf`,
  `unmodifiable*`, `synchronized*` and `checked*`; and functions in or below a class with a Spring
  stereotype (`@Component`, `@Service`, `@Repository`, `@Controller`, `@RestController`, `@ControllerAdvice`,
  `@Configuration`, `@SpringBootApplication`).
- Singular and plural: both members must have the same element type (the plural a list, set,
  collection or array of it). Only the primary-constructor properties of a `data class` and the
  properties of a `@ConfigurationProperties` class are inspected.
- Spring context: any injected or mock bean, `MockMvc`, `WebTestClient`, `TestRestTemplate`,
  `CapturedOutput`, `ApplicationEvents`, `ApplicationContext` or a `webEnvironment` with a random or defined
  port counts as use.
- Enum predicate: the enum is found among the Kotlin and Java declarations of the whole build and needs at
  least three constants; one that is not found, a test that lists every constant and a `when` are not
  flagged. The test must be returned, assigned, kept in a variable, the last expression of a lambda, the
  body of a property getter, or the condition of an `if` that has an `else` and is itself one of those.
  Backticked constants (``Status.`in` ``) are matched by their name. A test in a property initializer is
  named after the property (`Holder.isOpen`), as it is in a getter.
- Unused option: a defaulted parameter of a private or internal function that is not `override`, `open`,
  `abstract`, `operator`, `infix` or `main`, has no annotation and is not declared in an interface, or of the
  constructor of a final class without annotations. It is flagged when no call (in main or tests, matched by
  name, through an import alias or a type alias) sets the parameter by name or position, no callable
  reference exists and no Java file mentions the name. A call that cannot match the signature is ignored, a
  call with a spread sets every parameter, and a `copy(name = ...)` call sets that parameter of a data class.
  Data classes are skipped when the module has `jackson-module-kotlin`, `kotlinx-serialization` or
  `moshi-kotlin` on its main compile or runtime classpath (`runtimeOnly` counts), since a library may set the defaults; a library that does so
  without that jar (reflection in a framework) is not seen.
- Class-load effects: load time is a top-level property initializer (it runs when the file's facade
  class loads), the property initializers and `init` blocks of an `object` or companion object, an
  enum entry's arguments and body and the enum class's own properties, `init` blocks and
  constructors, and the members of a class whose companion object creates it in a property
  initializer or `init` block (`companion object { val instance = Registry() }`), directly or through
  a companion function it calls (`val INSTANCE = create()`, one level). A secondary constructor runs
  only when the arguments of such a creation select it over the primary one (by count, names,
  defaults and literal types: `Settings(emptyMap())` does not run `constructor(name: String)`) or
  when a selected one delegates to it with `this(...)`. A function runs at load when one of those
  calls it without a receiver or on `this`, it is a member of the enclosing class, object or
  companion object or a top-level function of the same file (an `object` calling a private
  top-level function counts), and the call's arguments fit it, so of `read(n: Int)` and
  `read(path: String)` only `read(3)`'s overload is followed (one level). `by lazy { }`, getters
  (`val x get() = ...`), functions, `lateinit` and lambdas run later and are allowed, also when they
  create the class (`val instance by lazy { Holder() }`, `val fresh get() = A()`,
  `val make = { C() }`, `::D`); a lambda passed to an inline scope or collection function (`run`,
  `let`, `apply`, `also`, `with`, `use`, `forEach`, `map` and similar) runs at once and is followed,
  unless the receiver is a sequence (`asSequence()`, `sequenceOf`, `generateSequence`,
  `sequence { }`), whose `map` runs nothing. The effects are the Java rule's, with Kotlin's own forms
  added (`File.readText` and the other `kotlin.io` and `kotlin.io.path` file calls, `URL.readText`,
  `exitProcess`, `kotlin.concurrent.timer`, `launch` or `async` on a `CoroutineScope(...)` or
  `MainScope()`, `System.exit`, `Runtime.exit` and `Runtime.halt`, which detekt does not ban), and a
  test (`load-effect-parity.test.mjs`) compares the two rules call by call (`Type#method`), with a
  reason for each pair one side leaves out. Calls detekt already bans in main sources are left to it,
  so each is reported once: `Thread.start`, `Thread.sleep`, `thread { }`, `Runtime.exec`,
  `runBlocking`, `GlobalScope`, `System.getenv` and an imported `TimeZone` (a fully qualified
  `java.util.TimeZone.setDefault(...)`, which no import ban sees, is reported). Without type
  resolution a call counts only when its receiver is known: a type name through an explicit import
  (an alias too), the file's package, a star import or the default imports (in that order, as Kotlin
  resolves them, so a project class named `Files` is not `java.nio.file.Files`), a fully qualified
  name (`kotlin.concurrent.fixedRateTimer(...)` too), a constructor or known factory
  (`HttpClient.newHttpClient()`, `Runtime.getRuntime()`, `Path.of`, `ForkJoinPool.commonPool()`,
  `Executors.newScheduledThreadPool(1)`, a builder's `build()`), or a property of the same file or
  object, read bare or through `this.`, whose declared type or initializer is one of those
  (`private val ok = OkHttpClient.Builder().build()` makes `ok.newCall(request).execute()` a request;
  `val jobs: ScheduledExecutorService` makes `jobs.schedule(...)` one). A local `val` counts only
  inside load-time code. A receiver returned by a function, a parameter, a property of another class,
  and the implicit receiver of `apply`, `with` or `run` (`pool.apply { submit(task) }`) are not
  followed, nor is a helper in another file. The top-level code of a file with `fun main` and an
  `object` or companion object with a `@JvmStatic fun main` are not checked; an `object` in the same
  file as `fun main` is. The message names the call and where it runs
  (`the companion object of Registry loads and creates a Registry (in load, which init calls)`), and
  the identity is the owner, member and call name, with no line number. Kotlin builds with Maven are
  not supported by the Kotlin preset; their Java files get the PMD rule through the Java preset.
- Not covered: Android and Kotlin Multiplatform modules (the facts step is registered for
  `org.jetbrains.kotlin.jvm` only), and source-set `exclude` patterns (every `.kt` file under a source
  directory is read, as for detekt and the other Kotlin steps).

### Test honesty

These rules read the Kotlin test source roots as text with comments and string bodies masked in place
(`review-rules/tests/discovery/` finds the classes, the test functions and the Kotest registrations;
`honesty/` and `coroutines/` hold the rules), so lines keep their numbers and a rule never matches inside a
string or a comment. A finding is named after the test (`OrderTest.second`, or `OrderSpec > group > a`
for Kotest), so a moved test is not a new finding. Files whose header says they are generated are skipped.
The rules run even when the facts step reports nothing, a truncated or unbalanced file is read as far as it
goes, and the time grows about linearly with the size of a file. Besides the test roots, the other Kotlin
source roots of the build (main sources and the other modules, a shared `test-utils` module included) are
read for the few facts that cross files: a class that calls `Dispatchers.setMain`, a Kotest `ProjectConfig`,
annotations, type aliases and `const val` flags.

Discovery: a JUnit 4, JUnit 5, kotlin.test, TestNG or Kotest `AnnotationSpec` function annotated `@Test`,
`@ParameterizedTest`, `@RepeatedTest`, `@TestFactory`, `@TestTemplate`, `@Theory`, `@Property` or `@Example`
in a class (a name in backticks may hold spaces and `(){}=`, and an expression body is a body); and the
registrations of a class whose supertype is a Kotest spec style (a name ending in `Spec`: `FunSpec`,
`StringSpec`, `ShouldSpec`, `DescribeSpec`, `BehaviorSpec`, `FreeSpec`, `WordSpec`, `FeatureSpec`,
`ExpectSpec`) in its constructor lambda (`class S : FunSpec({ ... })`) or an `init` block: `test`,
`context`, `describe`, `it`, `should`, `given`, `when`, `then`, `and`, `feature`, `scenario`, `expect`
with a string literal and a lambda, with or without `.config(...)`, also through an import alias, the string
forms (`"name" { }`, `"name" - { }`, `"name" should { }`) and `withData`. A registration whose lambda holds
more registrations is a container; the others are the test bodies. Registrations are also found inside
`run`, `with`, `apply`, `also`, `let`, `if`, `try` and loops (a registration in a loop is a generated case),
inside an extension function of the same file on a spec, scope or context receiver that the spec calls, and
inside a factory of the same file (`val shared = funSpec { }`, `fun shared() = funSpec { }`) that the spec
`include`s. Not discovered: a member helper that is not an extension, a factory from another file, and a
spec whose supertype is a project class that does not end in `Spec`; such a body is not judged, never
guessed at.

- `DisabledTest`: on a test or on a class (reported once, at the outermost disabled class): `@Disabled`,
  `@Ignore`, `@Ignored`, also through an import alias, a `typealias` or an annotation class of the test
  sources that carries one of them; a Kotest `xtest`, `xcontext`, `xdescribe`, `xit`, `xshould`, `xgiven` (or
  an import alias of one) and a `!` name prefix; a Kotest `.config(...)` that can never run: `enabled = false`,
  `enabled = !true`, `enabled` set to a `const val` that is `false`, `enabledIf = { false }`,
  `enabledOrReasonIf` that returns `Enabled.disabled(...)`, `invocations = 0`; a condition that is constant
  false: `@EnabledIf` naming a function of the test class or its companion object whose body is `false`
  (`@DisabledIf`, `true`), or a Kotest condition class whose `enabled` override is constant (other members
  do not count); and an assumption that can never hold (`assumeTrue(false)`, `assumeFalse(true)`,
  `Assumptions.abort()`). `@EnabledOnOs`, `@EnabledIfSystemProperty`, `@DisabledIfEnvironmentVariable` and an
  assumption on a real condition depend on the environment and are not reported. Allowed: run the test,
  delete it, or limit it to the environment it needs.
- `FocusedTest`: Kotest only (JUnit has no focus). Reported at the outermost focused registration.
- `AssertionInControlFlow`: an assertion inside a construct that can skip it, in a JUnit test or a Kotest
  test body: an `if` or `else`, a `when`, any loop (`for`, `while`, `do`, `repeat`, `forEach`,
  `forEachIndexed`, `onEach` and the other iteration calls), a safe call (`?.let`, `?.also`, `?.run`,
  `?.apply`), `takeIf` or `takeUnless`, the right side of `&&`, `||` or `?:`, a `try` whose `catch` swallows
  the failure (`Throwable`, `Error`, `Exception`, `RuntimeException`, `AssertionError` without a rethrow), a
  `runCatching` not followed by `getOrThrow`, and an `if` that returns early before the assertions. An
  assertion is a call of a real assertion API: `assert*`, kotlin.test and Strikt `expect`, the Kotest
  `should*` matchers, MockK and Mockito `verify` (when the file imports them), Spring `andExpect`, and `fail`,
  `error` or `TODO`; a condition (`if (isValid(x))`) is not read as an assertion. Allowed: an `if`/`else` or a
  `when` whose every branch asserts or fails (a `when` with an `else`, or over `is` types or the constants of
  a sealed type), a check inside Kotest `checkAll`, `forAll`, `forNone`, `forOne`, `forSome` or JUnit
  `assertAll`, `@Property` and `@Example` tests, and generated cases (`@TestFactory`, registrations in a
  loop, `withData`). Allowed form: separate tests or `@ParameterizedTest` with `@MethodSource` or
  `@CsvSource`, Kotest `withData`, one assertion on the whole collection, and `assertNotNull`, `assertIs` or
  `?: fail(...)` to narrow a type instead of an `if` or a safe call. Unlike the Java guard, a loop over the
  results of the code under test is reported too: an empty result checks nothing.
- `CoroutineEscapesTest`: in a test body, a `launch`, `async` or `future`, and a `launchIn`,
  `produceIn`, `stateIn` or `shareIn`, on a scope the test does not own: `CoroutineScope(...)`,
  `MainScope()`, a name declared in the file as a `CoroutineScope` (a field, `lateinit var`, local or
  constructor property; every declaration of the name must be one), a scope a function of the file returns
  (`newScope()`), `lifecycleScope` and `viewModelScope` when no test Main dispatcher is set, `TestScope`
  outside `runTest`, a `GlobalScope` imported under another name, and the same scopes as the receiver of
  `with`, `run`, `apply` or `also` (`with(CoroutineScope(Job())) { launch { } }`). Allowed: structured launches
  (`launch` without a receiver inside `runTest`, `runBlocking`, `coroutineScope`, `supervisorScope` or a
  Kotest body, `backgroundScope`); a `Job` or `Deferred` that the test joins or awaits, alone or kept in a
  collection (`job.join()`, a chained `.await()`, a leading-dot chain, `jobs.first().join()`,
  `values.sumOf { it.await() }`, `joinAll`, `awaitAll`, `cancelAndJoin`, `cancel`); a scope that a teardown of
  the same test class or its superclasses cancels or joins (`@After`, `@AfterEach`, `@AfterTest`, Kotest
  `afterTest`, `afterSpec`, `afterEach`); a latch, a `CompletableDeferred` or a future that the launched block
  completes and the test awaits after the launch, Awaitility and Kotest `eventually`; and a scope built on a
  test dispatcher or on the test context and driven with `advanceUntilIdle`, `runCurrent`, `testScheduler` or
  `runTest`. Plain `GlobalScope` is left to `detekt.coroutines.GlobalCoroutineUsage`, which already reports
  it in tests, so a line is not reported twice. detekt's `CoroutineLaunchedInTestWithoutRunTest` is not in
  the pinned detekt 1.23.8.
- `FixedSleepInTest` for a real `delay` (the same rule id as the other fixed waits), in a test body or a test
  helper: a `delay` in a `withContext` block whose context is `Dispatchers.Default`, `IO` or `Unconfined`,
  `Dispatchers.Main` when no test dispatcher replaces it for the test class (`Dispatchers.setMain` in the
  class, a superclass, a rule field or an extension that calls it), `newSingleThreadContext`,
  `newFixedThreadPoolContext` or an executor's `asCoroutineDispatcher()`, also through a property, a local, a
  constructor default or a later assignment that holds one; in a `launch` or `async` on such a dispatcher that
  the test then joins or awaits; in `runTest(Dispatchers.IO)`; and in a Kotest test body outside `runTest`
  (the body runs on a real dispatcher) unless `coroutineTestScope = true` is set on the spec, on the test's
  `.config(...)` or in a `ProjectConfig`. In a context sum the right-hand dispatcher wins
  (`testDispatcher + Dispatchers.IO` is real). `delay` is matched also through an import alias or the
  qualified `kotlinx.coroutines.delay`, and is skipped where the file or its package defines its own `delay`.
  A loop around the delay that does not wait for a condition (a counted `for`, `repeat`, `while (true)` with
  an unconditional `break`, `do ... while (false)`) does not make it a polling loop. A `withContext` on the
  test dispatcher, a `runTest` inside the real block, a context that is not resolved, background `launch`,
  `async` and `flow` bodies the test does not wait for, polling loops (braced or not), test fakes and delays
  inside `runBlocking` (judged by the runBlocking check above) are not reported.

The Java preset gains guards with the same rule ids (`pmd/DisabledTest`, `pmd/AssertionInControlFlow`) in an
open change; until it lands, these ids are Kotlin only. Its messages start the same way ("Fix or delete this
test instead of disabling it", "Assert unconditionally"), and an `exceptions` entry for either id reads the same
in both presets.

Every message names the allowed form and ends with the exception route. For the pmd-id rules it is
`exceptions` with `pmd/<RuleId>` and a path glob; for `unused-option` it is
`exceptions` with `unused-option`, as in the TypeScript preset. Identities follow the symbol, not the
line, so a moved block is not a new finding.

### Spring rules

In a Spring project (Spring on the compile classpath) the rules of the Java preset's
`spring-ruleset.xml` that make sense in Kotlin run on the main Kotlin sources, with the same ids
(`pmd/SpringProxySelfCall`), the same allowed form written the Kotlin way, and the same exception route.
They live in `review-rules/spring/` and read the facts of [Review rules](#review-rules): annotations
with their arguments, calls with their receiver, chain and scope, catch clauses, `return null`, and the
uses of an `@ExceptionHandler`'s exception.

| Area          | Rules and the Kotlin forms they flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Beans         | `SpringConstructorInjection` (`@Autowired`, `@Inject`, `@Resource` or `@Value` on a property, a `lateinit var` or a setter function, `@Autowired` on the only constructor or on a secondary constructor), `SpringImmutableBeans` (a `var` property or `var` constructor property of a stereotype bean or its `companion object`; `@PersistenceContext` is allowed), `SpringNoServiceLocator` (not in an `ApplicationContextInitializer` or `EnvironmentPostProcessor`, such as a bean-DSL initializer), `SpringNoLazyInjection`, `SpringLiteConfiguration`, `SpringNoComponentScan`, `SpringBeanCollectionState` (a `val` holding `HashMap()`, `mutableMapOf()`, `mutableListOf()`, ... of a singleton bean or its `companion object` changed outside startup and outside `synchronized`, `withLock`, `lock()` or `@Synchronized`, also through `map[key] = value`, `+=`, `cache.apply { put(k, v) }`, `with(cache) { ... }` and `cache.also { it.add(k) }`; a local or parameter of the same name is not the property), `SpringHttpClientPerCall`, `SpringHttpClientTimeouts` (an `apply { setConnectTimeout(...) }` on the construction's own chain, or a setter on its variable in the same function, counts as configured; a qualified `org.springframework.web.client.RestTemplate()` is a construction too), `SpringNoPostConstructIo` (repository, `EntityManager`, JDBC or HTTP calls in `@PostConstruct`, `afterPropertiesSet`, a `@Bean(initMethod = ...)` function, or a private helper only they call) |
| Configuration | `SpringTypedConfiguration` (`@Value` outside `@Configuration` classes, `System.getProperty` of application keys outside `@Configuration`, `@SpringBootApplication`, `EnvironmentPostProcessor`, `ApplicationContextInitializer` and `main`, `Environment.getProperty`, `env["key"]` and `context.environment.getProperty` in beans), `SpringValueSecretDefault` (also `getProperty(key) ?: "default"` and a string-literal default of a secret-named constructor property of a `@ConfigurationProperties` class), `SpringProfileOnConfiguration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Proxies       | `SpringProxyMethodVisibility` (a proxied function that is `private`, `protected`, `final`, in an `object` or `companion object`, or in a class the compiler leaves final), `SpringProxySelfCall` (also `this::name` references and calls that leave out default arguments or pass several varargs; a call inside `other.run { }`, `with(other) { }` or `other.apply { }` goes to `other`), `SpringTransactionalAnnotation`, `SpringNoTransactionalController`, `SpringNoRequiresNew`, `SpringNoSwallowedTransactionException` (a broad or persistence `catch` (Spring `dao`, `transaction`, `orm` and `jdbc`, JPA and Hibernate exceptions) without a throw, or `runCatching` without a later `getOrThrow()` or a `getOrElse`, `onFailure`, `fold`, `recover` or `recoverCatching` whose lambda throws, in a `@Transactional` function or a private helper only it calls; `throw`, `error(...)`, `TODO(...)` and a call to a project function declared `: Nothing` all throw), `SpringTransactionalCheckedRollback` (`@Throws` of a checked exception, or an uncaught `throw` of one in the function, also a project exception extending one, without `rollbackFor`), `SpringTransactionalReadOnlyWrite`, `SpringAsyncExecutor` (also an expression body such as `= CompletableFuture.completedFuture(id)`), `SpringScheduledFixedDelay`                                                                                                                                                                           |
| Web           | `SpringComposedMapping`, `SpringRestController`, `SpringValidRequestBody`, `SpringTypedResponse` (`Any`, `JsonNode`, `Map<String, Any>`, `ResponseEntity<*>`, a list, `Optional`, `Mono` or `Flux` of those, or `null`; without a declared return type, an expression body such as `= mapOf<String, Any>(...)` or one that returns a parameter gives the type), `SpringTypedRequestBody`, `SpringNoErrorLeak` (the stack trace, or the `message`, `localizedMessage` or `toString()` of a generic, JDK or persistence exception or its cause, in a template, concatenation or argument of the response, also through a local `val` and under an aliased `@ExceptionHandler` import; logging it is fine), `SpringNoCrossOrigin`, `SpringCorsWildcard`, `SpringPasswordEncoder`, `SpringPermitAllAnyRequest` (also `authorize(anyRequest, permitAll)` in the Kotlin DSL), `SpringCsrfDisabled` (also `csrf { disable() }`), `SpringHardcodedUser` (also a password held in a local `val` or a property with a string literal)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| JPA           | `JpaLazyFetching`, `JpaEntityClass` (a `data class` entity, or a final one: a class neither `open` nor opened by the all-open plugin, checked only when the build reports the plugin's options), `JpaManyToManyCascade`, `JpaManyToManySet` (a `List`, `MutableList` or `Collection` without `@OrderColumn`), `JpaVersion` (an entity without a superclass, or a class with its own `@Id`, and no `@Version`), `JpaSequenceIds`, `JpaEnumString` (a property of an enum declared in the project (nested enums and Java enums under the Java source roots included) or a JDK enum, without `@Enumerated(EnumType.STRING)`, also in an `@ElementCollection` and as map keys; an auto-applied `AttributeConverter` exempts its type; a computed property with a getter and no backing field, or a delegated one, is not a column), `JpaIdentityHashCode` (a `hashCode` reading the `@GeneratedValue` property, or a `data class` entity with a generated id in its constructor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Spring Data   | `SpringDataDerivedQuery`, `SpringDataNativeQuery` (also `EntityManager.createNativeQuery`; `@Suppress("PMD.SpringDataNativeQuery")` on the function or class allows it), `SpringDataModifyingQuery`, `SpringDataNamedParameters`, `SpringDataQueryTextBlock` (any `+` in `@Query` outside string literals, `const val` names joined too), `SpringDataNoSaveInLoop`, `SpringDataBatchOfOne` (`saveAll(listOf(x))` in a loop), `SpringDataRowWriteInLoop`, `SpringDataSaveInLoopHelper` (also `forEach(this::helper)` and calls that leave out default arguments or pass several varargs), `SpringDataNoFlush`, `SpringDataFilterInQuery` (`findAll()` followed by `filter`, `count`, `any`, `first`, `find`, `size`, `isEmpty` and the like, or by `stream()` and a stream filter)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Kotlin-specific choices:

- Finality. Kotlin classes and functions are final unless `open`, and Spring cannot subclass a final
  class to proxy it. The build tells which classes the compiler opens: the init script reads the
  `allopen` options of `compileKotlin` (`kotlin("plugin.spring")` is the `spring` preset, which opens
  classes annotated with `@Component` or an annotation built on it, such as `@Service`, `@Configuration`
  or `@RestController`, and `@Async`, `@Transactional`, `@Cacheable`, `@SpringBootTest` or `@Validated`) into
  `manifest.kotlinAllOpen` (`{ annotations, presets }`). A proxied function in a class neither `open` nor opened by the plugin is
  flagged, as is an `open` class whose function is not `open`. An annotation the project declares
  itself opens the class only when it carries, up to three levels deep, an annotation the plugin opens
  (`@Service annotation class DomainService`). When the build does not report the
  plugin's options (an older Kotlin Gradle plugin), finality is not checked at all.
- Allowed idioms are not flagged: `data class` DTOs and `@ConfigurationProperties` data classes,
  `runApplication<App>(*args)`, `ObjectProvider<T>`, `@Bean` function parameters, a `companion object`
  factory of a client with timeouts, `HashMap` filled in `init` and then read only.
- Startup and setup. A client built in a `@Bean` function, a constructor, an `init` block, a property
  initializer, a top-level or `object` factory, or a private helper only those call (two levels deep) is
  setup and is checked for timeouts; one built elsewhere is per call. `SpringBeanCollectionState` also
  counts `afterSingletonsInstantiated()` as startup; `SpringNoPostConstructIo` does not, since every
  singleton and proxy exists by then, as in Java.
- Receivers. A call without a receiver inside `x.apply { }`, `x.run { }` or `with(x) { }` goes to `x`,
  `it` inside `x.let { }`, `x.also { }`, `x.takeIf { }` or `x.takeUnless { }` is `x`, and inside an
  extension function it goes to the extended type. Lambda and loop parameters, locals (by declared type,
  constructor call or the name they copy), `Map` views (`values`, `keys`, `entries`) and
  `x.environment` of an application context are typed from there.
- Return types. Without a declared return type, an expression body that names a parameter, calls
  `CompletableFuture.completedFuture`, `supplyAsync`, `runAsync` or `failedFuture`, or calls a
  constructor or `mapOf`, `listOf`, ... with explicit type arguments gives the type.
- Names are resolved from the file's imports (with aliases), qualified names, the file's package and the
  Kotlin default imports, so `jakarta.*` and `javax.*` twins are both known. A star import of a
  project package that declares the name wins; a Kotlin or `java.lang` builtin name such as
  `NumberFormatException` resolves only to the default imports, so `import jakarta.persistence.*` does not turn `NumberFormatException` into a persistence
  exception. A repository is an interface
  that extends a Spring Data repository, directly or through the project's Kotlin interfaces or Java
  interfaces read from the Java source roots.
- One finding per site: `kotlin-source/HttpWithoutTimeout` is dropped where `SpringHttpClientTimeouts` or
  `SpringHttpClientPerCall` reports the same line, since the Spring message names the Spring form. A
  Spring finding lifted by an exception does not drop it.
- Exceptions for `pmd/SpringQueryConcatenation` are accepted, since PMD still checks the Java sources of
  a mixed project with it.
- `System.getenv` is not part of `SpringTypedConfiguration` here: detekt's `ForbiddenMethodCall`
  already bans it outside the composition root (see [One-way rules](#one-way-rules)).
- Loops. A call is in a loop inside a `for`, `while` or `do` body, a `forEach`, `forEachIndexed`, `onEach`
  or `repeat` lambda, or a `map`, `flatMap`, `mapNotNull`, `associate*` lambda on a value whose declared type
  is a collection, sequence, array, map or stream (or a `listOf(...)` or a range). The value may be a
  property chain (`batch.items`, `byId.values`) or a call chain whose head is one
  (`items.filter { ... }.map { ... }`, `items.asSequence().map { ... }`). `map` on a `Mono`,
  `Optional` or a value of unknown type is not a loop. A `for` or `while` body that also calls
  `EntityManager.clear()` is a batch and is not flagged, as in the Java rules. Method references
  (`items.forEach(repository::save)`, `items.forEach(this.repository::save)`) count as calls in the loop.
  A repository receiver may be a local copy (`val r = repository`) or the extended type of an extension
  function (`fun OrderRepository.saveEach(...)`).
- Set-based writes. A repository call in a loop that passes a collection is one statement per batch,
  not a row write: a parameter of a `chunked(n)` or `windowed(...)` lambda or `for` loop, a lambda
  parameter declared as a collection, a destructured map value (`groups.forEach { (_, ids) -> ... }`,
  also `for ((_, ids) in groups)`) or an element of `groups.values` of a declared `Map<K, List<V>>` or of
  a local `val groups = items.groupBy { ... }`, and either side of a local
  `val (open, closed) = items.partition { ... }` all count as collections. A `groups.keys` element or an
  element of one grouped list is still one row.
- One finding per site: `kotlin-source/IoCallInLoop` is dropped where `SpringDataNoSaveInLoop`,
  `SpringDataBatchOfOne`, `SpringDataRowWriteInLoop` or `SpringDataSaveInLoopHelper` reports the same line.

Not ported:

- `SpringQueryConcatenation`: `kotlin-source/SqlStringBuilding` already flags SQL or JPQL built from runtime
  values with templates, `+` or `format` when it reaches a JDBC, `JdbcTemplate`, JPA or R2DBC query call,
  so a second rule would report the same line.
- The Lombok part of `JpaIdentityHashCode`: Lombok does not process Kotlin; a `data class` entity is the
  Kotlin form of `@Data` and is reported instead.
- `SpringUnusedContext` runs on Kotlin tests already (see the table above).

## Format check: ktlint, ktfmt or none

The format check runs only for a project that uses a Kotlin formatter: Nitpicker does not make a
project adopt ktlint's style. `kotlin.formatter` (`"ktlint"`, `"ktfmt"` or `"none"`) overrides the
detection, and every format finding names it. The head checkout's choice
is read once and handed to the base run through the head policy, so a change that adds ktlint or
ktfmt checks the base with the same formatter and legacy formatting is not a new finding.

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

- **ktlint.** The pinned CLI runs on a copy of the Kotlin sources in a temporary folder whose root
  `.editorconfig` says `root = true`, so no `.editorconfig` of the project or of the folders above it
  reaches it (a parent `.editorconfig` and the home one are ignored too). A project whose
  `.editorconfig` set ktlint properties is checked with ktlint's defaults and the conventions
  followed until it opts in with `"tools": { "ktlint": { "precedence": ["project", "nitpicker"] } }`;
  then every `.editorconfig` under the project (build folders, `node_modules` and dot tool folders
  skipped) and in the folders above it up to the repository root is copied to the same relative
  path in the copy, so nested files and path-qualified sections (`[src/test/**.kt]`) keep applying;
  only the topmost one gets `root = true`, and the conventions are ktlint defaults below them. The
  opt-in needs an `.editorconfig` at the project root or above, else it is a tool error that says to
  create one or remove `"project"`. `["nitpicker", "project"]` is a config error for ktlint, since
  ktlint always reads its `.editorconfig` first. The conventions (`kotlin.lineLength`, `kotlin.indentation` and the others) take their values from the detekt, ktlint and ktfmt configs of the merge base in a comparison, and from the branch only when the base has no Kotlin sources, so a pull request cannot raise its own limit by editing them. The same values are enforced in the run: the followed `indent_size`, `max_line_length`, trailing-comma and wildcard-import values are appended after the matching section of every mirrored `.editorconfig` (nested and parent ones too) that sets them differently, and the followed detekt conventions are layered last in a file of their own, so an edited width in the branch changes neither the run nor the printed line. The run prints once what ktlint runs with and what
  to do to lift a rule, and one `Ignoring .editorconfig; opt in with ...` line when a project
  `.editorconfig` exists and is not used. Each violation is one finding: rule
  `ktlint.<ruleset>:<rule>` (for example `ktlint.standard:no-wildcard-imports`), the line, and
  ktlint's message plus a pointer to that advice. Not every violation is fixed by `ktlint --format`.
  The identity is the message with its numbers replaced, like detekt's.

Two styles are equally valid in each of these, so the preset follows the project (the
[`conventions`](usage.md#configuration) key pins them). Which formatter applies which id:

| Id                       | ktlint                           | ktfmt                                | no formatter | detekt                          |
| ------------------------ | -------------------------------- | ------------------------------------ | ------------ | ------------------------------- |
| `kotlin.indentation`     | `indent_size`                    | style `meta` (2) or `kotlinlang` (4) | not offered  | -                               |
| `kotlin.trailingCommas`  | `ij_kotlin_allow_trailing_comma` | not offered (ktfmt always adds them) | not offered  | -                               |
| `kotlin.wildcardImports` | disables `no-wildcard-imports`   | -                                    | -            | `WildcardImport: active: false` |
| `kotlin.lineLength`      | `max_line_length`                | `--max-width`                        | not offered  | `MaxLineLength: maxLineLength`  |

`kotlin.lineLength` is any number of columns (`100`, `120` and `140` are the measured ones; an `.editorconfig` or detekt width such as 110 is followed as it is) and has no default. It is measured like `python.lineLength`: the
longest line that could have been wrapped, against the shortest join of a wrapped argument list, and
else the lines that run past 100 or 120. With no clear answer each tool keeps its own width.
An id the formatter cannot apply is neither measured nor printed, and pinning it is a config error.
`java.indentation` (google-java-format `2` or `--aosp` 4, or `tab`; palantir-java-format is always 4, see `java.formatter` and `java.lineLength` in the [Java preset](java-preset.md#style)) is the Java twin of `kotlin.indentation` and
applies to the Java sources of the same project; the difference is the default: `java.indentation`
falls back to 2 (google-java-format's), while `kotlin.indentation` has none, because ktfmt's default
is 2 and ktlint's is 4, so with no clear majority the tool keeps its own. For ktlint the choices are a
defaults `.editorconfig` (`--editorconfig`) below the root file of the copy, for detekt a layer below
the project's `detekt.yml`. The scope-function rules do not change. With the project listed, a key the
project sets wins for every tool and the run prints it as "from your .editorconfig", "from your detekt
config" or "from your build file" instead of "used by N of M measured files".

- **ktfmt.** `--dry-run` lists the files that would change. The style is the one the build names
  (`kotlinLangStyle()`, `googleStyle()` or `metaStyle()`), with or without the ktfmt opt-in: which
  formatter a project uses, and the style it declares for it, are facts about the project, like the
  Java preset's declared formatter, so they are read from the build files at the merge base and
  indent `kotlin.indentation` accordingly ("from your build file"). Without a named style it is
  `--kotlinlang-style` when most Kotlin files indent by 4 (`kotlin.indentation`), else ktfmt's
  default (Meta). Config files are different: an `.editorconfig` is read only with
  `"tools": { "ktfmt": { "precedence": ["project", "nitpicker"] } }`, which passes
  `--enable-editorconfig` and runs in a copy of the sources with the same mirrored `.editorconfig`
  files as ktlint; without it ktfmt runs in the project, without a copy of the sources. `["nitpicker", "project"]` is a
  config error for ktfmt, as ktfmt has no flag to ignore the `.editorconfig` once enabled. One
  `format` finding per file, tool `ktfmt`, identity `format`, whose message refers to the
  `Format with ktfmt` command printed at the start of the run; a file that already failed on the base
  stays baselined, new files and files that start failing do not.

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
possible, accept the function with an `exceptions` entry for `changed-branch-coverage` that names it
(`function` is required; the name is the one the structure findings print, from the Kotlin metrics,
and only that function's branches are accepted), or `exclude` the file in `nitpicker.config.json`
(path-level, so it also stops gating every other finding of that file). A line is judged as a whole, as for Java, and a
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

**What runs.** The Java preset's `nitpickerPit` (PIT 1.17.4 with the test plugins the project's
framework needs, `pitest-junit5-plugin` 1.2.1 for Kotest and JUnit 5, default mutators, the
project's own tests) now mutates `sourceSets.main.output.classesDirs`, which holds the Kotlin
classes next to the Java ones; the other class tools keep to `compileJava`'s output. The
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
`languages/java/adapters/reporting/java-reports.mjs`. To reproduce the numbers: run
`gradle -Pnitpicker.kotlin=true -I <nitpicker>/languages/java/gradle/nitpicker.init.gradle nitpickerPit`
in that project and read `pit/mutations.xml` in the report directory.

## Structure limits

The shared structure rule (`shared/rules/structure.mjs`) runs on Kotlin functions: more than 50 lines,
15 statements or 3 parameters, or control nesting deeper than 2, fails with the rule ids
`function-lines-limit`, `function-statements-limit`, `function-parameters-limit` and
`function-control-nesting-limit` and the messages of the other languages, under the tool name
`structure`. A function that already exceeded a limit on the base and was edited fails only when
that number grew (`{name} grew from 4 to 5 parameters (limit 3)...`); a function that only moved,
or was edited without getting worse, stays baselined. That is the shared "only if worse" ratchet,
keyed by function name and occurrence in the file, with a hash of the function text in the identity.
The exception mechanisms are in `nitpicker.config.json`: an `exceptions` entry for the rule accepts
one function (`{ "rule": "function-lines-limit", "paths": ["src/main/kotlin/app/Big.kt"],
"function": "Big.run", "reason": "..." }`, `function` optional here) or the whole path, and the
message of each finding prints the entry; `exclude` drops every finding under a path (generated code);
`thresholds.crapLimit` changes the CRAP limit; there are no inline disables.

**Metric source (decision).** `languages/java/gradle/kotlin-psi` parses the Kotlin sources
(parse only, no compilation) with the PSI parser of the Kotlin compiler and writes
`kotlin-metrics.json` in the report directory (and `kotlin-facts.json`, see [Review rules](#review-rules)). It is compiled and run by
the JVM that runs Gradle, with `org.jetbrains.kotlin:kotlin-compiler-embeddable` on the class path. The version is
pinned as `kotlinCompiler` in the init script (2.4.21) and resolved from its own Gradle configuration
(`nitpickerKotlinCompiler`), like the other tools. It uses the compiler's PSI classes, so bumping the
pin means running `npm run test:kotlin` again; the `kotlin-e2e` GitHub Actions workflow runs it for a
push to `main` that changes `languages/java`, `core` or `shared`, the package files or the workflow
itself, by hand, and on a pull request when the `run-ci` label is added. A line-based tool cannot be the source: it has no statement count or control nesting, and
token-based readers misread ordinary Kotlin (extension functions such as `fun String.shout() = ...`,
expression-bodied functions, the `->` of a lambda), which would attribute a complexity per function to
the wrong lines.

**What is measured, all from the one parse, with the definitions of the other languages.**

| Metric              | Definition                                                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lines`             | Last line minus first line plus 1; annotations and modifiers count, KDoc and comments do not.                                                                                                                                                                                                         |
| `statements`        | Every element of a block (declarations, expressions, `return`), plus the unbraced body of an `if`, `else`, loop or `when` branch that is itself a statement, plus 1 for an expression body.                                                                                                           |
| `maxControlNesting` | Deepest nesting of `if`, `for`, `while`, `do`, `when` (like Java's `switch`) and `catch`; a flat `if` / `else if` / `else` chain is one level, whatever its length, while an `if` inside an `else { }` block or inside a branch body nests one deeper. `try` itself and lambdas are not control flow. |
| `parameters`        | Declared value parameters. An extension receiver is not one; a parameter with a default value is.                                                                                                                                                                                                     |
| complexity          | 1 plus each `if`, `for`, `while`, `do`, `when` branch other than `else`, `catch`, `&&`, `\|\|` and `?:`. It is the CRAP input, below.                                                                                                                                                                 |

A unit is a function with a body, a property accessor with a body, a secondary constructor with a
block body, an `init` block with statements, a lambda, an anonymous function or a local function, or
a property whose initializer is a lambda or an anonymous function or a call with a lambda, or whose
delegate takes a lambda (`val handler = { x -> ... }`, `val f = fun(x: Int) { ... }`,
`val v by lazy { ... }`, `val o by Delegates.observable(0) { ... }`, `val m = n.let { ... }`,
`val l = list.map { ... }`), the way an arrow-function constant is a unit in TypeScript; the body is
the lambda's and the unit is named after the property. Any other lambda is a unit named after the
unit that holds it and `<lambda>` (`Class.bump.<lambda>`, `Class.bump.<lambda>.<lambda>` for one
inside it), or, for a local property or local function, after that name (`Class.bump.scale`,
`Class.bump.clamp`). Any other property initializer is a unit when it holds the braces of `if`, `try`
or `when`, or branches (`if`, `when`, `&&`, `?:` and the like) outside its lambdas, and so is a call
with a lambda whose other parts branch; `val x = a + 1` and `val s = "text"` are not. Each `init`
block is a unit named after its class, `Class.<init>` (an empty block is not a unit). A class's
blocks share the name, so a finding on one is numbered only among the blocks of that class with the
same text that are over the same limit: inserting, deleting or reordering other blocks, or adding
an empty `init {}`, never makes a legacy block new. An edited block is held by that rule's ratchet like any function. A message on an
`init` block or a property initializer says to move the nested part into its own function, because
neither can `return` early. To accept such a unit, drop its file with `exclude`, as for any structure
or CRAP finding; the unit name (`Class.<init>`, `Class.property`) is the one that a per-function
exception would name. Lambdas, anonymous functions and local functions, and the members of
nested, local and anonymous classes and objects, are units of their own and do not count towards
the function that contains them: its statements, control nesting and complexity leave them out (as
TypeScript's analyzer does for its callbacks), while `lines` is its physical span, which includes
theirs. A unit inside an `inline` function is `inline` too. Primary constructors and functions without a body (abstract, interface,
`expect`) are not units. Names are `function` (top level), `Class.function`,
`Class.Receiver.function` for an extension, `Class.property.get` for an accessor, `Class.property`
for a property unit, `Class.<init>` for an `init` block, `Class.Class` for a secondary
constructor and `<anonymous>` for an object expression. Script files (`.kts`) are not read. Source directories are the ones Gradle reports
(generated code under the build directory is already left out), so a package named `build`, `out`
or `target` is measured like any other.

**A syntax error is a failure.** The sources have compiled before the metrics step runs, so a parse
error means the pinned compiler (2.4.21) does not know the syntax the project uses. The step fails
with the file, the line and the pinned version instead of reporting wrong numbers; bump
`kotlinCompiler` in the init script. A leading byte order mark is ignored.

### Class limits

`kotlin-psi` also lists every named class, interface, object and companion object with its
member functions, its fields and its superclass (the supertype with a constructor call), and each
file's imports. A class with more than 20 functions (`class-methods-limit`), more than 10 fields
(`class-fields-limit`: constructor `val`/`var` parameters and properties with a backing field; computed,
abstract and `const` properties do not count) or more than 3 superclasses (`inheritance-depth-limit`:
a superclass outside the project counts as one level) fails under the tool `structure`, with the Java
preset's thresholds, messages and ratchet (the shared `classLimitFindings`): a class already over a
limit fails only when it grows, and a `data class` is measured by its components, like a Java record.
Each finding ends with the exception sentence for its rule.

## CRAP

Kotlin functions get the shared CRAP rule: `crap-score-limit` at a score of 9 or more
(`thresholds.crapLimit` overrides it) and `crap-coverage-unknown` when no coverage is known, tool
`crap`, with the same ratchet for edited functions that were already over the limit. The score is
`ccn^2 * (1 - coverage)^3 + ccn`, with the lower of line and branch coverage, as for Java, and the
CRAP ingester (`ingestCrapFunctions`) is the Java one.

**Complexity and coverage (decisions).** The complexity is the one from `kotlin-psi`, for
the reason above; it counts what `StructureMetrics.java` counts for Java. Coverage is JaCoCo's per-method
data. The match is by file and line, not by function name, because Kotlin's JVM names do not follow
the source: JaCoCo keys classes by `package/sourcefilename`, so `FileNameKt` facades, companions,
nested classes and `DefaultImpls` of one file are all that file's methods. The key is built from the
`package` statement of the file and its file name, not from its directory, so a file outside the
directory of its package (`src/main/kotlin/Flat.kt` with `package demo`) gets its coverage. A JaCoCo
method belongs to the function whose line range holds its first line, unless it lies inside a unit of its own (a member
of a class declared in the function, a lambda, a local function). So the getter `getDoubled` belongs to `val doubled get() = ...`,
the lambda `bump$lambda$0` and a local function belong to their own units, not to the function that declares them. A lambda that
the compiler inlined (`let { }`, `map { }`, a lambda passed to an `inline` function) has no method of its own: it
is scored from the source lines of its range in JaCoCo's per-line data, as an `init` block is, and the function around it is
scored without those lines, unless nothing is left to measure. The synthetic `name$default` method that Kotlin
generates for default arguments is ignored: it has no source of its own and delegates to the function.
An `init` block and a property initializer that is not a lambda or a call with a lambda run inside the
class constructor or the static initializer, whose JaCoCo method starts on the class line, outside
the unit. Their coverage is therefore read from the source lines of the unit in JaCoCo's per-file
line data (covered lines, covered branches), minus the lines of a unit nested in them; the lower of
the two percentages is used as everywhere else.
A `@JvmStatic` companion function, which compiles to the function and a static method that delegates
to it on the same line, is counted once, through the method that holds the code. The score of a
function whose range holds no instrumented method is unknown, which is a finding
(`crap-coverage-unknown`; its message says to add a test that calls the function).

**`inline` functions have no CRAP score (decision).** The compiler copies the body of an `inline`
function into every caller and the original is never run, so JaCoCo reports it as uncovered (a
`reified` one as missing), whatever the tests do. A score computed from that could not be brought down
by any test and would fail a complex inline function for good. They are left out of the CRAP rule;
`function-lines-limit` and the other structure limits apply to them as to any function, and a
complex inline function should be split up. The metrics step marks them (`inline: true` in
`kotlin-metrics.json`).

The Java sources of a mixed module get their complexity from `StructureMetrics.java`; it never reads a
`.kt` file.

## Duplicates

The shared duplicates rule runs on Kotlin: jscpd (the version of the TypeScript preset, mode `mild`)
with `--format kotlin` over each Kotlin source root from the manifest, ignoring the folders named `build`, `generated`,
`target` and `out` (replaced by `duplicates.skippedFolders`). Clones made only of `package` and `import` lines are not reported. Its message names both files and tells to add either to `exclude`; a glob that matches either file of the pair lifts the finding. Any new clone fails with `duplicate-clone`, tool `duplicates`, identity from the file pair,
the cloned text and the n-th occurrence, never a line. Clones are found within one source root and
within the Kotlin files; a clone between a `.kt` and a `.java` file, or between two source roots, is not
(the same as for several Java roots).

A second jscpd run (100 tokens, 5 lines) goes over a normalized copy of the `.kt` and `.kts` files,
where names, strings, numbers and comments are one token each, `package` and `import` lines and
literal-only `listOf`, `mapOf` and `Pair` calls are blanked and generated files are left out, so a
copy with renamed locals and changed literals fails too, with `duplicate-clone` and an identity
starting `renamed:`. It replaces a plain clone over the same two ranges, and drops clones made of
declarations only (data class fields, also with defaults that call a function, enum constants) and
clones that only repeat one or two statements (DTO mappers, `when` tables, `if` ladders). PMD CPD would not do this better: the
`pmd-kotlin` lexer ignores the identifier and literal flags. The message names the same route as for
any clone: add either file of the pair to `exclude`.

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
the file and not its directory. Of a `@JvmMultifileClass` facade, each file lists its own part
(`Facade__FileKt`) and the first file (in path order) lists the facade class, so callers of the
facade belong to that file. A class that no file lists is its own module.

## Failure policy

As for Java: a Gradle failure on either snapshot (Kotlin does not compile, a tool crashes, a tool
jar cannot be downloaded, no `gradle` on the PATH) is one `kotlin/gradle-failure` finding with
classification `tool-error`, which the comparison reports for that snapshot, skipping the
comparison and exiting with 2. Nothing is silently skipped and nothing throws.

**A base whose tests fail (decision).** Failing tests are not a Gradle failure on the base when the
fresh test reports of a `Test` task name them. The base runs with `--continue`, then once more
with `-Pnitpicker.testsFailed=<project dirs>`: the init script disables every checked test task, the per-task PIT, the aggregate PIT and JaCoCo of the
failing Gradle projects and sets `testsFailed` in their manifest, and the other checks (detekt,
ktlint, PMD, SpotBugs, structure, duplicates, coupling) run as usual. The failing projects get one
`kotlin/tests-failed` tool error each, which the core reads as a red base and writes to
`notes.json` instead of exiting with 2. The coverage-dependent results of the Kotlin sources of
those projects (`changed-branch-coverage`, `crap-score-limit`, `crap-coverage-unknown`, `mutant-*`,
`slow-test`, `test-console-output`) are unknown on the base: a head finding of them is new when
the change adds or edits its lines, else unchanged. A failing root project covers only its own
source and test directories, so the other Gradle projects keep their comparison. A project that
does not compile, a run that exits non-zero without a named failing test and a run that times out
stay `kotlin/gradle-failure`. A change that deletes tests, or removes more test lines than it
adds, gets no help from the red base. A head whose tests fail stays a `kotlin/gradle-failure`.
See "A base whose tests fail" in `usage.md`.

## Config keys

`base`, `disable`, `analyzers`, `thresholds`, `exclude`, `duplicates`, `legacyInventory` and `history` (the opt-in
[change history](usage.md#change-history) check) as for the Java preset
(legacy inventory sources are the findings' `identity`, for example
`fp:nitpicker/subject=This expression contains a magic number. ...`). `kotlin.formatter` and
`kotlin.detektConfig` are new and valid only with this preset. `exceptions` lifts any detekt rule,
the [one-way rules](#one-way-rules), the [source checks](#source-checks), the
[source scans](#source-scans) (`catch-log-without-exception` and `test-without-assertion`), the
[compiler warnings](#compiler-warnings), the six `pmd/` ids and `unused-option` of the
[review rules](#review-rules), the [class limits](#class-limits), the file limits
`file-lines-limit` and `folder-files-limit`, `slow-test` (or `test-runtime/slow-test`),
`test-runtime/test-not-run` (a test source set no test task runs, see
[java-preset.md](java-preset.md#tests-that-never-run)), the
[dependency and repository checks](usage.md#dependency-and-repository-checks), `co-change` of the
[change history](usage.md#change-history) check (with a `<module>/**` glob), stability, and the
mutants of Java classes per path, and the structure, CRAP and coverage rules per function. Java rule
ids are accepted for the Java sources of the project. `layout` takes only `featureRoots`, and only
once `history.coChange` is on (it names the feature folders `co-change` reads); its other keys stay
a config error until the Kotlin preset runs the rule that reads them (`shared-used-by-one-feature`).

## Slow tests

As for Java ([slow tests](java-preset.md#slow-tests)): a test the change adds or edits fails over 5 s
as a unit test or 30 s as an integration test (`thresholds.unitTestSeconds`,
`thresholds.integrationTestSeconds`), measured on head from the JUnit XML of the test tasks, once and
without a rerun (see Java). A Kotlin test named with backticks is found by its name.

## File limits

The shared file-limit rule (`shared/rules/file-limits.mjs`) checks the `.kt` and `.java` files of the
Kotlin and Java source roots, main and test (roots under `build/` are generated and skipped): 300
lines per file, 500 per test file, and 6 files (and separately 6 test files) directly in one package
folder. The thresholds are `fileLines`, `testFileLines` and `folderFiles`. Packages more than 4 levels
below the root package (the longest package prefix all the code shares) fail `folder-depth-limit`,
`thresholds.folderDepth` and an exception for that rule change it. The Java class limits
(`class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`) apply to the `.java` files of a
Kotlin project, with `classMethods`, `classFields` and `inheritanceDepth`; the Kotlin classes get the same limits (see [Class limits](#class-limits)). The `java.indentation` convention (`"4"`) switches the Java sources' format check
to 4 spaces. The Kotlin files' line length is
detekt's `MaxLineLength` (120 by default, set in `config/detekt/detekt.yml`), the `.java` files use
the width of the Java formatter (100 for google-java-format, 120 for palantir-java-format, or the width of the project's Checkstyle `LineLength`, see the Java preset; `line-length-limit`, which an exception lifts for some paths), and
`thresholds.lineLength` is a config error with this preset. A file or folder already over a limit
fails only when it grows, and a package folder moved to a new path is matched to its old path.

## Tests

- `core/command/java/java-cli.test.mjs`: the CLI with the fake `gradle`
  (`languages/java/adapters/fixtures/fake-gradle.mjs`, which writes the Kotlin reports when it sees
  `-Pnitpicker.kotlin=true`, and a JaCoCo or PIT report the test provides): pass, new detekt finding,
  new unformatted file with each formatter, an uncovered changed Kotlin branch, a Kotlin mutant that
  does not fail and a Java one that does, baseline expansion, Gradle failure on either snapshot.
- `languages/java/adapters/reporting/kotlin-*-reports.test.mjs` (lint, coverage, metrics): a real detekt SARIF
  (`languages/java/ingest/fixtures/detekt.sarif`, recorded from detekt 1.23.8) and the format list
  through `readJavaFindings`; JaCoCo roots; branch gating of Kotlin files; Kotlin mutants being
  descriptive and Java ones enforceable; the Java preset ignoring Kotlin reports.
- `languages/java/ingest/coverage-reports/kotlin-branches.test.mjs`: the generated-line filter (what it drops and the
  lines it must keep), a JaCoCo report recorded from 0.8.12 on the measurement project
  (`fixtures/jacoco-kotlin.xml`, class elements dropped; the project is
  `fixtures/kotlin-measurement`) that yields exactly the real misses, and a recorded report of
  statements that span lines (`fixtures/jacoco-kotlin-multiline.xml` with its sources in
  `fixtures/kotlin-multiline`).
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
  changed Kotlin branch that no test takes fails while its mutants are only reported, also when the
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
- `languages/java/adapters/kotlin-e2e/guards/*.e2e.test.mjs`: real Gradle on the source
  checks, the compiler warnings and the class limits, banned and allowed, with their exception route
  and an exception for one path.
- `kotlin-psi` on a fixture (units, lambda properties, package, multifile parts, byte
  order mark, parse error, very deep nesting, test roots) is tested in the same opt-in suite, so a bump of
  the pinned compiler is checked
  with `npm run test:kotlin`.

## Remaining slices

| #   | Slice                                        | Scope                                                                                                                                                       |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KT1 | Gradle integration, detekt, format           | This document: done.                                                                                                                                        |
| KT2 | One-way rules and skill (#177)               | This document: done.                                                                                                                                        |
| KT3 | Structure, CRAP, duplicates, coupling (#178) | Done: structure limits and CRAP from a PSI metrics step (a token-based reader misreads Kotlin), jscpd with the Kotlin format and jdeps over Kotlin classes. |
| KT4 | Changed coverage and mutation (#179)         | Done: `changed-branch-coverage` on Kotlin with generated-branch filtering; PIT on Kotlin classes, report-only.                                              |

## Known limits

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
- The review rules read syntax only (see [Review rules](#review-rules)): a call is tied to a
  declaration by name and imports, so an extension or a same-named function from another module
  can hide a finding, and generated sources under the build directory are not read.
- `inline` functions are not measured by CRAP (see [CRAP](#crap)); their structure limits still apply.
- Kotlin Multiplatform and Android modules are not covered (`org.jetbrains.kotlin.jvm` only).
- detekt's type resolution uses detekt's own Kotlin standard library (see [detekt](#detekt)), so its
  results can differ from a project's own detekt run, and a library built with a newer Kotlin stays
  unresolved.
- ArchUnit rule tests written in Kotlin run with the other tests, but the resolution of their
  findings to source files is only verified for Java.
- The kotlinc lint compiles the sources a second time with the pinned compiler, so it adds a
  compile's time to the run, and a compiler plugin that the module applies some other way than
  through the Kotlin Gradle plugin is not loaded (the run is then `kotlinc/lint-not-run`).
- The source checks read code shapes, not types: a logger or repository under another name, an I/O
  call behind a helper, or a secret read through a constant is not seen.
