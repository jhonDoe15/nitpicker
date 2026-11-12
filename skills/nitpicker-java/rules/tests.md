# Tests

Part of the [nitpicker-java](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Every branch you add needs a test, both outcomes of each `if`, `?:` and `catch`: each changed
  line must have at least 95% of its branches covered (`changed-branch-coverage`).
- Mutation testing runs on your change. Assert exact values and test both sides of each boundary
  (`discountCents(1000, 10)` and `(1000, 9)`); a new mutant that survives or has no test
  (`mutant-survived`, `mutant-nocoverage`) fails. If no input can kill a mutant, the code is
  redundant: delete or simplify it. A `compareTo` boundary or an ignored lambda result that truly
  cannot be told apart takes an exception for `pit/mutant-survived`.
- Plan tests to be fast (`slow-test`): a fake clock instead of `Thread.sleep`, a test
  slice instead of `@SpringBootTest`.
- In a Reactor chain (`reactor-core` on the classpath), no blocking call (`Files.*`, JDBC, `Future.get()`,
  `Thread.sleep`, `block()`) inside `map`, `flatMap`, `doOnNext` and the other operators: wrap it as
  `Mono.fromCallable(() -> blocking()).subscribeOn(Schedulers.boundedElastic())` or put
  `publishOn(Schedulers.boundedElastic())` before the operator (a `publishOn` after it does not move it); a method returning a `Mono` or `Flux` never calls `block()`
  (`ReactorBlockingInOperator`, `ReactorBlockInReactiveMethod`).
- Never wait a fixed time (`FixedSleepInTest`): wait on the condition with Awaitility when the
  tests use it (`await().atMost(Duration.ofSeconds(5)).until(...)`), otherwise in a loop against a
  deadline; `verify(mock, timeout(1000))` for a mock, not `after(1000)`. `parkNanos` and
  `pollDelay(...).until(() -> true)` are fixed waits too. `join(ms)` and `wait(ms)` are timed
  waits: they return early, but the test goes on unchecked when the time runs out, so assert the
  result of `join(Duration)` or of a latch `await`. A sleep that simulates slow work in a mock
  answer, a thread body or a test fake that implements or extends a main class is fine. To
  show something does not happen, give the code a `Clock` or scheduler the test moves forward, not
  `after(ms).never()` or `during(...)` (`NegativeWaitInTest`).
- Assert the value, not that something is there (`WeakAssertionInTest`): no `assertNotNull(x)`, AssertJ
  `isNotNull()` or Hamcrest `notNullValue()` as the whole check, no `isNotEmpty()`, `assertFalse(c.isEmpty())`
  or `assertTrue(c.size() > 0)`, and no `verify(m).f(any())` whose arguments are all `any()`. Assert the
  exact value, contents or length and the call's arguments; `verify(m, never())` is fine. The same goes for
  `assertTrue(x != null)` (`SimplifiableTestAssertion`): assert the exact value.
- No retries in test code (`RetryInTest`): no `@RetryingTest`, `@RepeatedIfExceptionsTest`, TestNG
  `retryAnalyzer`, `IRetryAnalyzer` or `RetryAnalyzerCount`, nor `setRetryAnalyzer(...)`. A test that
  passes on a later attempt hides a flaky or racy test: wait on the condition instead of a fixed
  delay, isolate shared state. `@RepeatedTest` is fine, since every repetition must pass.
- Compare floating-point numbers with a tolerance (`FloatEqualityInTest`): no `assertEquals`,
  `assertNotEquals`, AssertJ `isEqualTo` or Hamcrest `is(...)`/`equalTo(...)` against a fractional
  literal such as `0.1`. Use `assertEquals(expected, actual, 1e-9)`,
  `assertThat(actual).isCloseTo(expected, within(1e-9))` or `closeTo(expected, 1e-9)`; the same goes
  for `assertTrue(x == 0.1)` and `assertThat(x == 0.1).isTrue()`, which need
  `Math.abs(x - 0.1) < 1e-9` or `isCloseTo`. An AssertJ `using...Comparator(...)` is fine. An
  integral literal such as `1.0` is exact and fine.
- Use a production constant by name, never a copy of its value (`pmd/CopiedConstantInTest`):
  `Limits.MAX_LENGTH + 1`, not `65`. Pin a contract value as `assertEquals(64, Limits.MAX_LENGTH)`.
- Never mock the class under test (`MockedSubjectInTest`): no `mock(OrderService.class)` or `@Mock`
  of it in `OrderServiceTest`, and no `spy`/`@Spy` of it whose own methods you stub. Pass its
  collaborators in through the constructor with fakes or mocks of them, and test a helper through
  the public method that calls it. No `mockStatic`/`mockConstruction` of the project's own classes
  (`StaticMockOfProjectType`): inject an instance, a function or a `Clock` instead.
- A test puts back the process-wide state it changes (`GlobalStateLeakInTest`): a system property, the default
  `Locale` or `TimeZone`, `System.out`/`err`/`in`, a default handler or security provider, or a static field or static
  setter of a project class. Set it through junit-pioneer (`@SetSystemProperty`, `@RestoreSystemProperties`,
  `@DefaultLocale`, `@DefaultTimeZone`) or system-stubs, or save the old value and restore it in `finally` or
  `@AfterEach`/`@AfterAll`.
- No real clock, unseeded randomness or network in tests (`RealClockInTest`, `RandomInTest`, `NetworkInTest`): pass the
  subject a `Clock.fixed(...)` or a fixed `Instant` instead of `Instant.now()`/`LocalDate.now()`/
  `System.currentTimeMillis()`; use `new Random(42)` and fixed values instead of `new Random()`, `Math.random()` or
  `ThreadLocalRandom`, and compare a fixed UUID, not `UUID.randomUUID()`; in a unit test, point HTTP clients at
  `localhost` (MockWebServer, WireMock, `MockRestServiceServer`) or a mock. Measuring time is fine (`System.nanoTime()`,
  `now()` compared with a deadline in a polling loop). Calls to a real service belong in an integration test (`*IT`,
  an integration source set, or `@SpringBootTest`).
- Start a container, server or process once, not for each test (`ServerOrContainerPerTest`): a
  Testcontainers `@Container` field is `static`, a WireMock `@RegisterExtension` is `static`, a JUnit 4
  server or container is a `@ClassRule`, and `@BeforeEach`/`@Before` does not create and start one
  (nor `SpringApplication.run`, `ProcessBuilder.start`); two tests do not make the same start. Start
  it in `@BeforeAll` and reset its state between tests.
- Tests do not change state that other tests of the class see (`SharedTestState`): no write from a test to a
  static field, a static collection, map, array, `StringBuilder` or atomic, or (with `@TestInstance(PER_CLASS)` or
  in a TestNG class) an instance field. Create the state in the test, or assign or `clear()` it in `@BeforeEach`;
  state built once in `@BeforeAll` is fine while the tests only read it.
- Tests print nothing new (`test-runtime/test-console-output`): no `System.out`/`System.err`, and
  no new `WARN` or `ERROR` log line from the code under test. Fix the cause the line names.
- Test each public inverse pair on its own output (`pmd/UntestedRoundTrip`): for `Codec.encode`/
  `Codec.decode` or `toJson`/`fromJson`, one test calls both,
  `assertEquals(value, Codec.decode(Codec.encode(value)))`.
- Tests get the same PMD, Checkstyle, Error Prone and formatter checks as main code, plus the file
  (500 lines) and folder (6 files) limits. SpotBugs, the method limits, CRAP and duplicate detection
  read main sources only. In a test, use `assertThrows` instead of a try/catch. Spring rules apply
  to main sources only, as do the enum predicate, forwarding wrapper, method alias, singular-and-plural
  and class-load rules.
  If a PMD rule or an Error Prone check flags test code that is right, ask a human for a reviewed
  exception for `pmd/<rule>` or `errorprone/<Check>`.
