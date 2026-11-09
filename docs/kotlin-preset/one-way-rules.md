# One-way rules

Part of the [Kotlin preset guide](../kotlin-preset.md).

The common many-ways spots of Kotlin are narrowed with detekt rules, set in
`languages/java/detekt/nitpicker-detekt.yml`. They are existing detekt rules (no custom rule jar, so
no separate build to ship), turned on and configured. Every message names the allowed
form (in detekt's text, or in a sentence the gate appends when detekt's text does not name it) and
ends with the exception route, which the gate appends to all of them. The `inline-suppression`
message names the fix and both routes. Each rule has a banned and an allowed fixture in
`languages/java/adapters/kotlin/rules/test-support/kotlin-rule-cases.mjs`.

| Spot              | Banned                                                                                                                                            | Allowed                                                                                                                               | Rule (detekt)                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Scope functions   | `run`, `with`, `also`                                                                                                                             | `let` (`value?.let { ... }`) and `apply` (configure an object)                                                                        | `style.ForbiddenMethodCall` (`kotlin.run`, `kotlin.with`, `kotlin.also`)                           |
|                   | `let` or `apply` that changes nothing                                                                                                             | call the member directly                                                                                                              | `style.UnnecessaryLet`, `style.UnnecessaryApply`                                                   |
| Nullable handling | `!!`                                                                                                                                              | `?:`, `?.let`, `checkNotNull(value) { "why" }`                                                                                        | `potential-bugs.UnsafeCallOnNullableType`                                                          |
|                   | `value as String` on a nullable value                                                                                                             | handle null first, or `as?`                                                                                                           | `potential-bugs.CastNullableToNonNullableType`                                                     |
|                   | `value as String?`                                                                                                                                | `value as? String`, which returns null instead of throwing                                                                            | `potential-bugs.CastToNullableType`                                                                |
|                   | `if (x == null) null else ...`                                                                                                                    | `x?.let { ... }`                                                                                                                      | `style.UseLet`                                                                                     |
| Casts             | `items as MutableList<String>` or `items is MutableList<String>` on a read-only `List`                                                            | `items.toMutableList()`, or ask for the mutable type at its source                                                                    | `potential-bugs.DontDowncastCollectionTypes`                                                       |
| Coroutines        | `GlobalScope`                                                                                                                                     | `coroutineScope { launch { ... } }`, or a scope its owner cancels                                                                     | `coroutines.GlobalCoroutineUsage`                                                                  |
|                   | `runBlocking`                                                                                                                                     | a `suspend` caller (`suspend fun main()`); `runTest` in a test                                                                        | `style.ForbiddenMethodCall` (`kotlinx.coroutines.runBlocking`)                                     |
| Exceptions        | `catch (e: Exception)`, `Throwable`                                                                                                               | catch the specific exception type; `assertFailsWith` in a test                                                                        | `exceptions.TooGenericExceptionCaught`                                                             |
| Records           | a class that only holds `val`s                                                                                                                    | `data class`                                                                                                                          | `style.UseDataClass` (`allowVars: true`)                                                           |
|                   | a `data class` with a `var`                                                                                                                       | `val` and `copy(...)`                                                                                                                 | `style.DataClassShouldBeImmutable`                                                                 |
| Output            | `print`, `println`                                                                                                                                | the application logger (`logger.info(...)`) for logging                                                                               | `style.ForbiddenMethodCall` (`kotlin.io.print`, `kotlin.io.println`)                               |
|                   | `System.out`, `System.err` outside the composition root (main sources)                                                                            | an `Appendable`, `PrintStream` or `Writer` parameter for program output; the file with `fun main` passes `System.out` or `System.err` | source check `StandardStreamOutsideEntryPoint`, see [Source checks](#source-checks)                |
| Configuration     | `System.getenv` outside the composition root                                                                                                      | read once into a config class in the file with `fun main`, the `@SpringBootApplication` class or a Ktor `Application` module          | `style.ForbiddenMethodCall` (`java.lang.System.getenv`)                                            |
| Time              | `Instant.now()`, `LocalDate.now()` and the other `java.time` `now()`, `System.currentTimeMillis()`, `kotlinx.datetime.Clock.System.now()`         | an injected `java.time.Clock`: `Instant.now(clock)`, `clock.millis()`                                                                 | `style.ForbiddenMethodCall`                                                                        |
| Randomness        | `Random.nextInt()` on the default generator, `items.random()`, `shuffled()`, `Math.random()`, `ThreadLocalRandom.current()`, `java.util.Random()` | an injected `kotlin.random.Random` (`Random(seed)` in tests)                                                                          | `style.ForbiddenMethodCall`, `style.ForbiddenImport` (`java.util.Random`)                          |
| Blocking          | `Thread.sleep`, `TimeUnit.sleep`                                                                                                                  | schedule the work (`ScheduledExecutorService`) or wait on the condition                                                               | `style.ForbiddenMethodCall`                                                                        |
| Threads           | `Thread(...).start()`, `thread { }`                                                                                                               | a coroutine in a scope its owner cancels, or an injected `ExecutorService`                                                            | `style.ForbiddenMethodCall`                                                                        |
| Processes         | `Runtime.exec`, every overload (the argument-array ones too)                                                                                      | `ProcessBuilder("git", "log", ref)` with an argument list                                                                             | `style.ForbiddenMethodCall` (all overloads)                                                        |
| Deserialization   | `ObjectInputStream(...)`                                                                                                                          | JSON or another data format (kotlinx.serialization)                                                                                   | `style.ForbiddenMethodCall` (`java.io.ObjectInputStream.<init>`)                                   |
| Date and time     | `java.util.Date`, `Calendar`, `GregorianCalendar`, `TimeZone`, `SimpleDateFormat`                                                                 | `java.time`; convert a `Date` another API returns with `toInstant()`                                                                  | `style.ForbiddenImport`, `style.ForbiddenMethodCall` (the constructors and `Calendar.getInstance`) |
| Comments          | `TODO`, `FIXME`, `XXX`, `HACK` or `STOPSHIP` without an issue (`// TODO fix`)                                                                     | `TODO(#123): ...`, `TODO PROJ-123: ...` or a link (`https://...`)                                                                     | `style.ForbiddenComment`                                                                           |
| Parameters        | a parameter the body never reads (main sources); overrides, `main`, annotated functions and `ignored*`/`unused*` names are skipped                | remove the parameter and update the callers                                                                                           | `style.UnusedParameter`                                                                            |
| Conditions        | an `if` alone inside another `if` (`if (a) { if (b) { ... } }`)                                                                                   | one `if (a && b) { ... }`; nesting stays when the outer `if` has an `else` or other statements                                        | `style.CollapsibleIfStatements`                                                                    |

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
`ProcessBuilder("sh", "-c", ...)` is a [source check](source-checks.md). The environment ban is lifted
in the composition root by the gate (a file with a top-level `fun main` or a `@JvmStatic fun main` in an
`object` or companion object, an `@SpringBootApplication`
class or a Ktor `fun Application.module()`), see [Frameworks](frameworks.md). `print` and `println`
stay banned everywhere, the composition root included: program output goes through a writer the
entry point passes, and logging through the logger.

**Type laundering (decision).** The Kotlin counterpart of the TypeScript `as` ban is the unsafe cast operator,
which the Kotlin documentation itself calls the "unsafe" cast: `value as T` throws `ClassCastException`
when the type is wrong, and a generic target (`as List<String>`) is not even checked. The allowed forms
are an `is` check or `when` (a smart cast), `as?` with the null handled, and `assertIs<T>(value)` in a
test. So `kotlin-source/UnsafeCastOperator` flags every `as` in main and test sources (an import alias,
`as?`, `null as T?` as a type hint and `as Any?` are not casts that can fail and pass). Where a more
specific rule reports the same line, that one stays and the cast finding is dropped: the compiler's
`kotlinc/unchecked` and `kotlinc/cast`, and detekt's `CastNullableToNonNullableType`, `CastToNullableType`,
`DontDowncastCollectionTypes` (`items as MutableList<T>` and `items is MutableList<T>` on a read-only
`List`) and `UnsafeCast`. `Any?` as a parameter type stays allowed: it is the counterpart of TypeScript's
`unknown`, which is the allowed form there, and what is built from it has to be checked with `is`.

Cases where the cast looks harmless and is still flagged, with the form to use: the `other as Foo` that an
IDE writes into `equals` after a `javaClass` comparison (`if (other !is Foo) return false`), a reified
`value as T` (`value as? T`, then handle the null), an upcast to pick an overload (`x as Any`; name the
parameter type, or call the overload by its name), `mock as Foo` in a test (`assertIs<Foo>(mock)`). A cast
inside a string template (`"${value as T}"`) is not seen, because the scan masks string bodies. Reflection
and Java interop that cannot avoid a cast take an `exceptions` entry for `kotlin-source/UnsafeCastOperator`.

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
[source checks](source-checks.md) apply the Java preset's generic-name rules instead.

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
`kotlin-source/<Rule>` of the [source checks](source-checks.md), `kotlinc/deprecation`,
`kotlinc/unchecked` or `kotlinc/cast`, one of the [review rules](review-rules.md) (`pmd/FixedSleepInTest`,
`pmd/NegativeWaitInTest`, `pmd/DisabledTest`, `pmd/FocusedTest`, `pmd/RetryInTest`, `pmd/ServerOrContainerPerTest`, `pmd/AssertionInControlFlow`,
`pmd/CoroutineEscapesTest`, `pmd/GlobalStateLeakInTest`, `pmd/SharedTestState`, `pmd/MockedSubjectInTest`, `pmd/StaticMockOfProjectType`, `pmd/RelaxedMockInTest`, `pmd/SpringUnusedContext`, `pmd/ExhaustiveEnumPredicate`,
`pmd/StaticForwardingWrapper`, `pmd/SingularAndPluralMember`, `pmd/ValidationAnnotationTarget`, `pmd/timeout-abandons-operation`, `pmd/ClassLoadEffect`, `pmd/RecursiveMapUpdate`, `unused-option`), a class limit, a file
limit or `test-runtime/slow-test`; for the [structure](structure-limits.md), [CRAP](crap.md) and [coverage](coverage.md) findings,
`function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`,
`function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown` or `changed-branch-coverage`
with an optional `function` (required for the last one); `duplicate-clone` and `stability-direction`
(the package name as printed, for example `"paths": ["stable"]`) per path; and, for the Java sources of
the project, a Java finding as it is printed, `<tool>/<rule>` (`pmd/UnusedPrivateField`) or
`mutant-survived` and `mutant-nocoverage` for the PIT mutants of Java and Kotlin classes (with a
`function`, as `KKt.fee` for a top-level Kotlin function). Anything else is a config error naming them. `function` is the name the
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
PascalCase rule id (`MagicNumber`), and the compiler warnings the [kotlinc lint](compiler-warnings.md)
reports: `UNCHECKED_CAST`, `DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION` and `USELESS_CAST`, whose
message gives the exception route of the `kotlinc/<rule>` it hides, in main and test sources alike. Other compiler diagnostics stay
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
- Type resolution reports less where a library is built with a newer Kotlin than detekt's ([detekt](detekt.md));
  `!!` on a value of such a type is not seen.
