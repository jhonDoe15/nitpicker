# Tests

Part of the [nitpicker-kotlin](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Test sources are linted like main ones (detekt, and ktlint or ktfmt): the rules of these pages, including `!!`, apply
  in tests. detekt keeps its default exclusions for tests, so magic numbers, `lateinit`, many functions,
  duplicated string literals, spread operators and function names in backticks are not findings in a
  test. A test asserts on the specific exception (`assertFailsWith<IllegalStateException> { ... }`)
  instead of catching `Exception`, whatever the variable is called.
- Design for a fixed clock and a seeded random: take a `java.time.Clock` and a `kotlin.random.Random`
  as constructor parameters, and read environment variables once where `fun main` (or the
  `@SpringBootApplication` class, or the Ktor module) builds the objects, into a config class passed in.
- Program output: no `print` or `println`, and no `System.out` or `System.err` outside the file with
  `fun main` (`kotlin-source/StandardStreamOutsideEntryPoint`). Code takes an `Appendable`,
  `PrintStream` or `Writer` parameter and writes to it; `fun main` passes `System.out` or `System.err`.
  Logging goes through the logger.
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
- No retries in test code (`pmd/RetryInTest`): no `@RetryingTest`, `@RepeatedIfExceptionsTest`, TestNG
  `retryAnalyzer`, `IRetryAnalyzer`, `RetryAnalyzerCount` or `setRetryAnalyzer(...)`, and no Kotest
  `retries` (`.config(retries = n)`, `retries = n` in a spec, `override val retries` in a project or
  package config, `TestConfig(retries = n)`). A test that passes on a later attempt hides a flaky or
  racy test: wait on the condition instead of a fixed delay, isolate shared state. `retries = 0` and
  `@RepeatedTest` are fine.
- Never mock the class under test (`pmd/MockedSubjectInTest`): no `mockk<OrderService>()`,
  `mock<OrderService>()` or `@MockK` of it in `OrderServiceTest`, and no `spyk`/`@SpyK` of it with
  `every { subject.helper() }`. Pass its collaborators in through the constructor with fakes or mocks
  of them, and test a helper through the public function that calls it. No `mockkObject`,
  `mockkStatic`, `mockkConstructor` or `mockStatic` of the project's own code
  (`pmd/StaticMockOfProjectType`): pass a function, an interface or a `Clock` instead.
- A test puts back the process-wide state it changes (`pmd/GlobalStateLeakInTest`): a system property, the default
  `Locale` or `TimeZone`, `System.out`, `Dispatchers.setMain`, or a property of a project `object`. Restore it in
  `finally`, an `@AfterEach`/`@AfterTest` function or Kotest `afterTest { }` (`Dispatchers.resetMain()`), or use an
  extension that restores it (junit-pioneer `@RestoreSystemProperties`, Kotest `withSystemProperty { }`).
- Start a container, server or process once, not for each test (`pmd/ServerOrContainerPerTest`): a
  `@Container` or WireMock `@RegisterExtension` property lives in a companion object, a Kotest
  container extension uses the spec lifecycle (not `ContainerLifecycleMode.Test` or `perTest()`),
  and `@BeforeEach`, `beforeTest` or `beforeEach` does not create and start one; two tests do not
  make the same start. Start it in `@BeforeAll` or a spec-level extension and reset its state.
- Tests do not change state that other tests of the class see (`pmd/SharedTestState`): no write from a test to a
  `var` or mutable collection in a companion object or top-level property, to a property of a
  `@TestInstance(PER_CLASS)` class, or to a `var` or mutable collection in a Kotest spec body (one spec instance
  runs all its tests). Create the state in the test, assign or `clear()` it in `@BeforeEach` or `beforeTest { }`,
  or give the spec `isolationMode = IsolationMode.InstancePerTest` (or `InstancePerLeaf`).
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
