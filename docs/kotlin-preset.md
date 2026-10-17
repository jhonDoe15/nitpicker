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
properties.

## What runs on what

| Tool                                                           | Java sources | Kotlin sources | Notes                                                                                                                   |
| -------------------------------------------------------------- | ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| detekt                                                         |              | yes            | New. SARIF through the SARIF ingester; tool `detekt`.                                                                   |
| ktlint or ktfmt                                                |              | yes            | New, when the project uses one. ktlint: one finding per violation, with its rule; ktfmt: one `format` finding per file. |
| JaCoCo                                                         | yes          | yes            | `line-coverage` and `uncovered-method` (descriptive) and the `changed-branch-coverage` gate for both languages.         |
| PMD, Checkstyle, google-java-format, Error Prone with NullAway | yes          | no             | Java-only tools, with the Java preset's suppression and `tools` rules. A Kotlin-only module skips them.                 |
| SpotBugs                                                       | yes          | no             | Runs on the classes compiled from Java only; Kotlin classes are on its auxiliary classpath. See below.                  |
| Java structure metrics (CRAP of Java)                          | yes          | no             | `StructureMetrics.java`, Java sources only. Kotlin CRAP uses its own complexity, see [CRAP](#crap).                     |
| PIT                                                            | yes          | report-only    | Mutants of Kotlin classes are descriptive and never fail; see [Mutation](#mutation-report-only-for-kotlin).             |
| Structure limits, CRAP, jscpd duplicates                       | yes          | yes            | Kotlin through `KotlinMetrics.java` and jscpd's `kotlin` format. See below.                                             |
| jdeps (stability direction)                                    | yes          | yes            | Reads the Java and the Kotlin classes of the module together, one module per source file. See [Coupling](#coupling).    |
| Kotlin source checks                                           |              | yes            | A source scan on the Node side; tool `kotlin-source`. See [Source checks](#source-checks).                              |
| kotlinc lint                                                   |              | yes            | The pinned Kotlin compiler on the main sources; tool `kotlinc`. See [Compiler warnings](#compiler-warnings).            |
| Class limits                                                   |              | yes            | Methods, fields and inheritance depth from `KotlinMetrics.java`. See [Class limits](#class-limits).                     |

**PMD and SpotBugs on Kotlin (decision).** PMD has no Kotlin analysis, so nothing is lost: it
keeps running on the Java files of a mixed module. SpotBugs analyzes bytecode, and on
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
  `**/test/**` where it is noise in tests: `MagicNumber`, `StringLiteralDuplication`, `TooManyFunctions`,
  `LateinitUsage`, `SpreadOperator`, `FunctionNaming`, `ForEachOnRange`, `InstanceOfCheckForException`,
  `ThrowingExceptionsWithoutMessageOrCause`, the `KDocReferencesNonPublicProperty` and `Undocumented*` rules. These stay
  off for tests. The [one-way rules](#one-way-rules) are pinned with `excludes: []`, so they apply
  in tests too (`!!`, `GlobalScope`, `runBlocking`, scope functions, the broad catch). A legacy finding in a test
  file is baselined like one in main code, because both snapshots are analyzed with the same init script.
- **Config.** The project's detekt config is found at `config/detekt/detekt.yml`,
  `config/detekt.yml` or `detekt.yml` in the project (also with the `.yaml` extension, in that order)
  and set explicitly with `"kotlin": { "detektConfig": "path/inside/the/project.yml" }`, which wins.
  A configured file that does not exist is an error on head (and is ignored on base, so a pull
  request can add the file and the key together). Three layers are passed, later ones win: detekt's
  default config (`--build-upon-default-config`), the project's config, and Nitpicker's own
  `languages/java/detekt/nitpicker-detekt.yml` with the [one-way rules](#one-way-rules). A rule the
  project sets `active: false` stays off, unless Nitpicker's file turns it on, and a rule it omits
  runs with detekt's default, which is not what the detekt Gradle plugin does without
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
- **Exceptions.** Every detekt finding ends with the shared exception sentence for its rule as the
  finding prints it (`If this is intended, add {"rule":"detekt.style.MagicNumber","paths":[...],"reason":"..."} to "exceptions" in nitpicker.config.json.`),
  the same sentence the Java and TypeScript findings end with. A rule that is not a one-way rule can
  also be turned off or tuned in the detekt config, and `exclude` drops findings under a path.

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
| Processes         | `Runtime.exec`                                                                                                                                    | `ProcessBuilder("git", "log", ref)` with an argument list                                                                    | `style.ForbiddenMethodCall` (all overloads)                                                        |
| Deserialization   | `ObjectInputStream(...)`                                                                                                                          | JSON or another data format (kotlinx.serialization)                                                                          | `style.ForbiddenMethodCall` (`java.io.ObjectInputStream.<init>`)                                   |
| Date and time     | `java.util.Date`, `Calendar`, `GregorianCalendar`, `TimeZone`, `SimpleDateFormat`                                                                 | `java.time`; convert a `Date` another API returns with `toInstant()`                                                         | `style.ForbiddenImport`, `style.ForbiddenMethodCall` (the constructors and `Calendar.getInstance`) |
| Comments          | `TODO`, `FIXME`, `XXX`, `HACK` or `STOPSHIP` without an issue (`// TODO fix`)                                                                     | `TODO(#123): ...`, `TODO PROJ-123: ...` or a link                                                                            | `style.ForbiddenComment`                                                                           |
| Literals          | a string literal of 5 or more characters used three times in a file (main sources)                                                                | one `private const val`                                                                                                      | `complexity.StringLiteralDuplication`                                                              |

Rule ids in findings are `detekt.<ruleset>.<Rule>`. Test sources are analyzed with the same rules, so
`runBlocking` in a test is a finding too; its message points to `runTest`. A broad catch in a test
(`catch (error: Exception)`) is a finding as well: assert on the specific exception with
`assertFailsWith`, or catch the specific type. No variable name lifts the rule (`catch (ignored:
Exception)` is a finding too); the only exit is an `exceptions` entry with a reason. The calls from
`System.getenv` down to the legacy date classes are the concepts of the Java preset's forbidden-API
signatures (legacy date and time, the clock, sleeping, `Runtime.exec`, Java deserialization, starting
threads), each with its allowed form first; like forbiddenapis, which reads main classes only, they
count in main sources only, and so does the literal duplication. Randomness and
`System.currentTimeMillis` are banned in Kotlin as well, and a shell run through
`ProcessBuilder("sh", "-c", ...)` is a [source check](#source-checks). The environment ban is lifted
in the composition root by the gate (a file with a top-level `fun main`, an `@SpringBootApplication`
class or a Ktor `fun Application.module()`), see [Frameworks](#frameworks).

**Why these allowed forms (decision).** One function per job: `let` binds a value to a name for a
block (and is the null-handling form), `apply` configures an object and returns it. `run` and `with`
are `let` with `this`, and `also` is `apply` with `it`, so each is a second way to the same thing.
`let` and `apply` are the ones that cover the other three.

**Owned by Nitpicker.** The file is laid over the project's detekt config. For each of its rulesets
and rules it sets `active: true`, `excludes: []`, `includes: []` and `ignoreAnnotated: []`, and for
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
`kotlinc/unchecked` or `kotlinc/cast`, a class limit, a file limit or `test-runtime/slow-test`
(anything else is a config error naming them). Every enforceable Kotlin finding ends with that entry
in the shared exception sentence. Findings of that rule under the globs are dropped on both
snapshots, like `exclude`, and the exception changes the analyzer's cache key. The rule is lifted for the whole file, so one exception for
`kotlin.run` also lifts `kotlin.with`, `kotlin.also` and `runBlocking` there (they share a
detekt rule).

**Inline suppression.** `@Suppress`, `@SuppressWarnings` and `@file:Suppress` (with any use-site target, for
example `@get:Suppress`, and `names = [...]`) would hide a finding from the report, so a source scan
fails every token that targets a detekt or ktlint rule: `all`, anything starting with `detekt`,
`detekt.`, `detekt:`, `ktlint`, `ktlint.` or `ktlint:`, a detekt ruleset (`style`, `naming`, ...) and a
PascalCase rule id (`MagicNumber`), and the compiler warnings the [kotlinc lint](#compiler-warnings)
reports: `UNCHECKED_CAST`, `DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION` and `USELESS_CAST`, whose
message gives the exception route of the `kotlinc/<rule>` it hides. Other compiler diagnostics stay
allowed (`unused`, `UNUSED_PARAMETER`). Rule `inline-suppression`, tool `detekt`, one finding per
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
checks the Java preset runs as PMD rules and source scans, under the tool `kotlin-source`, rule
`<Rule>`; the exception names it `kotlin-source/<Rule>`. It reads the code with comments and string
bodies masked in place, so lines keep their numbers and a rule never matches inside a string or a
comment (the comment rules read the comments). Identity is the rule and a hash of the subject (the
declaration name, or the line text), numbered per file, so a moved finding stays baselined. A file
whose first comment says it is generated (`@generated`, "generated ... do not edit") is skipped.

| Rule                            | Flags                                                                                                                                                                                                                                                                                                                      | Allowed form                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GeneratedOnHandWrittenCode`    | an annotation whose name contains `Generated` on hand-written code (JaCoCo and PIT skip it)                                                                                                                                                                                                                                | remove it                                                                                       |
| `MutationIgnoreMarker`          | `@DoNotMutate`, `@CoverageIgnore`                                                                                                                                                                                                                                                                                          | remove it and kill the mutants with a test                                                      |
| `CommentedOutCode`              | a run of line comments, or a block comment, whose first code-shaped line is a declaration, call, assignment, control header, `fun`, `class`, import or return                                                                                                                                                              | delete it                                                                                       |
| `MutableModuleState`            | a top-level `var`, or a mutable collection, array, atomic or `MutableStateFlow` in a top-level `val`, or either in an `object` or companion object                                                                                                                                                                         | state in an instance the composition root creates and passes in                                 |
| `GenericTypeName`               | a class, interface or object named `*Util(s)`, `*Utility`, `*Utilities`, `*Helper`, `*Manager`, `*Common(s)`, `*Misc`; framework roles and a type that extends one with the same ending are skipped                                                                                                                        | a name for the job (`PriceRounder`)                                                             |
| `GenericPackageName`            | a package segment `util`, `utils`, `utility`, `helpers`, `manager`, `common`, `commons`, `misc`                                                                                                                                                                                                                            | a package named for what it holds; shared pure logic in `shared`                                |
| `LogStringConcatenation`        | a log call (`log`, `logger` or a name ending in `Log`/`Logger`, any SLF4J, Log4j or `java.util.logging` level) whose message is a string template, `+` or `format`                                                                                                                                                         | placeholders (`log.info("user {}", user)`) or a lambda message (`logger.info { "user $user" }`) |
| `ShellCommand`                  | a shell and its command flag as consecutive literals (`"sh", "-c"`, `"bash", "-c"`, `"cmd", "/c"`, `"powershell", "-Command"`)                                                                                                                                                                                             | the program with an argument list (`ProcessBuilder("git", "log", ref)`)                         |
| `IoCallInLoop`                  | a repository, DAO, JDBC, HTTP client or `Files` call, or a `File(...).readText()`-style read, in a `for`, `while` or `do` body or an iterating lambda (`forEach`, `map`, `filter` and similar)                                                                                                                             | fetch or write all items at once (`findAllById`, `saveAll`)                                     |
| `CatchOnlyLogsOrReturnsDefault` | a `catch` that neither throws, nor uses the exception, nor answers with an error response; log calls and `printStackTrace` do not count; an interrupt and a retry loop are skipped                                                                                                                                         | rethrow with the cause, or `Result.failure(e)`                                                  |
| `BooleanFlagParameter`          | an unannotated `Boolean` parameter of a public function that is the condition of an `if`, `when` or `while`; private, `override`, setters, `with*`, `of`/`from`/`valueOf` are skipped                                                                                                                                      | two functions, an enum or a data class                                                          |
| `HardcodedSecret`               | a secret-looking literal assigned to a name like `*password`, `*secret`, `*token`, `*apiKey`, also as a named argument, a `"key" to "value"` pair or a `"key", "value"` argument pair                                                                                                                                      | read it from the environment or a secrets manager                                               |
| `CredentialLiteral`             | an AWS key, a GitHub or Slack token, a `sk_live_`/`sk-proj-` key, a private key header, a password in a URL or a `Bearer`/`Basic` value                                                                                                                                                                                    | the same                                                                                        |
| `SecretInLog`                   | a secret-named value passed to a log call or `print`, directly, in a `+` or in a template                                                                                                                                                                                                                                  | log that it is set, or a masked tail                                                            |
| `SqlStringBuilding`             | SQL text built from a runtime value with a string template, `+`, `String.format` or `.format`: text that starts like a statement or clause in capitals (`SELECT ... FROM`, `UPDATE ... SET`, `AND name =`), or any case when it reaches a JDBC, Spring `JdbcTemplate`, JPA or R2DBC query call directly or through a `val` | bind parameters (`?`, `:id`) or a query DSL                                                     |
| `WeakHash`                      | `MessageDigest`, `Signature`, `DigestUtils` with MD2, MD4, MD5 or SHA-1 (a literal, a constant in the file or a commons-codec constant), commons-codec, Spring, Guava and Okio MD5/SHA-1 helpers, and HMAC-MD5 (`Mac`, `KeyGenerator`, `HmacUtils`, its own message); HMAC-SHA1 passes                                     | SHA-256 or stronger, `HmacSHA256`, Argon2 or bcrypt for passwords                               |
| `TlsVerificationOff`            | an empty `checkServerTrusted`, a host-name verifier or trust strategy that returns `true`, `NoopHostnameVerifier`, `TrustAllStrategy`, `TrustSelfSignedStrategy`, Netty's `InsecureTrustManagerFactory`                                                                                                                    | trust the CA through a `KeyStore` and `TrustManagerFactory`, or OkHttp `HandshakeCertificates`  |
| `HttpWithoutTimeout`            | a `java.net.http` request built without `.timeout(...)`, an `HttpURLConnection` from an HTTP URL whose block never sets `readTimeout`, `URL(...).readText()`/`readBytes()`/`openStream()`, `RestTemplate()`, `HttpClients.createDefault()`; OkHttp and Ktor pass (their engines set timeouts)                              | a request timeout, connection timeouts, or a client configured with them                        |
| `UnsafeDeserialization`         | `XMLDecoder`, Jackson `enableDefaultTyping`, `activateDefaultTyping` with `LaissezFaireSubTypeValidator`, `JsonTypeInfo.Id.CLASS`/`MINIMAL_CLASS`, `SerializationUtils.deserialize`, Kryo without class registration (`ObjectInputStream` is detekt's `ForbiddenMethodCall`)                                               | JSON into a concrete type (kotlinx.serialization, Jackson), polymorphism by a logical name      |
| `TestHelperInSource`            | a main source that imports JUnit, kotlin.test, Kotest, MockK, Mockito, AssertJ, Truth, Strikt or Hamcrest                                                                                                                                                                                                                  | move the helper to the test sources                                                             |
| `TestClassWithoutTestCases`     | (test sources) a class named `*Test`, `*Tests`, `*TestCase` or `*IT` with no test annotation in it; abstract and open classes, Kotest specs and classes with a superclass, suites and `@Nested` are skipped                                                                                                                | add tests, or rename the helper                                                                 |
| `DetachedTestCase`              | (test sources) a public no-argument function named like a test (backticks, `test*`, `should*`) without an annotation, in a class that has tests                                                                                                                                                                            | annotate it with `@Test`, or make it private                                                    |

`TodoWithoutIssue` of the Java preset is detekt's `ForbiddenComment` here (a one-way rule), and
`RepeatedStringLiteral` is `StringLiteralDuplication`. The forbidden-API entries of
`ForbiddenMethodCall` and `ForbiddenImport` count in main sources only, as forbiddenapis does in the
Java preset (`framework-allowances.mjs` drops them on test sources), so real time and randomness in
unit tests wait for the test-honesty rules.

The security checks are the Kotlin side of the TypeScript and Python sinks. A value in SQL text is
fine when it cannot change the statement: a number literal, a constant (`$TABLE`, `${Tables.ORDERS}`,
a `val` holding a plain literal), `.size` or `.length`, a name whose every declaration in the file
has a number, `Boolean`, `UUID`, date or enum type, a member whose every declaration in the main
sources has one (`${order.id}` with `val id: Long`), placeholders built from placeholders alone
(`ids.joinToString(", ") { "?" }`, `List(n) { "?" }.joinToString(",")`, `"?, ".repeat(n)`), a
`mutableListOf` that only ever receives plain literals joined with a literal separator, and an
`if (...) "..." else "..."` of plain literals. The enums and property types come from every main
Kotlin file of the module.

## Compiler warnings

The task `nitpickerKotlinLint` (`languages/java/gradle/kotlin/kotlin-lint.gradle`) compiles the main
Kotlin sources, generated ones included, with the pinned compiler into a throwaway directory, with the
module's compile classpath, its compiled Java classes, its language and API version, JVM target,
opt-ins, free compiler arguments and compiler plugins, and `-Xrender-internal-diagnostic-names`. The
arguments that silence warnings (`-nowarn`, `-Werror`, `-Xsuppress-warning`, `-Xwarning-level`) are
dropped, so a build setting cannot hide them. The warnings that match the Java preset's javac lint
are findings of the tool `kotlinc`, on the source roots only:

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
The ArchUnit Spring layout rules read the compiled classes, so they cover Kotlin classes; a Kotlin
fixture for them is `languages/java/adapters/fixtures/spring-arch-kotlin-project`.

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
The only exception mechanism is `nitpicker.config.json`: `exclude` drops the findings under a path
(generated code, a legitimately wide function), `thresholds.crapLimit` changes the CRAP limit;
there are no inline disables.

**Metric source (decision).** `languages/java/gradle/KotlinMetrics.java` parses the Kotlin sources
(parse only, no compilation) with the PSI parser of the Kotlin compiler and writes
`kotlin-metrics.json` in the report directory. It runs in Java's single-file source mode in the JVM that
runs Gradle, with `org.jetbrains.kotlin:kotlin-compiler-embeddable` on the class path. The version is
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
block body, an `init` block with statements, or a property whose initializer is a lambda or an
anonymous function or whose delegate takes a lambda (`val handler = { x -> ... }`,
`val f = fun(x: Int) { ... }`, `val v by lazy { ... }`, `val o by Delegates.observable(0) { ... }`),
the way an arrow-function constant is a unit in TypeScript; the body is the lambda's and the unit is
named after the property. Any other property initializer is a unit when it holds a block (a lambda
such as `run { ... }` or `map { ... }`, or the braces of `if`, `try` and `when`) or branches
(`if`, `when`, `&&`, `?:` and the like); `val x = a + 1` and `val s = "text"` are not. Each `init`
block is a unit named after its class, `Class.<init>` (an empty block is not a unit). A class's
blocks share the name, so a finding on one is numbered only among the blocks of that class with the
same text that are over the same limit: inserting, deleting or reordering other blocks, or adding
an empty `init {}`, never makes a legacy block new. An edited block is held by that rule's ratchet like any function. A message on an
`init` block or a property initializer says to move the nested part into its own function, because
neither can `return` early. To accept such a unit, drop its file with `exclude`, as for any structure
or CRAP finding; the unit name (`Class.<init>`, `Class.property`) is the one that a per-function
exception would name. Lambdas and local functions inside a function count towards
the function that contains them; members of nested, local and anonymous classes and objects are
units of their own. Primary constructors and functions without a body (abstract, interface,
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

`KotlinMetrics.java` also lists every named class, interface, object and companion object with its
member functions, its fields and its superclass (the supertype with a constructor call), and each
file's imports. A class with more than 20 functions (`class-methods-limit`), more than 10 fields
(`class-fields-limit`: constructor `val`/`var` parameters and properties with a backing field; computed,
abstract and `const` properties do not count) or more than 3 superclasses (`inheritance-depth-limit`:
a superclass outside the project counts as one level) fails under the tool `structure`, with the Java
preset's thresholds and ratchet: a class already over a limit fails only when it grows. Each finding
ends with the exception sentence for its rule.

## CRAP

Kotlin functions get the shared CRAP rule: `crap-score-limit` at a score of 9 or more
(`thresholds.crapLimit` overrides it) and `crap-coverage-unknown` when no coverage is known, tool
`crap`, with the same ratchet for edited functions that were already over the limit. The score is
`ccn^2 * (1 - coverage)^3 + ccn`, with the lower of line and branch coverage, as for Java, and the
CRAP ingester (`ingestCrapFunctions`) is the Java one.

**Complexity and coverage (decisions).** The complexity is the one from `KotlinMetrics.java`, for
the reason above; it counts what `StructureMetrics.java` counts for Java. Coverage is JaCoCo's per-method
data. The match is by file and line, not by function name, because Kotlin's JVM names do not follow
the source: JaCoCo keys classes by `package/sourcefilename`, so `FileNameKt` facades, companions,
nested classes and `DefaultImpls` of one file are all that file's methods. The key is built from the
`package` statement of the file and its file name, not from its directory, so a file outside the
directory of its package (`src/main/kotlin/Flat.kt` with `package demo`) gets its coverage. A JaCoCo
method belongs to the function whose line range holds its first line, unless it lies inside a unit of its own (a member
of a class declared in the function). So the getter `getDoubled` belongs to `val doubled get() = ...`,
the lambda `bump$lambda$0` and a local function belong to the function that declares them, and their
lines and branches are summed into its coverage. The synthetic `name$default` method that Kotlin
generates for default arguments is ignored: it has no source of its own and delegates to the function.
An `init` block and a property initializer that is not a lambda or delegate lambda run inside the
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
the file and not its directory. Of a `@JvmMultifileClass` facade, each file lists its own part
(`Facade__FileKt`) and the first file (in path order) lists the facade class, so callers of the
facade belong to that file. A class that no file lists is its own module.

## Failure policy

As for Java: a Gradle failure on either snapshot (Kotlin does not compile, a test fails, a tool
crashes, a tool jar cannot be downloaded, no `gradle` on the PATH) is one `kotlin/gradle-failure`
finding with classification `tool-error`, which the comparison reports for that snapshot, skipping
the comparison and exiting with 2. Nothing is silently skipped and nothing throws.

## Config keys

`base`, `disable`, `analyzers`, `thresholds`, `exclude`, `legacyInventory` as for the Java preset
(legacy inventory sources are the findings' `identity`, for example
`fp:nitpicker/subject=This expression contains a magic number. ...`). `kotlin.formatter` and
`kotlin.detektConfig` are new and valid only with this preset. `exceptions` lifts any detekt rule,
the [source checks](#source-checks), the [compiler warnings](#compiler-warnings), the
[class limits](#class-limits), the file limits `file-lines-limit` and `folder-files-limit` and
`test-runtime/slow-test` per path. `layout` is a config error.

## Slow tests

As for Java ([slow tests](java-preset.md#slow-tests)): a test the change adds or edits fails over 5 s
as a unit test or 30 s as an integration test (`thresholds.unitTestSeconds`,
`thresholds.integrationTestSeconds`), measured on head from the JUnit XML of the test tasks. A Kotlin
test named with backticks is found by its name.

## File limits

The shared file-limit rule (`shared/rules/file-limits.mjs`) checks the `.kt` and `.java` files of the
Kotlin and Java source roots, main and test (roots under `build/` are generated and skipped): 300
lines per file, 500 per test file, and 6 files (and separately 6 test files) directly in one package
folder. The thresholds are `fileLines`, `testFileLines` and `folderFiles`. Packages more than 4 levels
below the root package (the longest package prefix all the code shares) fail `folder-depth-limit`,
`thresholds.folderDepth` and an exception for that rule change it. The Java class limits
(`class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`) apply to the `.java` files of a
Kotlin project, with `classMethods`, `classFields` and `inheritanceDepth`; Kotlin classes are not measured. The `java.indentation` convention (`"4"`) switches the Java sources' format check
to 4 spaces. The Kotlin files' line length is
detekt's `MaxLineLength` (120 by default, set in `config/detekt/detekt.yml`), the `.java` files keep
nitpicker's fixed 100 characters (`line-length-limit`, which an exception lifts for some paths), and
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
- `languages/java/adapters/kotlin-e2e/kotlin-preset-guards.e2e.test.mjs`: real Gradle on the source
  checks, the compiler warnings and the class limits, banned and allowed, with their exception route
  and an exception for one path.
- `KotlinMetrics.java` on a fixture (units, lambda properties, package, multifile parts, byte order
  mark, parse error) is tested in the same opt-in suite, so a bump of the pinned compiler is checked
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
