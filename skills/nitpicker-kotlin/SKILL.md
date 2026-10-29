---
name: nitpicker-kotlin
description: Use before writing or changing Kotlin in a project that runs nitpicker with the kotlin preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Kotlin

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.
Java sources in the same project follow the `nitpicker-java` skill; if it isn't installed, install
it with `npx skills add jhonDoe15/nitpicker --skill nitpicker-java`.

## Finish with the gate

1. Run the project's tests (`./gradlew test`). Failing tests stop coverage, CRAP and mutation from
   running.
2. When the change is complete, run `npx nitpicker` as a background command you wait on, without a
   pipe: you need its exit code. It has no `--fix` for Kotlin; format with the command and notes
   printed at the start of the run. It runs Gradle on the merge base and on head, with the project's `./gradlew` when there
   is one, otherwise `gradle` from the PATH (`NITPICKER_GRADLE` overrides both). It takes minutes
   and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done.
   - 1: fix every new finding and any tool error listed below them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a failing test or a
     Gradle error) and rerun. Exit 2 is never a pass. If it says another run is in progress, wait
     for that run; never kill it.
4. Never suppress: no `@Suppress` of a detekt or ktlint rule, config `exclude`/`disable`/`exceptions`, legacy
   entries, or weakened tests. In Java files the Java rules apply: `@SuppressFBWarnings` and
   `@SuppressWarnings("PMD")` are findings, and a project's own PMD or Checkstyle config is used
   only when `nitpicker.config.json` opts in under `tools`. If a finding seems wrong, stop and ask.
   Never pass `--accept-policy-change` or set `NITPICKER_ACCEPT_POLICY_CHANGE`: a
   `nitpicker-config/policy-loosened` finding is for a person to accept.

Before you change code other modules use, or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md).

## Write it this way

- Scope functions: `let` for null (`value?.let { ... }`) and `apply` to configure an object you just
  created. No `run`, `with` or `also`, and no `let` or `apply` where a direct call works.
- Null: no `!!`, no `as String` on a nullable. Use `value ?: return`, `?.let`, or
  `checkNotNull(value) { "why" }` when null is a bug; `x?.let { ... }`, not `if (x == null) null else ...`.
- Coroutines: no `GlobalScope`, no `runBlocking` (a call, however it is imported). Make the caller `suspend`
  (`suspend fun main()` for an entry point) and use `coroutineScope { launch { ... } }`; a test uses `runTest`.
- Records: a class that only holds data is a `data class` with `val`s; change a copy with `copy(...)`.
  A class with `var`s is not flagged, nor a JPA or Spring Data entity; the project adds other
  annotations to `UseDataClass`'s `excludeAnnotatedClasses` in its `detekt.yml`.
- Design for a fixed clock and a seeded random: take a `java.time.Clock` and a `kotlin.random.Random`
  as constructor parameters, and read environment variables once where `fun main` (or the
  `@SpringBootApplication` class, or the Ktor module) builds the objects, into a config class passed in.
- With Spring, the architecture rules (`archunit/spring-...`) read the compiled Kotlin classes: package
  by feature; controllers call services, never repositories or another controller; a repository calls
  no service; a request- or session-scoped bean reaches a singleton only as `ObjectProvider<T>` or
  through a scoped proxy (`@RequestScope`); request data never lands in a singleton's property or a
  `companion object`: pass it through parameters and return values.
- With jMolecules (`AggregateRoot`, `Entity`, `ValueObject` or their annotations; also without Spring),
  the `archunit/ddd-...` rules hold aggregate boundaries: refer to another aggregate's root by its
  identifier or an `Association`, keep each entity in one aggregate, and keep entities and roots out of
  value objects.
- Test sources are linted like main ones (detekt, and ktlint or ktfmt): the rules above, including `!!`, apply
  in tests. detekt keeps its default exclusions for tests, so magic numbers, `lateinit`, many functions,
  duplicated string literals, spread operators and function names in backticks are not findings in a
  test. A test asserts on the specific exception (`assertFailsWith<IllegalStateException> { ... }`)
  instead of catching `Exception`, whatever the variable is called.
- detekt's defaults stay on. In main sources: lines of at most 120 characters, named constants
  instead of numbers other than -1, 0, 1 and 2 (`MagicNumber`), at most 2 `return` and 2 `throw`
  per function, conditions of at most 3 `&&`/`||` parts, no wildcard imports unless most of the project's files
  already use them, and no `TODO` or `FIXME` without an issue (`TODO(#123): ...`). Catch and throw specific exceptions, never `Exception`, `RuntimeException` or
  `Throwable` (also in tests: `TooGenericExceptionCaught`), and pass the caught exception on as the cause (`SwallowedException`). Use
  `require(...)` and `check(...)` instead of throwing `IllegalArgumentException` and
  `IllegalStateException`; a top-level `val` holding a literal is `const val`. Remove unused private
  members and parameters (an override, a function with a framework annotation and a name starting
  `ignored` or `unused` are skipped). A public function's `Boolean` parameter that picks a behavior
  becomes two functions or an enum (`BooleanFlagParameter`).
- Enums: to sort the entries of one of your enums into two groups, classify every entry with a
  `when` without `else` (adding an entry then fails to compile), or a `Boolean` each entry
  declares. Not `s == PAID || s == SHIPPED` or `s in setOf(PAID, SHIPPED)`
  (`pmd/ExhaustiveEnumPredicate`).
- No top-level or `object` function that only passes its parameters, in order, to another function
  with the same parameters (`pmd/StaticForwardingWrapper`); call that function. Factories named
  `of` or `from` are fine.
- A data class or `@ConfigurationProperties` class has `tags` or `tag`, not both
  (`pmd/SingularAndPluralMember`); one item is a one-element list.
- In main code, nothing with an outside effect runs while a file, `object`, companion object or
  enum class loads (`pmd/ClassLoadEffect`): no connection, request, file access, pool, timer,
  coroutine launch or JVM-wide setting in a top-level property, an `object`'s properties or `init`,
  an enum entry, or a class its companion creates, nor in a function they call. Do the work in a
  function `main` or the framework calls after startup (a `@Bean` method, an `ApplicationRunner`, a
  Ktor module) and pass the result in, or defer it with `by lazy { }`. Constants, loggers, `Regex`
  and collections can stay.
- A private or `internal` function or constructor does not declare a default parameter that no
  call in the project sets (`unused-option`): remove the parameter, or pass it from a real call.
- Never `@Suppress` a detekt or ktlint rule (its name, `all`, a ruleset, `detekt:...`, `ktlint:...`):
  fix the code. The compiler warnings `UNCHECKED_CAST`, `DEPRECATION` and `USELESS_CAST` are
  findings too and are not suppressed either. If a rule flags legitimate code, stop and ask: the
  project adds the `exceptions` entry the finding's message names to `nitpicker.config.json`
  (`detekt.<ruleset>.<Rule>`, paths, reason). A structure, CRAP, changed-branch coverage, duplicate
  or coupling finding ends with its own entry
  (`{ "rule": "function-lines-limit", "paths": [...], "function": "name", "reason": "..." }`);
  switching a one-way rule off in
  `detekt.yml` has no effect. Generated code belongs in `exclude`: ask the maintainer to add it.
- A project may add forbidden calls to `ForbiddenMethodCall.methods` in its `detekt.yml`; they join
  the preset's. Do not call anything the project lists there.
- With Spring, the Spring, JPA and Spring Data rules of the Java preset run on Kotlin under the same
  `pmd/...` ids, and each finding names the Kotlin form.

## Repository files

- The gate fails committed secrets, binaries, build output and files over 1 MB; each message names
  the fix. Don't add an `exceptions` entry to get past one: stop and ask.

## Size and tests

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters;
  past 3 parameters, pass a data class. Each lambda, anonymous function and local function is a function
  with the same limits, counted on its own and not towards the function around it; so are `init` blocks
  (`Class.<init>`) and property initializers that branch (`val y = if (...) ... else ...`). An `init` block cannot return early: move the nested part into
  a function. Complex code needs tests: the CRAP score of a function must
  stay below 9.
- A new clone of at least 5 lines and 50 tokens in main sources (`duplicate-clone`) fails: extract
  a function, also when the copy has other names and literals. A package must not depend on a less stable one (`stability-direction`).
- A file stays within 300 lines (a test file 500). A package folder holds at most 6 files and 6
  test files directly: group the rest into subpackages by what they do. Java sources follow the
  `nitpicker-java` rules.
- Every branch you add needs a test: changed-branch coverage runs on your change. A surviving or uncovered
  mutant (`mutant-survived`, `mutant-nocoverage`) of your code fails as well: pin the boundary or the result
  with an assertion, or test the function that nothing reaches. The mutants of code the compiler generates
  (coroutine state machines, data class members, `inline` copies) are left out already.
- Plan tests to be fast (`slow-test`): a test dispatcher or fake clock instead of
  waits, a test slice instead of a full context.
- Never wait a fixed time in a test (`pmd/FixedSleepInTest`): no `Thread.sleep`, `TimeUnit.sleep`
  or `delay` inside `runBlocking`. Wait on the condition in a loop against a deadline or with
  Awaitility, use `runTest` with virtual time for coroutines, and `verify(mock, timeout(1000))`
  for a mock. `join(ms)` and `wait(ms)` return when time runs out and the test goes on unchecked:
  assert the result. A sleep in a mock answer, a thread or `launch` body, or a test fake that
  implements or extends a main class is fine. To show that something does not happen, give the
  code a clock the test moves forward, not `after(ms).never()`, `during(...)` or kotest
  `continually` (`pmd/NegativeWaitInTest`). Inside `runTest`, `delay` must run on the test scheduler:
  a `delay` in `withContext(Dispatchers.IO)`, `Dispatchers.Default` or a thread-pool dispatcher, in a
  `launch` or `async` on one that the test joins or awaits, in `runTest(Dispatchers.IO)`, on
  `Dispatchers.Main` without a `setMain` applied to the test class, and in a Kotest body outside `runTest`
  without `coroutineTestScope = true` waits for real, also in a test helper or a counted loop
  (`pmd/FixedSleepInTest`); pass the test dispatcher to the code instead.
- Do not skip or focus tests (`pmd/DisabledTest`, `pmd/FocusedTest`): no `@Disabled`, `@Ignore` or
  `@Ignored` (nor an alias or an annotation that carries one), Kotest `xtest`, `xcontext`, `xdescribe`,
  `xit`, `xshould`, `xgiven` or a `!` name prefix, no `.config(enabled = false)`, `invocations = 0` or other
  config that never runs, no constant false `@EnabledIf` and no `assumeTrue(false)`; no `f:` name prefix,
  `ftest`, `fcontext`, `fit`. Fix the test or delete it; limit it to an environment with `@EnabledOnOs` or
  an assumption on a real condition when it cannot run elsewhere.
- Assert unconditionally (`pmd/AssertionInControlFlow`): no assertion that can be skipped, inside an `if`,
  a `when`, any loop (also over results), a safe call (`?.let`), `takeIf`, `&&`, `||`, `?:`, a `try` that
  swallows the failure, a `runCatching`, or after an early `return`. An `if`/`else` or `when` whose every
  branch asserts or fails is fine, and so are Kotest `checkAll` and `forAll`. Split the cases into separate
  tests or a parameterized test (`@ParameterizedTest` with `@MethodSource` or `@CsvSource`, Kotest
  `withData`), assert a whole collection at once, and narrow with `assertNotNull`, `assertIs` or
  `?: fail(...)` instead of an `if`.
- A test owns the coroutines it starts (`pmd/CoroutineEscapesTest`): do not `launch`, `async`, `launchIn`,
  `stateIn` or `shareIn` on `CoroutineScope(...)`, a scope field, a scope a helper returns,
  `viewModelScope`, or a `TestScope` outside `runTest` and leave it running; `with`, `run`, `apply` or
  `also` on such a scope does not help. Run the body in `runTest`, launch from there
  (`backgroundScope.launch` for work that ends with the test), keep the job and `join()` it or `await()` the
  deferred (a collection of them too), or build the scope on the test dispatcher and drive it with
  `advanceUntilIdle`; a scope the test class cancels in `@AfterEach` or Kotest `afterSpec` is owned too.
- A `@SpringBootTest` class uses its context: it injects a bean or a `MockMvc`, `WebTestClient` or
  `TestRestTemplate`, or it starts a web server port. Otherwise create the class with its
  constructor in a unit test, or use a slice (`pmd/SpringUnusedContext`).
- A function or file already over a limit may be edited but must not get worse: put new code in a
  new function or file and call it.
- A string of five characters or more used three times in a main file gets one
  `private const val NAME = "..."` (`kotlin-source/RepeatedStringLiteral`); annotation arguments,
  `when` labels, named arguments, map keys and message keys are not counted.
