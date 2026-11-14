# Kotlin: nitpicker source checks

The Kotlin source checks, the compiler warnings and the ktlint and ktfmt format checks of the Kotlin preset. This page lists 86 rules. [All pages](README.md).

The guide for these rules: [docs/kotlin-preset/source-checks.md](../kotlin-preset/source-checks.md).

In the Kotlin preset, an entry of `exceptions` names a detekt rule as `detekt.<ruleset>.<Rule>`, one of these rules: `catch-log-without-exception`, `test-without-assertion`, `spring/open-in-view`, `spring/missing-enable`, `spring/datasource-without-timeout`, `spring/unbound-property`, `spring/ddl-auto`, `spring/risky-startup-flags`, `spring/actuator-exposure`, `spring/error-details`, `spring/unsafe-diagnostics`, `spring/active-profile`, `spring/literal-secret`, `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `package-cycle`, `no-production-runtime`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `migration-order`, `migration-hardcoded-name`, `start-schema-push`, `foreign-key-index`, `co-change`, `duplicate-definition`, `exported-name-collision`, `sibling-copy-edit`, `near-duplicate`, `decided-condition`, `duplicate-branch`, `shared-used-by-one-feature`, `feature-internal-import`, `shared-imports-feature`, `feature-cycle`, `foreign-feature-persistence`, `public-alternative-bypass`, `test-only-export`, `doc-comment-content`, `test-console-output`, `mutable-state-escape`, `context-threading`, `caller-protocol`, `protocol-contract`, `forwarding-chain`, `disjoint-consumer-groups`, `data-clump`, `repeated-policy-decision`, `foreign-state-decision`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`, `test-runtime/slow-test`, `test-runtime/test-console-output`, `test-runtime/test-not-run`, `coupling/test-only-export`, `pmd/UntestedRoundTrip`, `pmd/CopiedConstantInTest`, `kotlin-source/ChildCoroutineOutlivesResource`, `kotlin-source/SuspendFunInFinallySection`, `kotlin-source/UnboundedFanOut`, `kotlin-source/UnboundedReactiveFanOut`, `kotlin-source/UnsafeCastOperator`, `kotlin-source/ListUsedAsSet`, `kotlin-source/LinearLookupInLoop`, `kotlin-source/RedundantStreamStep`, `kotlin-source/SortForExtreme`, `kotlin-source/ConfigurationReadOutsideCompositionRoot`, `kotlin-source/FutureWithoutException`, `kotlin-source/UnhandledRootCoroutine`, `kotlin-source/ReactorBlockWithoutTimeout`, `kotlin-source/UnboundedWait`, `kotlin-source/CleanupSkippedOnFailure`, `kotlin-source/UnboundedCollectionProperty`, `kotlin-source/CachedDeferredKeepsFailure`, `kotlin-source/PendingFuturesNotFailedOnClose`, `kotlin-source/TimerNotStoppedOnClose`, `kotlin-source/RepeatedStringLiteral`, `kotlin-source/LogFormatArguments`, `kotlin-source/LogExceptionFirst`, `kotlin-source/SimplerBooleanLogic`, `kotlin-source/OperandSlip`, `kotlin-source/ProcessWaitWithoutTimeout`, `kotlin-source/UnorderedQuery`, `kotlin-source/UnboundedQueryArray`, `kotlin-source/RegexPartDefect`, `kotlin-source/BacktrackingRegex`, `kotlin-source/UnquotedRegexValue`, `kotlin-source/PlainTextRegex`, `kotlin-source/UnclosedInlineResource`, `kotlin-source/LogStringConcatenation`, `kotlin-source/ShellCommand`, `kotlin-source/IoCallInLoop`, `kotlin-source/StandardStreamOutsideEntryPoint`, `kotlin-source/CatchOnlyLogsOrReturnsDefault`, `kotlin-source/BooleanFlagParameter`, `kotlin-source/MutableModuleState`, `kotlin-source/GenericTypeName`, `kotlin-source/GenericFileName`, `kotlin-source/GenericPackageName`, `kotlin-source/GeneratedOnHandWrittenCode`, `kotlin-source/JvmSyntheticOnHandWrittenCode`, `kotlin-source/MutationIgnoreMarker`, `kotlin-source/CommentedOutCode`, `kotlin-source/HardcodedSecret`, `kotlin-source/CredentialLiteral`, `kotlin-source/SecretInLog`, `kotlin-source/TestClassWithoutTestCases`, `kotlin-source/DetachedTestCase`, `kotlin-source/TestHelperInSource`, `kotlin-source/HttpWithoutTimeout`, `kotlin-source/UnsafeDeserialization`, `kotlin-source/WeakHash`, `kotlin-source/TlsVerificationOff`, `kotlin-source/SqlStringBuilding`, `kotlin-source/CompatibilityShim`, `kotlin-source/ParameterMutation`, `kotlin-source/TriStateBoolean`, `kotlin-source/DefaultTimeZone`, `kotlin-source/LegacyCalendarApi`, `kotlin-source/TimeUnitMismatch`, `kotlin-source/UriCreateDynamic`, `kotlinc/deprecation`, `kotlinc/unchecked`, `kotlinc/cast`, `kotlinc/lint-not-run`, `pmd/FixedSleepInTest`, `pmd/NegativeWaitInTest`, `pmd/DisabledTest`, `pmd/FocusedTest`, `pmd/RetryInTest`, `pmd/ServerOrContainerPerTest`, `pmd/AssertionInControlFlow`, `pmd/CoroutineEscapesTest`, `pmd/FloatEqualityInTest`, `pmd/WeakAssertionInTest`, `pmd/DroppedCallbackInTest`, `pmd/MessageAfterAssertion`, `pmd/GlobalStateLeakInTest`, `pmd/SharedTestState`, `pmd/MockedSubjectInTest`, `pmd/StaticMockOfProjectType`, `pmd/RelaxedMockInTest`, `pmd/SpringUnusedContext`, `pmd/ExhaustiveEnumPredicate`, `pmd/StaticForwardingWrapper`, `pmd/ForwardingMethodAlias`, `pmd/SingularAndPluralMember`, `pmd/timeout-abandons-operation`, `pmd/NonAtomicUpdateAcrossSuspension`, `pmd/SwallowedInterrupt`, `pmd/SwallowedCancellation`, `pmd/LockOrderInversion`, `pmd/InconsistentFieldLocking`, `pmd/ServiceLocatorLookup`, `pmd/ValidationAnnotationTarget`, `pmd/ClassLoadEffect`, `pmd/UnboundedThreadPool`, `pmd/RecursiveMapUpdate`, `pmd/StreamedRowsCollected`, `pmd/ReusableObjectPerCall`, `pmd/GeneratedMemberCycle`, `pmd/GeneratedEqualsSkipsSuperclass`, `pmd/SpringConstructorInjection`, `pmd/SpringImmutableBeans`, `pmd/SpringNoServiceLocator`, `pmd/SpringNoLazyInjection`, `pmd/SpringStaticPostProcessorBean`, `pmd/SpringOrderedProvider`, `pmd/SpringUnreleasedResource`, `pmd/SpringStartupCleanup`, `pmd/SpringLiteConfiguration`, `pmd/SpringNoComponentScan`, `pmd/SpringBeanCollectionState`, `pmd/SpringHttpClientPerCall`, `pmd/SpringHttpClientTimeouts`, `pmd/SpringNoPostConstructIo`, `pmd/SpringTypedConfiguration`, `pmd/SpringValueSecretDefault`, `pmd/SpringNullOnlyConfigCheck`, `pmd/SpringProfileOnConfiguration`, `pmd/SpringProxyMethodVisibility`, `pmd/SpringProxySelfCall`, `pmd/SpringTransactionalAnnotation`, `pmd/SpringNoTransactionalController`, `pmd/SpringNoRequiresNew`, `pmd/SpringNoSwallowedTransactionException`, `pmd/SpringTransactionalCheckedRollback`, `pmd/SpringTransactionalReadOnlyWrite`, `pmd/SpringMultiWriteWithoutTransaction`, `pmd/SpringCacheWriteInTransaction`, `pmd/SpringLocalCacheWriteInTransaction`, `pmd/SpringAsyncExecutor`, `pmd/SpringScheduledFixedDelay`, `pmd/SpringComposedMapping`, `pmd/SpringRestController`, `pmd/SpringValidRequestBody`, `pmd/SpringTypedResponse`, `pmd/SpringTypedRequestBody`, `pmd/SpringNoErrorLeak`, `pmd/SpringNoCrossOrigin`, `pmd/SpringCorsWildcard`, `pmd/SpringPasswordEncoder`, `pmd/SpringPermitAllAnyRequest`, `pmd/SpringCsrfDisabled`, `pmd/SpringHardcodedUser`, `pmd/JpaLazyFetching`, `pmd/JpaEntityClass`, `pmd/JpaManyToManyCascade`, `pmd/JpaMultipleCollectionFetch`, `pmd/JpaManyToManySet`, `pmd/JpaVersion`, `pmd/JpaSequenceIds`, `pmd/JpaEnumString`, `pmd/JpaUnindexedForeignKey`, `pmd/JpaIdentityHashCode`, `pmd/SpringDataDerivedQuery`, `pmd/SpringDataNativeQuery`, `pmd/SpringDataWriteWithoutTransaction`, `pmd/SpringDataModifyingQuery`, `pmd/SpringDataNoSaveInLoop`, `pmd/SpringDataNoFlush`, `pmd/SpringDataNamedParameters`, `pmd/SpringDataQueryTextBlock`, `pmd/SpringDataBatchOfOne`, `pmd/SpringDataRowWriteInLoop`, `pmd/SpringDataSaveInLoopHelper`, `pmd/SpringDataFilterInQuery`, `pmd/SpringQueryConcatenation`, `unused-option`, `kotlin-source/BlockingCallInCoroutine` and `kotlin-source/TimeoutWithoutSuspension`, or, for the Java sources of the project, a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `javac`, `forbiddenapis`, `dependencies`, `spring` and `test-runtime`.

Unless an entry says otherwise:

- **Presets:** Kotlin
- **Analyzers:** `kotlin`
- **Builds:** Gradle and Maven
- **Why it is on:** A scan of the Kotlin sources on the Node side, after comments and string bodies are masked, reports it: the Kotlin counterpart of a TypeScript, Java or Python rule that narrows one spot to one allowed form.

<a id="detekt-catch-log-without-exception"></a>

### `detekt/catch-log-without-exception`

A `catch` block that logs a failure without passing the caught exception to the logger.

- **Why it is on:** A scan of the Kotlin sources on the Node side reports it under the tool detekt.
- **Allowed form:** Pass the caught exception to the logger as its own argument so the stack trace is kept (log.error("what failed", e), or logger.error(e) { "what failed" }). e.message, e.toString() and a string template of the exception drop it.
- **Exception:** If this is intended, add `{"rule":"catch-log-without-exception","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/source-scans.md)

<a id="detekt-inline-suppression"></a>

### `detekt/inline-suppression`

An inline `@Suppress` of a detekt or ktlint rule, a ruleset, `all` or a compiler warning the kotlinc lint reports.

- **Why it is on:** A `@Suppress` would hide a finding from the report, so a source scan reports every token that targets one.
- **Exception:** No exception applies: the routes are to fix the code, and `exclude` for generated code.
- **Allowed forms by message:**
  - `detekt.<ruleset>`: Suppressing "detekt.style" inline is not allowed. Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json.
  - `UNCHECKED_CAST`: Suppressing "UNCHECKED_CAST" inline is not allowed. Fix the code the compiler warns about.
- **See also:** [Kotlin preset guide](../kotlin-preset/one-way-rules.md)

<a id="detekt-test-without-assertion"></a>

### `detekt/test-without-assertion`

A test method that calls no assertion.

- **Why it is on:** A scan of the Kotlin sources on the Node side reports it under the tool detekt.
- **Allowed form:** Assert the result (assertEquals, assertFailsWith, `shouldBe`, MockK `verify`): this test has no assertion, so it passes whenever the code does not throw. A project helper that asserts is learned from the tests that end with it (conventions kotlin.assertionHelpers).
- **Exception:** If this is intended, add `{"rule":"test-without-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/source-scans.md)

<a id="kotlin-source-backtrackingregex"></a>

### `kotlin-source/BacktrackingRegex`

The same literal patterns with nested or overlapping quantifiers that backtrack super-linearly (`^(a+)+$`).

- **Allowed form:** This regex backtracks super-linearly on some inputs: rewrite it without nested or overlapping quantifiers, or use a string function. An exception fits only when the input is bounded and trusted.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/BacktrackingRegex","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-blockingcallincoroutine"></a>

### `kotlin-source/BlockingCallInCoroutine`

A blocking call in coroutine code that nothing offloads: `Files.*`, file, JDBC, `Future.get()`, `latch.await()`, `queue.take()`, `Mono.block()`.

- **Allowed form:** `<call>` blocks the thread inside the coroutine code of `<function>` (\<what blocks>), so the other coroutines on that thread wait and cancellation cannot interrupt it. Run it in `withContext(ioDispatcher) { ... }` (`runInterruptible(ioDispatcher) { ... }` for an interruptible wait such as `Future.get()`) with an injected `CoroutineDispatcher`, or call a suspending API instead.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/BlockingCallInCoroutine","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-booleanflagparameter"></a>

### `kotlin-source/BooleanFlagParameter`

An unannotated `Boolean` parameter (not a nullable `Boolean?`) of a public function that is the condition of an `if`, a `when` (its subject or a branch of a subject-less one) or a `while`, also as `== true` or in `&&`/`||`, and a name the body rebinds (a loop variable, a lambda parameter, a `val`) is not the flag; private, `internal`, `protected` and `override` functions, functions of a private or `internal` class, local functions, setters, `with*`, `of`/`from`/`valueOf`/`builder` are skipped.

- **Allowed form:** Split the function into two functions named for each behavior, or pass an enum or a small data class: this boolean parameter switches the function between two behaviors, which makes the call site unreadable.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/BooleanFlagParameter","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-cacheddeferredkeepsfailure"></a>

### `kotlin-source/CachedDeferredKeepsFailure`

A `val x by lazy { ... }` whose block starts an `async`, `supplyAsync`, `future` or `CompletableDeferred`, and a `var` property typed `Deferred`, `CompletableDeferred`, `CompletableFuture` or `Future` of a class that assigns it from one of those on the same line (`conn = scope.async { ... }`, `conn ?: scope.async { ... }`), tests it (`== null`, `!= null`, `?:`, `?.`, `if (conn`) and has no function that sets it back to `null` after a `catch`, `invokeOnCompletion`, `whenComplete`, `exceptionally`, `handle`, `onFailure` or `finally`. A first failure then stays cached and every later call replays it. An eager `val conn = scope.async { ... }` is left alone, and the identity check of the stale-attempt form is not read (the Kotlin check reports only the cache that is never reset) A `Deferred` or `Job` field that is started and cancelled in `stop()` is not a cache: the reuse must return or await the stored value. A local attempt stored in the property is read.

- **Allowed form:** This property caches a Deferred or future and later calls reuse it, but nothing resets it when the attempt fails, so a first failure is replayed to every later caller instead of being retried. Reset it on failure and only while it still holds this attempt (`val attempt = scope.async { open() }; conn = attempt; attempt.invokeOnCompletion { if (it != null && conn === attempt) conn = null }`), and do not wrap the attempt in `by lazy`. An exception fits only when keeping the first failure is intended.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CachedDeferredKeepsFailure","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-catchonlylogsorreturnsdefault"></a>

### `kotlin-source/CatchOnlyLogsOrReturnsDefault`

A `catch` that neither throws (`throw`, or an unqualified `error`, `TODO` or `fail` call), nor calls `ensureActive()`, nor uses the exception, nor answers with an error response; log calls and `printStackTrace` do not count (so it is the one finding for a catch that only logs); an interrupt and a retry loop are skipped.

- **Allowed form:** Rethrow it with the cause (`throw OrderException(message, e)`), return a failure result that carries the exception (`Result.failure(e)`), or answer with an error response: this catch only logs the failure or returns a default, and carries on.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CatchOnlyLogsOrReturnsDefault","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-childcoroutineoutlivesresource"></a>

### `kotlin-source/ChildCoroutineOutlivesResource`

`launch` or `async` in an outer scope inside `x.use { }`, reading the resource, when the launched job is not joined in the block.

- **Allowed form:** `launch` starts a child coroutine in an outer scope, which keeps running after this `use` block, and the child reads `<resource>`; `use` closes the resource when the block ends, so the child can run on a closed resource. Start the child inside `coroutineScope { ... }` or `supervisorScope { ... }` in the block, wait for the launched job before the block ends (`job.join()`, `deferred.await()` or `joinAll(...)`, outside any `if`, loop or `catch` that the launch is not in), or open and close the resource inside the child (`scope.launch { open().use { ... } }`).
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ChildCoroutineOutlivesResource","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-cleanupskippedonfailure"></a>

### `kotlin-source/CleanupSkippedOnFailure`

In a function named `close`, `dispose`, `destroy`, `shutdown`, `stop`, `teardown`, `tearDown`, `disconnect`, `end` or `cleanup`, or annotated `@AfterEach`, `@AfterAll`, `@After`, `@AfterClass` or `@PreDestroy`: a statement of the function body that calls `close`, `disconnect`, `destroy`, `stop`, `terminate`, `unsubscribe`, `dispose` or `quit` with no arguments (also `?.`) and is followed in the same block by another such release (`shutdown` counts as a later step) or a reset (`x = null`, `clear()`). A release inside `use`, `try`, `runCatching` or a lambda is not a statement of that block Releases on one line (`a.close(); b.close()`) are separate steps.

- **Allowed form:** This release can throw, so the release or reset after it in the same block never runs and a connection stays open or the state is not reset. Release each resource in `use` or try/finally (or catch each release and rethrow the first failure after the rest ran). An exception fits only when a failed release should abort the remaining ones.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CleanupSkippedOnFailure","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-commentedoutcode"></a>

### `kotlin-source/CommentedOutCode`

A run of line comments, or a block comment (main and test sources), whose first code-shaped line is a declaration, call, assignment, control header, `fun`, `class`, import or return; the cases skipped are listed below the table.

- **Allowed form:** Delete the commented-out code; version control keeps it.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CommentedOutCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-compatibilityshim"></a>

### `kotlin-source/CompatibilityShim`

A `@Deprecated` annotation (not on an `override` member, also with `override` on the line above), and a top-level `typealias Old = New` where `New` is a class, interface, object or alias declared in the same file.

- **Allowed form:** Delete the deprecated declaration and change its callers to the replacement in the same change: `@Deprecated` and a second name for one type (`typealias Old = New`) keep two APIs alive.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CompatibilityShim","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-configurationreadoutsidecompositionroot"></a>

### `kotlin-source/ConfigurationReadOutsideCompositionRoot`

In main sources, `System.getProperty` of an application key (not `java.*`, `user.*`, `os.*`, `file.*`, `line.*`, `path.*`, `javax.*`, `jdk.*`, `sun.*`, `com.sun.*`, `http.*`, `https.*`, `ftp.*` or `socks*`), `System::getProperty`, `Integer.getInteger`, `java.lang.Long.getLong` and `java.lang.Boolean.getBoolean`, in a file that is not a composition root (`fun main`, a `@JvmStatic fun main`, the `@SpringBootApplication` class or a Ktor module) and does not use a framework's configuration type (Spring `@Configuration`, `@AutoConfiguration`, an `EnvironmentPostProcessor` or `ApplicationContextInitializer`, Micronaut `@Factory` or `@ConfigurationProperties`, Quarkus `@QuarkusMain` or `QuarkusApplication`, a Dagger `@Module`, a Guice `AbstractModule` or `Module`, Dagger or Guice `@Provides`, CDI `@Produces`, imported and used as an annotation or supertype); `System.getenv` is detekt's `ForbiddenMethodCall`, with the same files allowed. In a Spring project it is dropped where `SpringTypedConfiguration` reports the same line.

- **Allowed form:** Read environment variables and system properties once in the composition root (the file with `fun main`, a Ktor `Application` module, a Guice or Dagger module, a CDI or Micronaut factory) or through the typed configuration of the framework, and pass the values in through constructors or parameters, not `System.getProperty`, `Integer.getInteger`, `java.lang.Long.getLong` or `java.lang.Boolean.getBoolean`. JVM properties such as `java.*`, `user.*`, `javax.*`, `jdk.*` and `http.*` are fine. A library reading its own opt-in switch (`-Dmylib.debug`) takes an exception.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ConfigurationReadOutsideCompositionRoot","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-credentialliteral"></a>

### `kotlin-source/CredentialLiteral`

An AWS key, a GitHub or Slack token, a `sk_live_`/`sk-proj-` key, a private key header, a `django-insecure-` key, a password in a URL or a `password=` parameter, or a `Bearer`/`Basic`/`Token` value.

- **Allowed form:** Read it from the environment or a secrets manager: this string looks like a credential (access key, token, private key, or a password in a URL).
- **Exception:** If this is intended, add `{"rule":"kotlin-source/CredentialLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-defaulttimezone"></a>

### `kotlin-source/DefaultTimeZone`

In main sources, `now()` without arguments on `LocalDate`, `LocalDateTime`, `LocalTime`, `MonthDay`, `OffsetDateTime`, `OffsetTime`, `Year`, `YearMonth` or `ZonedDateTime`, `Clock.systemDefaultZone()`, `ZoneId.systemDefault()`, `TimeZone.getDefault()` and kotlinx.datetime `TimeZone.currentSystemDefault()`: each reads the JVM's default time zone, so the result changes with the server's `TZ` (the Java preset reports the same calls through Error Prone's `JavaTimeDefaultTimeZone` and `pmd/DefaultTimeZone`).

- **Allowed form:** Pass a `Clock` or a zone: `LocalDate.now(clock)` with an injected `Clock`, `ZoneId.of("UTC")` or a configured zone; with kotlinx.datetime, `TimeZone.UTC` or `TimeZone.of(zone)`. This reads the JVM default time zone, which changes with the server.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/DefaultTimeZone","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-detachedtestcase"></a>

### `kotlin-source/DetachedTestCase`

(test sources) a public no-argument function with a block body and no return type (or `: Unit`) named like a test (backticks, `test*`, `should*`) without an annotation, in a class that has tests; a helper or data provider that returns a value passes.

- **Allowed form:** Annotate the function with @Test so JUnit runs it, or make it private if it is a helper: this test never runs.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/DetachedTestCase","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-futurewithoutexception"></a>

### `kotlin-source/FutureWithoutException`

(main sources) a `suspendCancellableCoroutine { }` or `suspendCoroutine { }` block that calls `resume(...)` only inside a nested lambda or passes `it::resume` as a callback, and never calls or references `resumeWithException`, `resumeWith` or `cancel` on that continuation (its lambda parameter, or `it`); and a local declared in a function body `CompletableDeferred()` or `CompletableFuture()` completed with `complete(...)` only inside a nested lambda or through `x::complete`, with no `completeExceptionally`, `cancel`, `obtrudeException`, `orTimeout` or `completeOnTimeout` on it later in the block and not handed on (an argument, an assignment, a `to` pair). When the callback's work fails, the caller waits forever. Allowed: `continuation.resumeWithException(error)` or `deferred.completeExceptionally(error)` from the error callback, or a suspending API that throws by itself.

- **Allowed form:** Resume or complete it on the failure path too: call `continuation.resumeWithException(error)` or `deferred.completeExceptionally(error)` from the error callback, or use an API that throws by itself, such as a suspending client call or `future.await()` from kotlinx-coroutines. This continuation or future is resumed only with a value from a callback, so when the work behind the callback fails it never resumes and the caller waits forever.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/FutureWithoutException","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-generatedonhandwrittencode"></a>

### `kotlin-source/GeneratedOnHandWrittenCode`

An annotation whose name contains `Generated` (any package, also `@get:`/`@set:`) on a class, object, interface, function or constructor (JaCoCo skips them all, PIT skips `@Generated`), as the Java rule; `@GeneratedValue` and `@Generated` on a property (not `@get:`) pass.

- **Allowed form:** Remove the annotation from hand-written code: JaCoCo skips code carrying an annotation whose name contains Generated, and PIT skips @Generated, so this is not measured. Put the JPA @GeneratedValue on the field.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GeneratedOnHandWrittenCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-genericfilename"></a>

### `kotlin-source/GenericFileName`

A `.kt` file whose last name word is one of those (`StringUtils.kt`, `utils.kt`, `Utils2.kt`, `Utils.jvm.kt`) and that declares no type or `typealias` of that name (that one is `GenericTypeName`); framework roles pass.

- **Allowed form:** Name this file for what it holds (`PriceRounding.kt`), not Utils, Helper, Manager, Common or Misc. Pure logic shared between features goes in the shared package under such a name.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GenericFileName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-genericpackagename"></a>

### `kotlin-source/GenericPackageName`

A package with a segment `util`, `utils`, `utility`, `utilities`, `helper`, `helpers`, `manager`, `managers`, `common`, `commons`, `misc` or `miscellaneous`.

- **Allowed form:** Name this package for what it holds, not utils, helpers, common or misc. Pure logic shared between features goes in the shared package under a name that says what it does.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GenericPackageName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-generictypename"></a>

### `kotlin-source/GenericTypeName`

A class, interface, object or `typealias` whose name ends in `Util(s)`, `Utility`, `Utilities`, `Helper(s)`, `Manager(s)`, `Common(s)`, `Misc` or `Miscellaneous` (trailing digits ignored), also after an acronym (`IOUtils`); framework roles (`TransactionManager`) and a type that extends one with the same ending are skipped.

- **Allowed form:** Name this type for what it does (`PriceRounder`, `OrderTotals`), not Utils, Helper, Manager, Common or Misc. Pure logic shared between features goes in the shared package under such a name.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/GenericTypeName","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-hardcodedsecret"></a>

### `kotlin-source/HardcodedSecret`

A secret literal assigned to a name ending in `password`, `passwd`, `pwd`, `passphrase`, `secret`, `token`, `credentials`, `apiKey`, `privateKey`, `accessKey`, `secretKey`, `authKey`, `signingKey`, `encryptionKey`, `hmacKey` or `jwtKey` (a trailing `Value`, `Raw`, `Str`, `String`, `Text` or `Plain` is ignored; tokenizer marker tokens such as `eosToken` and `padToken` are not secrets). The value rules are shared with the other presets (`shared/naming/secret-words.mjs`): six characters or more with letters and digits, or three character classes; for a `password`, `passwd` or `passphrase` name also eight characters or more with a lowercase letter followed by an uppercase one (`CorrectHorseBatteryStaple`, not a single word such as `Elephantine` or an all-lowercase `hunterhunter`). Not secrets: placeholders (`changeme`, `<...>`, `${...}`, `$NAME`, `{{...}}`, `{name}`, `%s`, `%(name)s`, `:name`, `****1234`), environment variable names, header names such as `X-CSRF-TOKEN`, lowercase paths and message keys (`prod/db-creds-v2`, `errors.token.expired_v2`, `/etc/app/creds.json`), regular expressions (`^...$`), URLs, a value equal to the name and an identifier that contains a secret word (`extra_token_1`); a credential-shaped value is left to `CredentialLiteral`. Where: a property, `const val`, constructor default, named argument, `config.password = ...`, `settings["db.password"] = ...`, `by lazy { "..." }`, `fun token() = "..."`, a `get() = "..."` getter or a body that starts with `return "..."`, a `"key" to "value"` pair, a `"key", "value"` pair in `put`, `putIfAbsent`, `putString`, `putExtra`, `setProperty`, `addProperty`, `of`, `entry`, `Pair`, `set`, `getOrDefault` or `getProperty`, `getOrElse("key") { "..." }` and `getOrPut`, and a `"\${db.password:...}"` placeholder default outside files that import Spring (there `SpringValueSecretDefault` reports it). The literal that opens the value counts whatever follows (`.trimIndent()`, `.toCharArray()`, `as String`, `+ suffix`), except in a comparison, `.equals(...)`, `.toRegex()`, `.format(...)` and the like; so does a concatenation of literals and a fallback: `?: "..."`, either branch of an `if` or a `when` (braced too), `getOrDefault(k, "...")`, `System.getProperty(k, "...")`, `requireNonNullElse`, `orElse("...")`, `orElseGet { }`, `getOrElse(k) { }`, `getOrPut(k) { }`, `run { }`, `valueOf("...")`, `copyValueOf("...")` and `String("...")`. Main sources only.

- **Allowed form:** Read it from the environment or a secrets manager and inject it: this value is a hardcoded secret.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/HardcodedSecret","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-httpwithouttimeout"></a>

### `kotlin-source/HttpWithoutTimeout`

A `java.net.http` request built without `.timeout(...)` (a copy made with `newBuilder(request, filter)` keeps its timeout), an `HttpURLConnection` from an HTTP URL whose block never sets `readTimeout`, `URL(...).readText()`/`readBytes()`/`openStream()`, `RestTemplate()`, the no-argument Apache factories (`HttpClients.createDefault()`, `createSystem()`, `createMinimal()`, also `HttpAsyncClients`), an Apache `custom()`/`HttpClientBuilder.create()` chain built without `setDefaultRequestConfig`, `setDefaultSocketConfig`, `setConnectionManager` or `setIOReactorConfig` (both skipped in a file that sets a per-request config with `setConfig` or `config =`), JAX-RS `ClientBuilder.newClient()` in a block with no `property(...)` call that is not handed to another function, and `ClientBuilder.newBuilder()` built without `readTimeout`, `property` or `withConfig`; OkHttp and Ktor pass (their engines set timeouts). The Java preset runs the same check as `pmd/HttpWithoutTimeout`.

- **Allowed form:** Give the call a deadline: `HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))` (java.net.http), `connectTimeout` and `readTimeout` on an `HttpURLConnection`, a client with timeouts (OkHttp, which sets them by default, or Ktor with `install(HttpTimeout) { requestTimeoutMillis = 10_000 }`), `RestTemplateBuilder().connectTimeout(...).readTimeout(...)` for Spring, `setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(...).build())` on the Apache client builder, or `connectTimeout` and `readTimeout` on a JAX-RS `ClientBuilder`. This HTTP call has no timeout, so a server that never answers hangs it for good.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/HttpWithoutTimeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-iocallinloop"></a>

### `kotlin-source/IoCallInLoop`

A repository, DAO, JDBC or HTTP client call in a `for`, `while` or `do` body or an iterating lambda (`forEach`, `map`, `filter` and similar); paging and polling loops (a `while` or `do` whose condition, `if (...) break` or `?: break` reads what the call returned) and retries (the call in a `try` that leaves the loop) pass; file calls are not checked.

- **Allowed form:** Fetch or write all items at once (`findAllById`, `saveAll`, `deleteAll`, `WHERE id IN (...)`, one batched request): this calls a database, HTTP or repository API once per loop item. Paging, polling and retry loops are fine.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/IoCallInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-jvmsyntheticonhandwrittencode"></a>

### `kotlin-source/JvmSyntheticOnHandWrittenCode`

`@JvmSynthetic` on a function or accessor: JaCoCo skips synthetic methods. An exception fits a library function hidden from Java callers.

- **Allowed form:** Remove @JvmSynthetic: JaCoCo skips synthetic functions, so this is not measured. An exception fits only a library function that must stay hidden from Java callers.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/JvmSyntheticOnHandWrittenCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-legacycalendarapi"></a>

### `kotlin-source/LegacyCalendarApi`

In main sources, `Calendar.getInstance(...)` and `GregorianCalendar(...)` with no argument or only a `Locale`, `GregorianCalendar` with date fields, and `SimpleDateFormat(...)` unless an `apply { timeZone = ... }` follows it or its variable gets `timeZone` or `setTimeZone(...)` in the same block (the Java rule of the same name). Code inside a string template is not read.

- **Allowed form:** Use java.time with an explicit zone: `Instant`, `ZonedDateTime.now(clock)`, and a `DateTimeFormatter` with `withZone(zone)`. `Calendar.getInstance()` and `GregorianCalendar()` without a `TimeZone`, and a `SimpleDateFormat` whose `timeZone` is never set, read the default time zone, and `SimpleDateFormat` is not thread-safe.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/LegacyCalendarApi","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-linearlookupinloop"></a>

### `kotlin-source/LinearLookupInLoop`

In main sources, `find`, `firstOrNull`, `first`, `any`, `none`, `indexOfFirst` or `singleOrNull` with a lambda that only compares a property of the item with `==` to a value that is not a constant (`routes.find { it.path == p }`), inside a `for`, `while` or `do` body or an iterating lambda, on a `val` declared before that loop, a parameter or a `val` constructor property that its function or class never changes (`add`, `remove`, `clear`, `set`, a sort, `+=` or an assignment). The check reads the source text, not types, so a `var` and a loop without braces are left alone. Build a map once with `associateBy` (the Java rule of the same name).

- **Allowed form:** This keyed lookup (`find`, `first`, `any`, `indexOfFirst` and the like) scans the whole collection for one key on every pass of the enclosing loop or iterating lambda, and the collection does not change in between. Build a map once before the loop (`associateBy { it.key }`) and use `get` (`in` on a set of keys for `any`). An exception fits only for a collection that always stays a handful of items.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/LinearLookupInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-listusedasset"></a>

### `kotlin-source/ListUsedAsSet`

In main sources, a local list made with `mutableListOf`, `arrayListOf`, `ArrayList` or `LinkedList` that gets a one-argument `add` or `+=` and is tested with `contains`, `in` or `!in` inside a braced `for`, `while` or `do` body or an iterating lambda that starts after the declaration; a list also used by position (`[i]`, `get`, `set`, `indexOf`, `subList`, `removeAt`, a sort, `add(index, x)`) is left alone. A `mutableSetOf()` keeps insertion order and its `add` returns false for an item already there (the Java rule of the same name).

- **Allowed form:** This list gets `add` and is searched with `contains` or `in` inside a loop or an iterating lambda, so every search scans the whole list. Keep it in a set (`mutableSetOf()`, which keeps insertion order): `add` returns false when the item is already there. An exception fits only for a collection that always stays a handful of items.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ListUsedAsSet","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-logexceptionfirst"></a>

### `kotlin-source/LogExceptionFirst`

A JBoss Logging or Quarkus `Log` `*f` or `*v` call with an exception after the format: a name declared with an `*Exception`, `*Error` or `Throwable` type in the file (a `catch` parameter is one), or a constructor call such as `IllegalStateException(...)`.

- **Allowed form:** Pass the exception first (`log.errorf(e, "Cannot read %s", path)`), or `e.message` when only the text is wanted. After the format, JBoss Logging never logs its stack trace.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/LogExceptionFirst","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-logformatarguments"></a>

### `kotlin-source/LogFormatArguments`

In main sources (like the other source checks), a formatting log call whose format and arguments do not match, with the library imported in the file: JBoss Logging or Quarkus `Log` `tracef` to `fatalf`, `logf`, `tracev` to `fatalv` and `logv`; `java.util.logging` `log(Level.X, format, value)` (or `arrayOf(...)`) and `logp`; Log4j 2 `printf` and the level methods of a `val` set to `LogManager.getFormatterLogger(...)`. The receiver is named like a logger (`log`, `logger`, `*Log`, `*Logger`) or declared from a logger factory. The checks are those of the Java rule `pmd/LogFormatArguments`, plus the counts on a formatter logger's level methods that PMD's `InvalidLogMessageFormat` makes for Java. The format is a literal, a `const val` of the file, or these joined with `+`; a string template or another value in it counts as built at run time (on `info`, `warn`, `error` and `log` that is `LogStringConcatenation`). A `%d` or `%f` type is known for a literal and for a name with one declared type in the file (`name: String`); a `*values` spread is not counted.

- **Allowed form:** Pass one argument per placeholder, in the method's own syntax: `%s` for printf methods (JBoss Logging `infof`, Log4j 2 `printf` and formatter loggers), `{0}` for MessageFormat methods (JBoss Logging `infov`, `java.util.logging` `log`), with `''` for an apostrophe there. Keep the format a constant, not a string template. Otherwise values are dropped or the call throws.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/LogFormatArguments","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-logstringconcatenation"></a>

### `kotlin-source/LogStringConcatenation`

An `info`, `warn`, `error`, `log`, `config`, `warning` or `severe` call on a logger (the levels of the Java rule) whose message is a string template, `+` or `format` with a value that is not a compile-time constant (a literal, a `CONSTANT_CASE` name or a `const val` is one).

- **Allowed form:** Pass values as placeholders (`log.info("user {}", user)`), or give a lambda logger the message (`logger.info { "user $user" }`), not a message built with a string template, `+` or `format`.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/LogStringConcatenation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-mutablemodulestate"></a>

### `kotlin-source/MutableModuleState`

A top-level `var`, or a mutable collection, array, atomic or `MutableStateFlow` in a top-level `val`, or either in an `object` or companion object.

- **Allowed form:** Keep state in an instance: a class whose object the composition root creates and passes in, holding `val`s and immutable `listOf`/`mapOf`. A top-level `var` or a mutable collection in an `object` is shared by the whole program.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/MutableModuleState","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-mutationignoremarker"></a>

### `kotlin-source/MutationIgnoreMarker`

`@DoNotMutate`, `@CoverageIgnore`.

- **Allowed form:** Remove the annotation and kill the mutants with a test: PIT does not mutate code annotated @DoNotMutate or @CoverageIgnore.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/MutationIgnoreMarker","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-operandslip"></a>

### `kotlin-source/OperandSlip`

An operand copied by mistake (#904; the counterpart of the TypeScript `nitpicker/no-operand-slip`, Java's Error Prone `SelfComparison`/`SelfEquals`/`IdentityBinaryExpression`/`ComparisonOutOfRange` and Python's ruff `PLR0124`/`PLR1714`): the same side-effect-free operand on both sides of a comparison (`==`, `!=`, `===`, `!==`, `<`, `<=`, `>`, `>=`), of `-`, `/`, `%` or of the infix `and`, `or`, `xor` (for `x == x` and `x != x` the message names `x.isNaN()`, the NaN test on a `Double` or `Float`); the same operand twice in one `&&` or `||` chain, also through parentheses and with a mirrored comparison (`a < b && b > a`); two comparisons of one operand against number or string constants that cannot both hold (`x < 3 && x > 5`), always hold together (`x != 1 || x != 2`) or where one decides the other (`x > 5 && x > 3`); `x * 0` and `x and 0`; and `a += a + b`, `a -= a - b` (also `*=`, `/=`, `%=`). Operands with a call, a lambda, a string template or a write are never compared, and operands after one are not compared with those before it; a value that may be `NaN` keeps `x < 5 || x >= 5` unreported, and equality against constants of different literal types (`5`, `5L`, `5.0`) is left alone. Test sources skip an operator applied to one value twice or to 0, since a test may exercise `equals`, `compareTo` or an overloaded operator that way. The scan reads expressions from the token stream, so an expression it cannot read (a generic type in a cast, an `if` used as an operand) is skipped.

- **Allowed form:** An operand looks copied by mistake: the same value on both sides of an operator or twice in one `&&`/`||` chain, comparisons of one value that contradict or repeat each other, `x * 0`, or `a += a + b`. The finding names the slip.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/OperandSlip","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-parametermutation"></a>

### `kotlin-source/ParameterMutation`

A public function that changes a parameter declared as `MutableList`, `MutableSet`, `MutableMap`, `MutableCollection`, `ArrayList`, `HashMap`, `ArrayDeque`, an array or a primitive array: a mutating call (`add`, `remove*`, `clear`, `put*`, `getOrPut`, `set`, `sort*`, `shuffle`, `reverse`, `fill`) also on an element (`table[key]!!.add(v)`), an index write (`table[key] = v`, `counts[0]++`), `+=` / `-=`, or `Collections.sort` and `Arrays.fill` on it, or on a local alias of it (`val alias = items`); the body may be an expression over several lines. Skipped: `override` and `private` functions, local functions, channels, flows and concurrent collections (their types are not in the list), a change made after a local of the same name shadows the parameter (`val items = items.toMutableList()`), and a lambda parameter of the same name inside that lambda.

- **Allowed form:** Build and return a new collection or array (`items + item`, `items.sorted()`, `items.copyOf()`), or take a read-only `List`, `Set` or `Map` and copy it first (`val copy = items.toMutableList()`): this public function changes the argument its caller passed in.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ParameterMutation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-pendingfuturesnotfailedonclose"></a>

### `kotlin-source/PendingFuturesNotFailedOnClose`

In a class with a function named `close`, `dispose`, `destroy`, `shutdown`, `stop`, `teardown`, `tearDown`, `disconnect`, `end` or `cleanup`, a property of a map type (`mutableMapOf`, `ConcurrentHashMap`, `Map`) that mentions `CompletableDeferred`, `CompletableFuture`, `Deferred`, `Future`, `SettableFuture` or `CancellableContinuation`, when no close function (nor a same-class function it calls) has a statement that mentions the property and calls `completeExceptionally`, `cancel`, `complete` or `resumeWithException`. A bare `clear()` leaves every caller waiting forever A free function that takes the map (`failAll(pending)`) or a method reference counts as settling.

- **Allowed form:** This map keeps a pending request per id as a CompletableDeferred or future, but the close function of its class never completes them, so every caller still waiting hangs forever. In close, complete every entry exceptionally (`pending.values.forEach { it.completeExceptionally(IllegalStateException("closed")) }`) and then clear the map. An exception fits only when the entries are completed elsewhere before the class closes.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/PendingFuturesNotFailedOnClose","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-plaintextregex"></a>

### `kotlin-source/PlainTextRegex`

`Regex("text")` or `"text".toRegex()` with no regex metacharacters and no options, passed straight to `replace`, `replaceFirst`, `split` or `contains`.

- **Allowed form:** Pass the text itself: `replace("\r", "")`, `replaceFirst`, `split(",")` and `contains("x")` take plain text in Kotlin. This regex has no metacharacters, so compiling it only costs time and makes a `$` in the replacement a group reference.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/PlainTextRegex","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-processwaitwithouttimeout"></a>

### `kotlin-source/ProcessWaitWithoutTimeout`

(main sources) `.waitFor()` with no arguments, `.onExit().get()` or `join()`, and reading a process's output (`inputStream`, `errorStream`, `inputReader()` or `errorReader()`, also through a reader held in a local) with `readBytes`, `readText`, `readLines`, `readLine`, `lines`, `copyTo` and the like, unless the function has a `waitFor(timeout, unit)` before the read or the read runs in a lambda. The process is one started in the same expression (`ProcessBuilder(...).start()`, `Runtime.getRuntime().exec(...)`), a local `val` set from one, or a `Process` parameter.

- **Allowed form:** Wait with a deadline: `if (!process.waitFor(30, TimeUnit.SECONDS)) process.destroyForcibly()`, and read the output on another thread (or redirect it to a file) before that wait. This waits for the child process without a deadline, so a command that never exits hangs this request, job or command for good. An exception fits only a program whose purpose is to run the child to completion, such as a build wrapper.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ProcessWaitWithoutTimeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-reactorblockwithouttimeout"></a>

### `kotlin-source/ReactorBlockWithoutTimeout`

(main sources) `block()`, `blockOptional()`, `blockFirst()` or `blockLast()` with no arguments, in a file that imports `reactor.core.` or `org.springframework.web.reactive.`: a publisher that never completes hangs the calling thread for good.

- **Allowed form:** Use a deadline: `mono.block(Duration.ofSeconds(30))`, and likewise `blockOptional(Duration)`, `blockFirst(Duration)` and `blockLast(Duration)`, or keep the code reactive and let the caller subscribe. This call waits for the publisher with no limit, so a publisher that never completes (a stuck connection, a lost signal) hangs this thread for good. An exception fits only code whose purpose is to wait for the publisher, such as the main function of a command.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ReactorBlockWithoutTimeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-redundantstreamstep"></a>

### `kotlin-source/RedundantStreamStep`

In main sources, `map { }` or `map(...)` followed by `flatten()` (`flatMap` takes one pass), and `toList()` or `toMutableList()` followed by `size`, `count()`, `isEmpty()` or `isNotEmpty()`: the copy is thrown away (the Java rule of the same name).

- **Allowed form:** This step builds a list only to read it once: `map { }.flatten()` is `flatMap { }`, and `toList()` or `toMutableList()` followed by `size`, `count()`, `isEmpty()`, `isNotEmpty()` or `contains` copies every item to ask the original. Use `flatMap`, or ask the collection or sequence itself (`count()` on a sequence).
- **Exception:** If this is intended, add `{"rule":"kotlin-source/RedundantStreamStep","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-regexpartdefect"></a>

### `kotlin-source/RegexPartDefect`

A literal pattern in `Regex(...)`, `Pattern.compile(...)` or the receiver of `toRegex()` or `toPattern()` (no options, or `IGNORE_CASE`, `MULTILINE`, `DOT_MATCHES_ALL`) with a part that never changes the match or does not do what it looks like, or with a shorter form of the same meaning, by the checks of the TypeScript preset's `regexp/` rules (`a|b|a`, `[\w_]`, `a\bb`, `x{1}`). A pattern with syntax outside what Java and JavaScript share (possessive quantifiers, atomic groups, `\p{...}`, `&&`, a `$` before the end, a character above ASCII) is skipped.

- **Allowed form:** A part of this regex never changes what it matches, does not do what it looks like, or has a shorter form with the same meaning: remove it, or rewrite it to match what was meant.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/RegexPartDefect","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-repeatedstringliteral"></a>

### `kotlin-source/RepeatedStringLiteral`

A string of 5 or more characters (with a letter or digit, no `$` template) used three times in a main source file; every use from the third on is reported. A `const val` initializer counts as a use. Not counted: annotation arguments, `when (subject)` branch labels, named arguments (`label = "..."`), map and `to` pair keys, `x["key"]` subscripts, the value of a `"type"`/`"kind"`/`"tag"`/`"variant"` pair, a comparison with a property of that name (`node.type == "..."`), the first argument of a translation or message-key call (`t`, `translate`, `formatMessage`, `getMessage`, `getString`, `gettext` and the like) and idiomatic text (encodings, HTTP methods, MIME types, time formats, argparse actions). Test sources are not scanned.

- **Allowed form:** A string is repeated three times or more in the file. Name it once as a constant (`private const val NAME = "..."`) and use the constant.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/RepeatedStringLiteral","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-secretinlog"></a>

### `kotlin-source/SecretInLog`

A secret-named value passed to a log call (any level, Android `Log.d`, Timber), `print`/`println`, `System.out`/`System.err` `print`/`println`/`printf`/`format`, SLF4J fluent `addKeyValue`/`addArgument`, `MDC.put` or an exception message (`throw X("...")`, `error("...")`): a variable, a member (`session.token`, not a member of a `tokenizer`), a getter (`getToken()`), directly, in a `+`, in a template (`$token`, `${config.apiKey}`, `${token ?: "none"}`), in `String.format`/`.format(...)`, in a lambda message (`logger.info { "token $token" }`), a read by key (`System.getenv("API_TOKEN")`, `getProperty(k)`, `map["k"]`) or as the key of a `"password" to pw` / `kv("password", pw)` pair; `token != null`, `token.length`, `hasToken`, a pair whose value is a status (`session.hasToken`) and constant names (other than a key that is read) are fine. Main sources only.

- **Allowed form:** Log that the secret is set, or a masked tail, instead of the secret itself.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SecretInLog","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-shellcommand"></a>

### `kotlin-source/ShellCommand`

A shell and its command flag as consecutive literals (`"sh", "-c"`, `"bash", "-c"`, `"cmd", "/c"`, `"powershell", "-Command"`).

- **Allowed form:** Run the program directly with an argument list (`ProcessBuilder("git", "log", ref)`), not through a shell with `-c`.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/ShellCommand","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-simplerbooleanlogic"></a>

### `kotlin-source/SimplerBooleanLogic`

Boolean logic with a strictly simpler exact form, printed in the message (#905; the counterpart of the Java PMD rules and the TypeScript and Python `simpler-boolean-logic`): an `if` returning or giving `true` and `false` (`if (a < b) return true else return false`, also with `return false` as the next statement, and `if (c) true else false`) is `return a < b` or `c` (`!c`, `a != b` for swapped literals); `!(a == b)`, `!(a === b)`, `!(x is T)` and `!(n in r)` are `a != b`, `a !== b`, `x !is T` and `n !in r`; `if (!c) A else B` (block or expression) is `if (c) B else A`, not before an `else if`; a `&&` or `||` whose every operand is a `!` is one negation (`!a && !b` is `!(a || b)`), in parentheses, a `return` value or the value after `=`. A Kotlin condition is a non-null `Boolean`, so each form keeps the value. Not reported: `!(a < b)` (`NaN`), a chain that goes on to the next line, an `if` whose branch holds more than the literal, and an `if` alone inside another `if`, which detekt's `CollapsibleIfStatements` reports.

- **Allowed form:** Write this boolean logic in its simpler exact form; the finding prints it. A Kotlin condition is a non-null `Boolean`, so each form keeps the value.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SimplerBooleanLogic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-sortforextreme"></a>

### `kotlin-source/SortForExtreme`

In main sources, `sorted`, `sortedDescending`, `sortedBy`, `sortedByDescending` or `sortedWith` followed by `first()`, `last()`, `firstOrNull()`, `lastOrNull()` or `[0]`: `min`, `max`, `minBy`, `maxBy`, `minOf`, `maxOf` and `minWith` take one pass (the Java rule of the same name).

- **Allowed form:** The collection is sorted only to take its first or last element, which costs a full sort. Take it in one pass: `min`, `max`, `minBy`, `maxBy`, `minOf`, `maxOf`, `minWith` or their `OrNull` forms. An exception fits only for a collection that always stays a handful of items.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SortForExtreme","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-sqlstringbuilding"></a>

### `kotlin-source/SqlStringBuilding`

SQL text built from a runtime value with a string template, `+`, `String.format` or `.format`: text that starts like a statement or clause in capitals (`SELECT ... FROM`, `UPDATE ... SET`, `AND name =`), or any case when it reaches a JDBC, Spring `JdbcTemplate`, JPA or R2DBC query call directly or through a `val`.

- **Allowed form:** Pass values as bind parameters: `jdbcTemplate.query("SELECT * FROM users WHERE id = ?", mapper, id)`, `prepareStatement("... WHERE id = ?")` with `setLong(1, id)`, `:id` with `NamedParameterJdbcTemplate` or JPA `setParameter("id", id)`, or a query DSL (Exposed, jOOQ). Build placeholder lists from placeholders alone (`ids.joinToString(", ") { "?" }`), optional filters from literal fragments joined with `" AND "`, and take a table or column name from a constant or an enum. This SQL text is built from a runtime value with a string template, `+` or `format`, so the value can change the statement (SQL injection).
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SqlStringBuilding","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-standardstreamoutsideentrypoint"></a>

### `kotlin-source/StandardStreamOutsideEntryPoint`

`System.out` or `System.err` (also `java.lang.System.out` and an import of either) in a main source that is not the composition root; test sources are not read.

- **Allowed form:** Take an `Appendable`, `PrintStream` or `Writer` parameter and write to it (`out.append(text)`, `out.println(text)`); the file with `fun main` passes `System.out` or `System.err`. An exception fits only for a program entry point the gate does not recognize as a composition root.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/StandardStreamOutsideEntryPoint","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-suspendfuninfinallysection"></a>

### `kotlin-source/SuspendFunInFinallySection`

A suspending call in a `finally` block, or in a `catch (CancellationException)` block, outside `withContext(NonCancellable)`.

- **Allowed form:** A suspending call in a `finally` block, or in a `catch (CancellationException)` block, throws as soon as the coroutine is cancelled, so the rest of the cleanup is skipped and the resource stays open. Make the release non-suspending (a blocking `close()`), or run the release as `withContext(NonCancellable) { withTimeout(5.seconds) { ... } }` so it finishes after cancellation but cannot wait forever, and shield only the release itself, in the scope that opened the resource.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/SuspendFunInFinallySection","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-testclasswithouttestcases"></a>

### `kotlin-source/TestClassWithoutTestCases`

(test sources) a class named `*Test`, `*Tests`, `*TestCase` or `*IT` with no test annotation in it; abstract and open classes, Kotest specs and classes with a superclass, suites and `@Nested` are skipped.

- **Allowed form:** Add @Test functions to the class, or rename it if it is a helper (for example `TestInputGenerator` becomes `InputGenerator`): a test class without tests never runs.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TestClassWithoutTestCases","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-testhelperinsource"></a>

### `kotlin-source/TestHelperInSource`

A main source that imports JUnit, kotlin.test, Kotest, MockK, Mockito, AssertJ, Truth, Strikt or Hamcrest.

- **Allowed form:** Move the test helper to the test sources (`src/test/kotlin`): production code must not import a test framework.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TestHelperInSource","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-timeoutwithoutsuspension"></a>

### `kotlin-source/TimeoutWithoutSuspension`

A `withTimeout` block with no suspension point, which can never time out.

- **Allowed form:** `withTimeout` can cancel its block only at a suspension point, and this block has none: `<call>` runs to the end before the timeout can fire. Run the work in `withContext(ioDispatcher) { ... }` or `runInterruptible(ioDispatcher) { ... }` inside the block, with an injected `CoroutineDispatcher`, or call `ensureActive()` in the loop that does it.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TimeoutWithoutSuspension","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-timernotstoppedonclose"></a>

### `kotlin-source/TimerNotStoppedOnClose`

In a class with a close-named function (`close`, `dispose`, `destroy`, `shutdown`, `stop`, `teardown`, `tearDown`, `disconnect`, `end` or `cleanup`) and no Spring stereotype annotation (`@Component`, `@Service`, `@Repository`, `@Configuration`, `@Controller`, `@RestController`, which `SpringUnreleasedResource` covers), a property created by `Executors.newScheduledThreadPool`, `newSingleThreadScheduledExecutor` and the like, `Timer(...)`, `timer(...)` or `fixedRateTimer(...)` that no close function (nor a same-class function it calls) mentions in a statement that calls `shutdown`, `shutdownNow`, `close`, `cancel`, `purge` or `awaitTermination`. A scheduler left running keeps firing and its thread keeps the JVM alive after close A Guava helper such as `MoreExecutors.shutdownAndAwaitTermination` counts, and a `lateinit var` timer that a function assigns is read.

- **Allowed form:** This scheduler or timer is created by a class that has a close function, but close never shuts it down, so its scheduled tasks keep running and its thread keeps the JVM alive after close. Call `shutdown()` (then `awaitTermination`) on the executor, or `cancel()` on the Timer, in close. An exception fits only when the scheduler is shared and owned elsewhere.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TimerNotStoppedOnClose","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-timeunitmismatch"></a>

### `kotlin-source/TimeUnitMismatch`

In main sources, time values in two different units that meet without a conversion: a `+`, `-` or comparison of seconds with milliseconds (or nanoseconds, microseconds, minutes), a value assigned to a variable, property or named argument whose name says another unit, and an argument of one unit passed where the call takes another (`Thread.sleep`, `delay`, `Duration.ofMillis`, `plusSeconds`, a `TimeUnit.X` call or the `TimeUnit` argument next to it, a same-file function's parameter, kotlin.time `.seconds` and the like when imported); and an epoch time cut to an `Int` (`.toInt()`, `Math.toIntExact`). Units come from the API (`System.currentTimeMillis()`, `nanoTime()`, `toEpochMilli()`, `epochSecond`, `Date().time`, `inWholeSeconds`) and from name suffixes (`Millis`, `Ms`, `Seconds`, `Secs`, `Nanos`, `Micros`, `Minutes`); `* 1000`, `/ 1000` and `TimeUnit` conversions change the unit. The message names both units, the factor and the conversion; a wrong name is fixed by renaming it to its real unit. The same rule runs as `nitpicker/time-unit-mismatch` (TypeScript, JavaScript), `time-unit-mismatch` (Python) and `pmd/MixedTimeUnits` plus `pmd/EpochNarrowedToInt` (Java).

- **Allowed form:** Time values in different units meet here without a conversion (seconds with milliseconds, for example), or an epoch time is cut to a 32-bit `Int`. Convert once where the value enters, name it with its unit, and keep epoch times in a `Long` or an `Instant`.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TimeUnitMismatch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-tlsverificationoff"></a>

### `kotlin-source/TlsVerificationOff`

An empty `checkServerTrusted`, a host-name verifier or trust strategy that returns `true`, `NoopHostnameVerifier`, `TrustAllStrategy`, `TrustSelfSignedStrategy`, Netty's `InsecureTrustManagerFactory` (its use, not its import).

- **Allowed form:** Keep certificate and host-name verification on and trust the certificate authority instead: load it into a `KeyStore` and build the `SSLContext` from `TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keyStore) }`, use OkHttp `HandshakeCertificates.Builder().addTrustedCertificate(certificate)`, or set `-Djavax.net.ssl.trustStore` for a private CA. This trusts any certificate or host name, so anyone on the network can pose as the server, and turning it off by environment ships the switch to production.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TlsVerificationOff","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-tristateboolean"></a>

### `kotlin-source/TriStateBoolean`

A `Boolean?` parameter, return type, constructor property or class or top-level property (a local variable, a `List<Boolean?>`, a function type and an `override` member, also with `override` on the line above, are left alone). Data mapped from outside is exempt: a parameter or property annotated `@Column`, `@Field`, `@JsonProperty`, `@SerialName`, `@RequestParam`, `@RequestBody`, `@RequestHeader` or `@PathVariable`, and the properties of a class annotated `@Entity`, `@Embeddable`, `@MappedSuperclass`, `@Document` or `@Serializable`.

- **Allowed form:** Use an `enum class` that names each state (`Mode.ON`, `Mode.OFF`, `Mode.AUTO`): a `Boolean?` is true, false or null, so this has three states that the type does not name. A plain `Boolean` is fine only when it is not a flag that switches the function between two behaviors.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/TriStateBoolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unboundedcollectionproperty"></a>

### `kotlin-source/UnboundedCollectionProperty`

In a class annotated `@Component`, `@Service`, `@Repository`, `@Controller`, `@RestController`, `@Singleton` or `@Configuration`, a property created by `mutableMapOf`, `mutableListOf`, `mutableSetOf`, `HashMap`, `ConcurrentHashMap`, `ArrayDeque` and the like that a function (not `init*`, `register*`, `setup*`, `configure*`, `load*`, `populate*`, `build*` or `@PostConstruct`) adds to with `put`, `add`, `getOrPut`, `computeIfAbsent`, `[key] =` or `+=` using a key that is not a literal, when nothing in the class removes from it (`remove`, `clear`, `poll`, `-=`, `evict`), reads its `size` or `isEmpty`, reassigns it or passes it to a call. Memory then grows for the life of the process. A plain class, a `WeakHashMap` and a registry with literal keys are left alone Only a call that takes the property as an argument and is not a log, `println`, `unmodifiable*`, `containsKey` or similar read counts as handing it over; expression-bodied functions are read.

- **Allowed form:** This property of a singleton bean only ever gains entries, so memory grows for the life of the process. Remove the entry when its request, session or run ends (in `finally` or the destroy function), keep a bounded cache (Caffeine or Guava with a maximum size or expiry), or use a `WeakHashMap` keyed by the object. An exception fits only for a registry filled at startup.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnboundedCollectionProperty","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unboundedfanout"></a>

### `kotlin-source/UnboundedFanOut`

A task started for every element of a collection (`async`, `launch`, `supplyAsync`, `thread`) whose work makes a remote or message call; see the limits below.

- **Allowed form:** A task started for every element of a collection makes a remote or message call, so a large collection exhausts the connections or rate limit of the remote service. Hold one `Semaphore(8)` created outside the loop and run each call in `permits.withPermit { ... }`, await fixed-size chunks (`items.chunked(20)`), or make one batch call when the API has one. An exception fits only when the collection is always small.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnboundedFanOut","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unboundedqueryarray"></a>

### `kotlin-source/UnboundedQueryArray`

In main sources, a collection parameter or a `val` made from one (`map`, `filter`, `toList` and similar; not `listOf`, `take` or `chunked`) passed to `setParameter`, `setParameterList`, `addValue`, `param`, `MapSqlParameterSource(...)`, `findAllById`, `deleteAllByIdInBatch` or `deleteAllInBatch`, in a function that never checks its `size`, `isEmpty`, `isNotEmpty`, `count` or `ifEmpty` and never splits it with `chunked` or `windowed`: an empty list renders `in ()` and PostgreSQL takes at most 65,535 bound parameters. The Java preset runs the same check as `pmd/UnboundedQueryArray`.

- **Allowed form:** Return early when the collection is empty, and bound its size or split it into chunks first (`ids.chunked(1000).forEach { chunk -> ... }` or the project's chunking helper), or send it as one array parameter (`where id = any(:ids)` with a SQL array). This collection is bound as one query parameter per element (an in list): an empty collection renders `in ()`, which some databases reject, and PostgreSQL takes at most 65,535 bound parameters in one statement, so the query works in tests and fails on a large account. An exception fits only a collection that its callers bound, such as a request field with a maximum size.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnboundedQueryArray","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unboundedreactivefanout"></a>

### `kotlin-source/UnboundedReactiveFanOut`

A Reactor `flatMap` over a collection without a concurrency argument, `Mono.zip`/`Mono.when`/`Flux.merge` over a list built per element, or `flatMapMerge(Int.MAX_VALUE)`, whose element work makes a remote or message call; see the limits below.

- **Allowed form:** A Reactor or Flow operator subscribes to a remote or message call for every element of a collection (`Mono.zip`, `Mono.when`, `flatMapMerge(Int.MAX_VALUE)`), or up to 256 at once (`flatMap` and `Flux.merge` without a concurrency argument), so a large collection exhausts the connections or rate limit of the remote service. Pass a concurrency limit (`flatMap({ fetch(it) }, 8)`), use `concatMap` for one call at a time, or `buffer(20)` and make one batch call per chunk. An exception fits only when the collection is always small.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnboundedReactiveFanOut","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unboundedwait"></a>

### `kotlin-source/UnboundedWait`

(main sources) `get()` or `join()` with no arguments on a `Future`, `CompletableFuture`, `FutureTask`, `ScheduledFuture` or `ForkJoinTask`, `join()` on a `Thread` and `await()` on a `CountDownLatch`, where the receiver is a parameter, property or local declared with that type or made in the same declaration (`CompletableFuture.supplyAsync`, `executor.submit`, `Thread(...)`, `thread { }`, `CountDownLatch(n)`), and the same calls chained on `CompletableFuture.supplyAsync { }`, `runAsync { }` or `submit { }`. A `Job` or `Deferred` is not reported (`join()` and `await()` suspend), nor a chain with `orTimeout(...)` or `completeOnTimeout(...)`. A name declared with two different kinds in one file is skipped.

- **Allowed form:** Wait with a deadline: `future.get(30, TimeUnit.SECONDS)`, `future.orTimeout(30, TimeUnit.SECONDS).join()`, `latch.await(30, TimeUnit.SECONDS)` or `thread.join(30_000)`, and handle the timeout by cancelling the work or failing. This call waits with no limit, so a task that never finishes hangs this thread for good. An exception fits only code whose purpose is to wait for the work to finish, such as the main function of a command or a shutdown that joins a thread it just stopped.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnboundedWait","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unclosedinlineresource"></a>

### `kotlin-source/UnclosedInlineResource`

A closeable opened and used in the same expression, with no variable: the receiver of a call (`resource.inputStream.readBytes()`, `JarFile(root).manifest`), an argument (`props.load(resource.inputStream)`) or a `for` source (`Files.newDirectoryStream(dir)`). Opened means `FileInputStream`, `FileOutputStream`, `FileReader`, `FileWriter`, `RandomAccessFile`, `JarFile`, `ZipFile`, `URLClassLoader`, `Socket(...)` or `ServerSocket(...)`; `Files.new*Stream`/`newBufferedReader`/`newBufferedWriter`/`newByteChannel`/`newDirectoryStream`, `FileChannel.open`, `DriverManager.getConnection`, `openStream()`, `getResourceAsStream(...)`, `openInputStream(...)`; `inputStream()`, `outputStream()`, `reader()`, `writer()`, `bufferedReader()`, `bufferedWriter()` or `printWriter()` on a `File` or `Path` (declared in the file, or `File(...)`, `Path.of(...)`, `toFile()`); `inputStream`/`outputStream` on a Spring `Resource` or `MultipartFile`; `connection` on a value named `*dataSource`. A receiver counts as a `File`, `Path` or `Resource` only when the file declares that name with that type and no other. A wrapper (`BufferedReader(...)`, `.bufferedReader()`) carries the check to the outer expression, reported once; passing it to a supertype or `this(...)` call, to a call whose result is closed with `.use`, to `close*`, `register`, `add*`, `put*`, `offer*`, `push`, `set*`, `listOf`, `setOf`, `of`, Jackson's `readValue`/`readTree` or `FileCopyUtils` is not flagged.

- **Allowed form:** Close what this opens: `resource.inputStream.use { it.readBytes() }`, `FileInputStream(file).bufferedReader().use { it.readLine() }`, or a variable passed to `.use { }`. The closeable (a stream, reader, writer, channel, JAR or ZIP file, class loader or JDBC connection) is opened and used in the same expression, as the receiver of a call, an argument or a loop source, so nothing closes it: each call leaks a file handle or a connection, and on Windows the file stays locked. `readLines()`, `useLines { }` and `forEachLine { }` close the reader, and returning the closeable or passing it to a closeable wrapper that is closed also matches.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnclosedInlineResource","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unhandledrootcoroutine"></a>

### `kotlin-source/UnhandledRootCoroutine`

(main sources) `launch` or `async` called on a root scope with nothing that handles a failure: `CoroutineScope(...)` or `MainScope()` written in place, or a `val` of the file made from one (a scope that is a parameter, a lambda parameter, a property of another object or a name declared twice is not followed; a scope whose context carries a parent, such as `coroutineContext`, `currentCoroutineContext()` or a job variable, is skipped), whose context and call arguments name no `CoroutineExceptionHandler`, and whose block is not a `try` with a `catch` of `Throwable` or `Exception` around everything (a `finally` may follow) or a `runCatching` that wraps the whole block. A launch inside a lambda of a name in the convention `kotlin.detachedWorkRunners` (a project runner that handles the failure), or on a scope with such a name, is skipped. An `async` counts only when its `Deferred` is dropped or its `val` is never used again. A `launch` inside `coroutineScope`, `supervisorScope` or another coroutine's body has no receiver and is not matched; Android's `viewModelScope` and `lifecycleScope` are not followed.

- **Allowed form:** Handle the failure: build the scope with a handler, `CoroutineScope(SupervisorJob() + Dispatchers.Default + CoroutineExceptionHandler { _, error -> logger.error("...", error) })`, or catch it in the block, `try { ... } catch (error: Exception) { logger.error("...", error) }` (an `async` also needs its `Deferred` awaited). This launch or async runs in a scope of its own, with no CoroutineExceptionHandler in its context and a block that does not catch everything, so a failure in the block reaches the thread's uncaught-exception handler, which crashes an Android process and is only logged elsewhere, and the failure of an `async` nobody awaits is never reported. When a project runner handles the failure, name it in conventions kotlin.detachedWorkRunners: a launch inside its lambda, or on a scope with that name, is then skipped.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnhandledRootCoroutine","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unorderedquery"></a>

### `kotlin-source/UnorderedQuery`

In main sources, a page of rows taken with no ORDER BY: SQL or JPQL text that starts a `select` or `with` and has `limit`, `offset` or `fetch` (also in a raw string, a `$` template counts as a value only after a comparison) or an `array_agg`/`json_agg`/`jsonb_agg` with no `order by` inside, `setMaxResults`/`setFirstResult` after a `createQuery` in the same function whose text (a literal or a `val` that holds one) has no `order by` or whose criteria query never calls `orderBy`, and a two-argument `PageRequest.of` or `Pageable.ofSize` passed to `findAll`, directly or through a `val`; `setMaxResults(1)` on a count or constant and `setFirstResult(0)` pass. The Java preset runs the same check as `pmd/UnorderedQuery`.

- **Allowed form:** Order on a unique key, or add a tie-breaker after a non-unique key: `order by a.createdAt desc, a.id` in the query text, `criteria.orderBy(...)`, `PageRequest.of(page, size, Sort.by("createdAt", "id"))`, or `json_agg(t.name order by t.name)`. This query takes a page of rows (`setMaxResults`, `setFirstResult`, an unsorted `PageRequest` passed to `findAll`, or SQL `LIMIT`, `OFFSET` or `FETCH`) or builds an `array_agg`/`json_agg` list with no ORDER BY, so which rows come back, and in which order, is up to the database and can change between runs. `setMaxResults(1)` or `LIMIT 1` is fine when the query selects only a constant or a count. An exception fits only a query whose rows come back in one order anyway, or a nested list that is a set whose callers never depend on its order.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnorderedQuery","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unquotedregexvalue"></a>

### `kotlin-source/UnquotedRegexValue`

A runtime value built into a regex without `Regex.escape`, `Pattern.quote` or a helper whose name says it escapes or quotes a regex or pattern (`escapeRegex(name)`): a `$name` or `${expr}` template entry, or a `+` operand, in the argument of `Regex(...)` or `Pattern.compile(...)`, or in the receiver of `toRegex()` or `toPattern()`. A value counts as runtime unless it is a `SCREAMING_CASE` or `const val` constant, a `val` declared at the top level, in a named `object` or in a `companion object`, a local `val` holding a plain literal (`val sep = "."`), a name declared as a number, `Boolean` or `Char`, or a `Regex`'s `.pattern`. A value passed on its own (`Regex(pattern)`, `pattern.toRegex()`) is a whole pattern and passes (the issue also asked for that form; it is left out, like in the other presets, because a lone value is meant as a pattern far more often than not).

- **Allowed form:** Escape the value before it goes into the pattern (`Regex("^/${Regex.escape(name)}/\\d+$")`, `Pattern.quote(name)` for `Pattern.compile`), match plain text with `contains`, `startsWith` or `split(value)`, or pass a value that is meant as a whole pattern to `Regex(pattern)` on its own. A runtime value built into this regex unescaped changes the pattern when it holds a `.`, `|`, `$` or another metacharacter.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnquotedRegexValue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unsafecastoperator"></a>

### `kotlin-source/UnsafeCastOperator`

The cast operator `as` (not `as?`) in main and test sources, outside an import alias; `null as T?` and `as Any?` pass, and a line another cast rule already reports keeps only that finding.

- **Allowed form:** Narrow with an `is` check or `when` (a smart cast), or use `as?` and handle the null; `as` throws ClassCastException when the type is wrong. A test can use `assertIs<T>(value)`.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnsafeCastOperator","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-unsafedeserialization"></a>

### `kotlin-source/UnsafeDeserialization`

`XMLDecoder`, Jackson `enableDefaultTyping`, `activateDefaultTyping` with `LaissezFaireSubTypeValidator`, `JsonTypeInfo.Id.CLASS`/`MINIMAL_CLASS`, `SerializationUtils.deserialize`, Kryo without class registration (`ObjectInputStream` is detekt's `ForbiddenMethodCall`).

- **Allowed form:** Read the data as JSON into a concrete type: `Json.decodeFromString<Order>(text)` with kotlinx.serialization or `mapper.readValue<Order>(text)` with Jackson, with polymorphism by a logical name (a `sealed` class with kotlinx.serialization, or `@JsonTypeInfo(use = JsonTypeInfo.Id.NAME)` with `@JsonSubTypes`). This reads class names or objects from the data, so a crafted payload builds any class on the classpath and runs code.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UnsafeDeserialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-uricreatedynamic"></a>

### `kotlin-source/UriCreateDynamic`

In main sources, with `java.net.URI` imported or written in full: `URI.create(text)`, the one-argument `URI(text)` and the references `URI::create` and `::URI`, where `text` is not a constant: a literal without `$` templates, a `const val`, a `val` set to such a literal (not a `var`, and not when a parameter has the same name), a `SCREAMING_CASE` name or `Type.NAME` the file does not declare, or these joined with `+`. A call in `runCatching { }`, or in a `try` of the same function whose `catch` takes `IllegalArgumentException`, `RuntimeException`, `Exception` or `Throwable` (`URISyntaxException`, `Exception` or `Throwable` for `URI(text)`), is not flagged. The four-argument `URI(scheme, host, path, fragment)` encodes and is not flagged. `toUri()` is not reported: androidx's returns an `android.net.Uri`, which does not throw, and a project extension that wraps `URI.create` is reported in its own body.

- **Allowed form:** Build the URI with an encoding builder (`UriComponentsBuilder.fromUriString(base).path(path).queryParam(name, value).encode().build().toUri()` with Spring, or `URI(scheme, host, path, fragment)`), or parse the text where the failure is handled: `runCatching { URI.create(text) }`, or a `try` that catches `IllegalArgumentException` (`URISyntaxException` for `URI(text)`). `URI.create(text)` and `URI(text)` throw on a space, a non-ASCII character or any other character that is not encoded, so one odd stored, user or header value turns this call into an error response. A constant is fine, and so is a project helper that does one of these. A value read from configuration at startup also matches, because a bad value fails only at runtime.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/UriCreateDynamic","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlin-source-weakhash"></a>

### `kotlin-source/WeakHash`

`MessageDigest`, `Signature`, `DigestUtils` with MD2, MD4, MD5 or SHA-1 (a literal, a constant in the file or a commons-codec constant), commons-codec, Spring, Guava and Okio MD5/SHA-1 helpers, and HMAC-MD5 (`Mac`, `KeyGenerator`, `HmacUtils`, its own message); HMAC-SHA1 passes.

- **Allowed form:** Hash with `MessageDigest.getInstance("SHA-256")` (or SHA-384, SHA-512, SHA3-256), sign with `Mac.getInstance("HmacSHA256")`, and hash passwords with Argon2 or bcrypt (`Argon2PasswordEncoder`, `BCryptPasswordEncoder`): MD5 and SHA-1 are broken hashes, collisions are cheap and brute force is fast. A protocol you do not control that requires one (a legacy signature, an ETag, a WebSocket accept key) is the exception.
- **Exception:** If this is intended, add `{"rule":"kotlin-source/WeakHash","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="kotlinc-cast"></a>

### `kotlinc/cast`

A Kotlin compiler warning: `USELESS_CAST`.

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Remove the cast.
- **Exception:** If this is intended, add `{"rule":"kotlinc/cast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/compiler-warnings.md)

<a id="kotlinc-deprecation"></a>

### `kotlinc/deprecation`

A Kotlin compiler warning: `DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION`.

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Call the replacement the deprecation names (its `ReplaceWith`, or the Javadoc of a Java API).
- **Exception:** If this is intended, add `{"rule":"kotlinc/deprecation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/compiler-warnings.md)

<a id="kotlinc-lint-not-run"></a>

### `kotlinc/lint-not-run`

The kotlinc lint could not compile the sources, for example because a compiler plugin could not be loaded.

- **Why it is on:** Without the lint compile, the compiler warnings above are not checked, so the run says so.
- **Allowed form:** No kotlinc lint report from the lint compile of the main sources (kotlinc exited with an error), so unchecked casts, deprecated calls and redundant casts were not checked there. Fix what that compile reports (the main sources, the compile class path and the compiler plugins).
- **Exception:** A descriptive finding: it never fails the gate, so no exception applies.
- **See also:** [Kotlin preset guide](../kotlin-preset/compiler-warnings.md)

<a id="kotlinc-unchecked"></a>

### `kotlinc/unchecked`

A Kotlin compiler warning: `UNCHECKED_CAST`.

- **Why it is on:** The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.
- **Allowed form:** Use a typed API, a checked conversion (`as? List<*>` and a check of each element) or a reified generic function instead of the unchecked cast.
- **Exception:** If this is intended, add `{"rule":"kotlinc/unchecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/compiler-warnings.md)

<a id="ktfmt-format"></a>

### `ktfmt/format`

A Kotlin file is not formatted with ktfmt.

- **Why it is on:** When the project formats with ktfmt, the format check reports every file it would change.
- **Allowed form:** File is not formatted with ktfmt. Run nitpicker --fix, or format it with the "Format with ktfmt" command printed at the start of the run. Not your formatter: set kotlin.formatter.
- **Exception:** No exception applies: format the file, or choose another formatter with `kotlin.formatter`.
- **See also:** [Kotlin preset guide](../kotlin-preset.md)

<a id="ktlint-ktlint-rule"></a>

### `ktlint/ktlint.<rule>`

A rule of the ktlint standard ruleset that a Kotlin file breaks.

- **Printed as:** `ktlint/ktlint.<rule>`
- **For example:** `ktlint/ktlint.standard:no-wildcard-imports`
- **Why it is on:** When the project formats with ktlint, the format check reports each rule of the ktlint standard ruleset that a file breaks.
- **Allowed form:** See the tool's documentation: [ktlint standard rules](https://pinterest.github.io/ktlint/latest/rules/standard/).
- **Exception:** No exception applies. Run nitpicker --fix to apply the fixes ktlint has, or lift this rule with ktlint_standard\_\<rule> = disabled in .editorconfig, which nitpicker reads only when ktlint lists "project" (see the start of the run). Not your formatter: set kotlin.formatter.
- **See also:** [Kotlin preset guide](../kotlin-preset.md), [ktlint standard rules](https://pinterest.github.io/ktlint/latest/rules/standard/)

<a id="pmd-assertionincontrolflow"></a>

### `pmd/AssertionInControlFlow`

An assertion that can be skipped: inside an `if` or a `when` whose branches do not all assert, a loop that can run zero times (also in a helper the test calls), a safe call, `&&`, `||`, `?:`, a swallowing `try` or `runCatching`, or after an early return.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** Assert unconditionally. An assertion inside an if, a when, a loop, a safe call, a try/catch that swallows the failure or a runCatching can be skipped, so the test passes without checking anything: a loop over an empty list, or a branch the data never takes, checks nothing. A branch or loop that calls a same-file helper which asserts is checked like one that asserts, and a loop in such a helper too; a loop that cannot run zero times (repeat(3), for (i in 1..3), do/while) is fine. Assert in every branch (an if/else or when whose branches all assert or fail is fine), or narrow with assertNotNull, assertIs or `?: fail(...)` instead of an if or a safe call. Put a table of cases in a parameterized test (@ParameterizedTest with @MethodSource or @CsvSource, Kotest withData) and assert every time; for a loop over results, assert the whole collection at once (assertEquals(expected, results), shouldContainExactly, AssertJ containsExactly). Do not return early before the assertions, and let assertion errors escape. An exception fits only a case that cannot be stated unconditionally, such as cases generated at run time.
- **Exception:** If this is intended, add `{"rule":"pmd/AssertionInControlFlow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-coroutineescapestest"></a>

### `pmd/CoroutineEscapesTest`

A `launch`, `async`, `launchIn`, `stateIn` or `shareIn` on a scope the test does not own (`CoroutineScope(...)`, a scope field, `viewModelScope`) that nothing joins, awaits or cancels.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** This test starts a coroutine that the test does not wait for, so it can still be running, or fail, after the test has passed: a launch, async, launchIn, stateIn or shareIn on CoroutineScope(...), MainScope(), a scope kept in a field or a local, a scope a helper returns, lifecycleScope or viewModelScope without a test Main dispatcher, or a TestScope outside runTest is not a child of the test, and with, run, apply or also on such a scope does not change that. Run the body in runTest (or runBlocking, coroutineScope, supervisorScope) and launch from there, keep the Job or Deferred and join or await it (`val job = scope.launch { ... }; job.join()`), or build the scope on the test dispatcher and drive it with advanceUntilIdle; `backgroundScope.launch` inside runTest is for work that should end with the test. An exception fits only when the test waits through a harness this rule cannot see.
- **Exception:** If this is intended, add `{"rule":"pmd/CoroutineEscapesTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-disabledtest"></a>

### `pmd/DisabledTest`

A skipped test: `@Disabled`, `@Ignore`, `@Ignored` (also aliased or carried by an annotation), Kotest `xtest`, `xcontext`, `xdescribe`, `xit`, `xshould`, `xgiven`, a `!` name prefix, a `.config(...)` that never runs, a constant false condition or assumption.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** Fix or delete this test instead of disabling it: @Disabled, @Ignore, @Ignored (also through an alias or an annotation that carries them), an x-prefixed Kotest name (xtest, xcontext, xdescribe, xit, xshould, xgiven), a "!" name prefix, `.config(enabled = false)`, a condition that is always false and an assumption that is always false all skip it while the build stays green, so nothing shows that the behavior it covered is unchecked. Delete the test when the behavior is gone; to run it only where it can run, use a condition on the environment (`@EnabledOnOs`, `@EnabledIfSystemProperty`, an assumption on a real condition). An exception fits only a test that is skipped on purpose until a tracked defect is fixed.
- **Exception:** If this is intended, add `{"rule":"pmd/DisabledTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-droppedcallbackintest"></a>

### `pmd/DroppedCallbackInTest`

A call statement, or a lambda that only holds one, whose result is a function or a functional interface (`Runnable`, `Consumer`, `Executable`, `ContextConsumer` or a `fun interface` of the file): the callback is built and dropped, so its assertions never run.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** See the guide: [Kotlin preset guide](../kotlin-preset/review-rules.md).
- **Exception:** If this is intended, add `{"rule":"pmd/DroppedCallbackInTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-focusedtest"></a>

### `pmd/FocusedTest`

A Kotest focus that runs only part of the suite: the `f:` name prefix, `ftest`, `fcontext`, `fdescribe`, `fit`, `fshould`, `fgiven`.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** Remove the focus from this test: a Kotest name with the "f:" prefix and the f-prefixed registrations (ftest, fcontext, fdescribe, fit, fshould, fgiven) make Kotest run only the focused tests of the spec, so the rest of the suite is skipped while the build stays green. Run one test while you work with the IDE or a Gradle `--tests` filter, and commit the test without the focus.
- **Exception:** If this is intended, add `{"rule":"pmd/FocusedTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-messageafterassertion"></a>

### `pmd/MessageAfterAssertion`

An AssertJ `as`, `describedAs`, `withFailMessage` or `overridingErrorMessage` chained after an assertion method (`isTrue`, `hasSize`, `isEqualTo`), where it never applies.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** See the guide: [Kotlin preset guide](../kotlin-preset/review-rules.md).
- **Exception:** If this is intended, add `{"rule":"pmd/MessageAfterAssertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-nonatomicupdateacrosssuspension"></a>

### `pmd/NonAtomicUpdateAcrossSuspension`

A `var` property updated from a value read before a suspend call (`total += balances.fetch()`), so a concurrent coroutine's update is overwritten.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** See the guide: [Kotlin preset guide](../kotlin-preset/review-rules.md).
- **Exception:** If this is intended, add `{"rule":"pmd/NonAtomicUpdateAcrossSuspension","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-relaxedmockintest"></a>

### `pmd/RelaxedMockInTest`

A relaxed MockK mock of a class declared in the project's main sources: `mockk<Mailer>(relaxed = true)`, `mockkClass(Mailer::class, relaxed = true)`, `@RelaxedMockK`, `@MockK(relaxed = true)`, `@MockkBean(relaxed = true)`.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** See the guide: [Kotlin preset guide](../kotlin-preset/review-rules.md).
- **Exception:** If this is intended, add `{"rule":"pmd/RelaxedMockInTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-swallowedcancellation"></a>

### `pmd/SwallowedCancellation`

A `catch` of `CancellationException` (`kotlin.coroutines.cancellation`, `kotlinx.coroutines` or `java.util.concurrent`, also renamed, qualified or through a `typealias`) in a `suspend` function or coroutine builder lambda whose handler can complete without `throw`, `ensureActive()` or a hand-off of the exception.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** See the guide: [Kotlin preset guide](../kotlin-preset/review-rules.md).
- **Exception:** If this is intended, add `{"rule":"pmd/SwallowedCancellation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-timeout-abandons-operation"></a>

### `pmd/timeout-abandons-operation`

A timeout that stops waiting but leaves the work running: `future.get(timeout, unit)` without a cancel or rethrow, `get`, `orTimeout` or `completeOnTimeout` on `supplyAsync`/`runAsync`, `withTimeout { work.await() }` on a coroutine started in an outside scope.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** See the guide: [Kotlin preset guide](../kotlin-preset/review-rules.md).
- **Exception:** If this is intended, add `{"rule":"pmd/timeout-abandons-operation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)

<a id="pmd-validationannotationtarget"></a>

### `pmd/ValidationAnnotationTarget`

A Bean Validation annotation (`jakarta.validation.constraints`, `javax.validation.constraints`, `org.hibernate.validator.constraints`, or `@Valid`) on a primary-constructor `val` or `var` of a main source without a `field:`, `get:` or `all:` use-site target; Kotlin puts it on the constructor parameter, where Bean Validation does not look. Kotlin-only: a Java record carries the annotation to its field and accessor.

- **Why it is on:** One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.
- **Allowed form:** See the guide: [Kotlin preset guide](../kotlin-preset/review-rules.md).
- **Exception:** If this is intended, add `{"rule":"pmd/ValidationAnnotationTarget","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Kotlin preset guide](../kotlin-preset/review-rules.md)
