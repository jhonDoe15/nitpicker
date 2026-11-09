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
- Never wait a fixed time (`FixedSleepInTest`): wait on the condition with Awaitility when the
  tests use it (`await().atMost(Duration.ofSeconds(5)).until(...)`), otherwise in a loop against a
  deadline; `verify(mock, timeout(1000))` for a mock, not `after(1000)`. `parkNanos` and
  `pollDelay(...).until(() -> true)` are fixed waits too. `join(ms)` and `wait(ms)` are timed
  waits: they return early, but the test goes on unchecked when the time runs out, so assert the
  result of `join(Duration)` or of a latch `await`. A sleep that simulates slow work in a mock
  answer, a thread body or a test fake that implements or extends a main class is fine. To
  show something does not happen, give the code a `Clock` or scheduler the test moves forward, not
  `after(ms).never()` or `during(...)` (`NegativeWaitInTest`).
- No retries in test code (`RetryInTest`): no `@RetryingTest`, `@RepeatedIfExceptionsTest`, TestNG
  `retryAnalyzer`, `IRetryAnalyzer` or `RetryAnalyzerCount`, nor `setRetryAnalyzer(...)`. A test that
  passes on a later attempt hides a flaky or racy test: wait on the condition instead of a fixed
  delay, isolate shared state. `@RepeatedTest` is fine, since every repetition must pass.
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
- Tests get the same PMD, Checkstyle, Error Prone and formatter checks as main code, plus the file
  (500 lines) and folder (6 files) limits. SpotBugs, the method limits, CRAP and duplicate detection
  read main sources only. In a test, use `assertThrows` instead of a try/catch. Spring rules apply
  to main sources only, as do the enum predicate, forwarding wrapper, singular-and-plural and
  class-load rules.
  If a PMD rule or an Error Prone check flags test code that is right, ask a human for a reviewed
  exception for `pmd/<rule>` or `errorprone/<Check>`.
