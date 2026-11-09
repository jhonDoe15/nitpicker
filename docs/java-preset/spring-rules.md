# Spring rules

Part of the [Java preset guide](../java-preset.md).

A project whose compile classpath has `spring-context` or `spring-boot`, or whose build files
(`build.gradle(.kts)`, `*.versions.toml`, `pom.xml`, comments removed) name `org.springframework`,
gets nitpicker's
Spring ruleset, [`languages/java/gradle/spring-ruleset.xml`](../../languages/java/gradle/spring-ruleset.xml),
added to its PMD run, next to nitpicker's rule set `pmd-ruleset.xml` (and the project's own `config/pmd/ruleset.xml` when
`tools.pmd.precedence` lists `"project"` too). Every
project's PMD run now gets the main and test compile classpaths and the main and test classes as
its auxiliary classpath (`pmd-aux-classpath.txt` in the report directory), so the rules match annotation and
supertype names exactly; `nitpickerPmd` therefore compiles the main and test classes first, and a
test compile error stops it. The manifest records `spring` and the
main `resourceRoots`. Whether the build files name Spring is read once from the head checkout and
handed to the base run through the head policy (`spring`, `-Pnitpicker.spring=true` for Gradle, the
Maven module analysis), so a change that adds Spring does not turn legacy violations into new
findings; a project that has Spring on the classpath only through a plugin keeps the per-snapshot
classpath detection.

Each rule allows one form and its message names it. A finding prints as `pmd/<rule>`, which is also
the `rule` of a config exception.

| Area          | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beans         | `SpringConstructorInjection`, `SpringImmutableBeans` (also static non-final fields), `SpringBeanCollectionState` (a `final` `HashMap`/`ArrayList`/`HashSet`/... field of a singleton bean written to after startup), `SpringNoServiceLocator` (not in an `ApplicationContextInitializer` or `EnvironmentPostProcessor`), `SpringNoLazyInjection`, `SpringStaticPostProcessorBean` (a `@Bean` method that returns a `BeanPostProcessor` or `BeanFactoryPostProcessor`, subtypes included, or carries `@ConfigurationPropertiesBinding`, and is not `static` or takes a parameter other than `Environment` or `ObjectProvider`; `ApplicationContext` and `BeanFactory` parameters pass too, and `@Lazy` and `@Value` parameters are left to `SpringNoLazyInjection` and `SpringTypedConfiguration`), `SpringOrderedProvider` (`stream()`, `forEach`, `iterator()` or `spliterator()` on an `ObjectProvider`, or a for-each loop over one), `SpringLiteConfiguration`, `SpringNoComponentScan`, `SpringHttpClientPerCall` (a `RestTemplate`, `RestTemplateBuilder`, `RestClient`, `WebClient` or `HttpClient` built inside a method that is not a `@Bean`, a `static` factory or a private helper only they call), `SpringHttpClientTimeouts` (a client, request factory, `new RestTemplateBuilder()` or Reactor Netty `HttpClient` built without timeouts in a field, constructor, `@Bean`, `static` factory or such a helper), `SpringNoPostConstructIo` (repository, JDBC, `EntityManager` or HTTP calls in `@PostConstruct`, `InitializingBean.afterPropertiesSet()`, a `@Bean(initMethod = ...)` method, or a private helper only they call) |
| Lifecycle     | `SpringUnreleasedResource` (a non-static field of a stereotype, `@Configuration`, `@SpringBootApplication` or `@AutoConfiguration` class that the class assigns an executor, `Timer`, started `Thread`, Netty event loop group, Kafka client, Spring `ThreadPoolTaskExecutor` or any other `AutoCloseable` it builds itself, with no `@PreDestroy`, `DisposableBean.destroy`, `AutoCloseable.close`, `Lifecycle.stop`, `ContextClosedEvent` listener or `@Bean(destroyMethod = ...)` method that releases it), `SpringStartupCleanup` (a `bind`, `connect` or `start` call in a constructor, `@PostConstruct`, `afterPropertiesSet`, an `ApplicationRunner`, `Lifecycle.start` or a `@Bean` `initMethod` after the bean started event loops, a `Timer`, a thread or work on its own executor, outside a `try` whose `catch` or `finally` releases them)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Configuration | `SpringTypedConfiguration` (no `@Value` outside `@Configuration`, no `System.getenv`/`getProperty` of application keys in any class except `@Configuration`, `@SpringBootApplication`, `EnvironmentPostProcessor`, `ApplicationContextInitializer` and `main`, no `Environment.getProperty` in beans), `SpringValueSecretDefault` (a non-empty default for a secret-named key in `@Value("${...secret:default}")`, `@DefaultValue`, a `@ConfigurationProperties` field initializer or `getProperty(key, default)`), `SpringProfileOnConfiguration`, `SpringNullOnlyConfigCheck` (a configuration string tested only for `null`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Proxies       | `SpringProxyMethodVisibility`, `SpringProxySelfCall` (both for the annotations in the table below), `SpringTransactionalAnnotation`, `SpringNoTransactionalController`, `SpringNoRequiresNew`, `SpringNoSwallowedTransactionException` (also private helpers of a `@Transactional` class), `SpringTransactionalCheckedRollback` (a checked `throws` without `rollbackFor`), `SpringTransactionalReadOnlyWrite` (a database write or a change to a loaded entity under `readOnly = true`), `SpringAsyncExecutor`, `SpringScheduledFixedDelay`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Web           | `SpringComposedMapping`, `SpringRestController`, `SpringValidRequestBody`, `SpringTypedResponse` (a handler returns `Object`, `JsonNode`, `Map<String, Object>`, `ResponseEntity<?>`, raw `ResponseEntity`, a list or `Optional` of those, or `null`), `SpringTypedRequestBody` (a `@RequestBody` that is an `Object`, `JsonNode`, `Map<String, Object>` or a list or `Optional` of those), `SpringNoErrorLeak` (the stack trace, or the message of a generic, JDK or persistence exception, reaching the response of an `@ExceptionHandler`), `SpringNoCrossOrigin`, `SpringCorsWildcard`, `SpringPasswordEncoder` (also the MD4, message-digest, LDAP SHA and SHA-256 encoders and `User.withDefaultPasswordEncoder()`), `SpringPermitAllAnyRequest`, `SpringCsrfDisabled`, `SpringHardcodedUser`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| JPA           | `JpaLazyFetching`, `JpaEntityClass`, `JpaManyToManyCascade`, `JpaManyToManySet`, `JpaVersion`, `JpaSequenceIds`, `JpaEnumString` (an enum field or `@ElementCollection` of enums without `@Enumerated(EnumType.STRING)`, or enum map keys without `@MapKeyEnumerated(EnumType.STRING)`), `JpaIdentityHashCode` (`hashCode` reading the `@GeneratedValue` id, or Lombok `@Data`/`@EqualsAndHashCode` without arguments on an entity)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Spring Data   | `SpringDataDerivedQuery` (every declared repository method has `@Query`; inherited methods such as `findById` and `save` stay legal), `SpringDataNativeQuery` (also `EntityManager.createNativeQuery`), `SpringDataModifyingQuery`, `SpringDataWriteWithoutTransaction` (a declared `@Modifying` query or derived delete without `@Transactional`), `SpringDataNoSaveInLoop`, `SpringDataBatchOfOne`, `SpringDataRowWriteInLoop`, `SpringDataSaveInLoopHelper`, `SpringDataFilterInQuery`, `SpringQueryConcatenation`, `SpringDataNoFlush`, `SpringDataNamedParameters`, `SpringDataQueryTextBlock`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tests         | `SpringUnusedContext` (test sources only, from `spring-test-ruleset.xml`; see [Review rules](review-rules.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Kotlin.** PMD reads Java sources only, so every rule in this table checks the Java files of a
project, on Gradle and Maven alike. In a kotlin-preset project every rule of the table except
`SpringQueryConcatenation` (covered there by `kotlin-source/SqlStringBuilding`) also runs on the main
Kotlin sources, under the same ids and exception route, from the Kotlin syntax facts (see
[Kotlin preset: Spring rules](../kotlin-preset/review-rules.md#spring-rules)). Kotlin classes of a Java-preset project (a mixed module)
get none of these rules. The Spring configuration file checks
([below](spring-configuration-files.md)) do not depend on the language and apply to Kotlin projects
too, and `missing-enable` scans the Kotlin sources.

**Type laundering (decision).** The Java counterpart of the TypeScript `as` and `any` bans is the unchecked
conversion, not the checked cast: a cast to a concrete type is checked at run time and is what Java offers
after an `instanceof` check, and `Object` as a parameter or field type is the counterpart of `unknown`, so
neither is a finding (no PMD, Checkstyle or Error Prone rule against them has a general recommendation behind
it). What launders a type is the compiler's `rawtypes` and `unchecked` lint categories: a raw `List`, an
unchecked generic cast. Narrow with `instanceof` (a pattern match), give the type its arguments, or parse
untrusted input once at the boundary. `@SuppressWarnings("unchecked")` and `"rawtypes"` hide those warnings
from the compiler only; this preset's [inline suppression](#spring-rules) scan covers the PMD, SpotBugs and
Error Prone names.

**Inline suppressions.** PMD would let a change silence any rule without review. nitpicker runs PMD
with `--suppress-marker` set to a string no code uses, so `// NOPMD` comments do nothing. PMD still
honors `@SuppressWarnings` with `"PMD..."`, `"all"`, `"unused"`, `"serial"` or `"fallthrough"`, and
evaluates constant expressions there, so nitpicker reports each such annotation, and any whose
arguments are not plain string literals, as `pmd/InlineSuppression` (Node side,
`languages/java/adapters/suppressions/java-suppressions.mjs`, for every Java project; unicode escapes are decoded
and strings and comments skipped first). The one accepted marker is
`@SuppressWarnings("PMD.SpringDataNativeQuery")` on a method: native SQL is sometimes needed, and
the decision belongs on that one method rather than in a config exception that covers paths.
Compiler-only warnings such as `"unchecked"` and `"rawtypes"` are not affected.

SpotBugs has no switch to ignore its annotations, so the same scan reports every annotation
SpotBugs honors as `spotbugs/InlineSuppression`: any name ending in `SuppressFBWarnings`, any
prefixed name ending in `SuppressWarnings` (such as a project's own `@AcmeSuppressWarnings`), and
`edu.umd.cs.findbugs.annotations.SuppressWarnings`; a SpotBugs exception names the bug pattern, for example
`spotbugs/EI_EXPOSE_REP`. Checkstyle's bundled `google_checks.xml` honors
`@SuppressWarnings("checkstyle:...")` and `CHECKSTYLE.OFF`, `CHECKSTYLE.SUPPRESS` comments;
nitpicker writes a copy without those filters (and without the optional xpath suppression file
the bundled config would read from the working directory), so they suppress nothing.

**Project configs are an explicit opt-in.** A project's `config/pmd/ruleset.xml` or
`config/checkstyle/checkstyle.xml` used to replace nitpicker's rules silently. Now they are read only
when `nitpicker.config.json` names them in `tools`, for example
`{ "tools": { "pmd": { "precedence": ["project", "nitpicker"] }, "checkstyle": { "precedence": ["project"] } } }`;
see [Your project's tool configs](../usage.md#your-projects-tool-configs). A project config chosen
this way is used as written, including its own suppression filters, and every file under
`config/pmd/` or `config/checkstyle/` goes into the cache key, since a config can reference its
neighbors. The init script reads its `nitpicker.*` Gradle properties from the command line only,
so a `gradle.properties` entry cannot opt in on the project's behalf (`nitpicker.archunit.includes`
is the exception: it only picks which test classes run). It sets the Checkstyle config on the
Checkstyle tasks after the build script runs, so a `checkstyle { configFile = ... }` block in the
project's build does not replace it either. The same holds for the SpotBugs settings a build
declares (an exclude filter, effort, threshold): nitpicker runs its own SpotBugs task and SpotBugs
jar, so a `spotbugs { }` block or `spotbugs-maven-plugin` configuration changes nothing until
`tools.spotbugs` opts in, and the run says it ignored them.

**Test sources are linted too.** PMD, Checkstyle (`checkstyleTest`, reported in
`checkstyle-test.xml`), Error Prone, google-java-format and the inline suppression scan cover
`src/test/java` and every other test source set (`integrationTest`, `testFixtures`; on Maven the
test roots, `build-helper-maven-plugin` `add-test-source` ones included) as well as the main
sources, with the test rules, the way the TypeScript preset lints its tests; the
file and folder limits already counted test files. A `jmh` or `benchmark` source set is neither main nor test code: nitpicker
neither compiles nor lints it on Gradle, as Maven ignores a source folder build-helper does not add. PMD runs nitpicker's own rule set,
[`languages/java/gradle/pmd-ruleset.xml`](../../languages/java/gradle/pmd-ruleset.xml): the
errorprone, bestpractices, performance and multithreading categories (security runs on main sources
only; the rules each category leaves out are listed under "Additional PMD categories" in [Slice 2](slice-2-cli-and-reporter-integration.md)) without
`UnitTestAssertionsShouldIncludeMessage` and `UnitTestContainsTooManyAsserts`, which set an
assertion style the TypeScript preset does not have,
plus design's `AvoidCatchingGenericException` (no `catch (Exception e)`, `RuntimeException` or
`NullPointerException`; errorprone already covers `Throwable`), as the TypeScript and Python presets
forbid broad catches (the message says that a test uses `assertThrows`, as Checkstyle's `EmptyCatchBlock` message does),
and the rules for boolean logic with an exact simpler form, whose messages print that form: design's
`SimplifyBooleanReturns`, `SimplifyBooleanExpressions`, `SimplifiedTernary`, `SimplifyConditional`,
`CollapsibleIfStatements` and `LogicInversion`, codestyle's `ConfusingTernary` for a negated condition
with an else, and nitpicker's `NegatedOperands` (see "PMD rules tuned by nitpicker" in
[Slice 1](slice-1-tools-reports-and-identities.md)), as the Python preset's ruff `SIM` rules do. A test with no assertion still fails (`UnitTestShouldIncludeAssert`, which
also counts MockMvc's `andExpect` and `andExpectAll`, BDDMockito's `then(...).should()`,
`WebTestClient`'s `expectStatus`/`expectBody`/`expectHeader` and `StepVerifier`'s `expectNext`,
`verifyComplete` and friends), and a class in test sources named like a test but without test
methods fails (`TestClassWithoutTestCases`), except `*ArchTest` and `*ArchitectureTest` classes,
which hold ArchUnit rules. The rules that only make sense in tests live in
[`pmd-test-ruleset.xml`](../../languages/java/gradle/pmd-test-ruleset.xml) (and, for a Spring project,
[`spring-test-ruleset.xml`](../../languages/java/gradle/spring-test-ruleset.xml)); the init script and
the Maven side wrap them in `pmd-tests.xml` in the report directory, which excludes the main source
directories, so a main class such as `TestDataGenerator` is not a test (see
[Review rules](review-rules.md)). The Spring rule set reads main sources only: the init script and the Maven side wrap it, with
`pmd-main-ruleset.xml`, in `pmd-main.xml` in the report directory with an exclude pattern per test
source directory, since field injection and package-private test methods are the norm in tests. A PMD rule that flags
legitimate test code, such as `SystemPrintln` in a test of console output, or `CloseResource` on a
`PrintStream` handed to `System.setOut`, takes an exception like any other: `{ "rule": "pmd/<rule>", "paths": [...],
"reason": "..." }`. PMD messages that name a line ("first occurrence is on line 12") lose the number
in the finding's identity, so moving code does not re-report them. SpotBugs, the structure limits
and CRAP stay on main code, as in the TypeScript preset.

**Exceptions.** Every Spring message except `SpringDataNativeQuery` ends with the exception to add
when the code is right, for example `{ "rule": "pmd/SpringDataNoSaveInLoop", "paths": [...],
"reason": "..." }`.

**How the web, security, data and transaction rules decide.**

- `SpringTypedResponse` and `SpringTypedRequestBody` look at methods annotated with a mapping
  annotation (`@GetMapping`, ..., `@RequestMapping`) or `@ExceptionHandler`. A `return null;` in the
  handler itself counts; a lambda inside it does not. Untyped means `Object`, `JsonNode` (and
  `ObjectNode`), a raw `Map` or one whose value type is `Object` or `?`, a raw `ResponseEntity`,
  and any of those inside a `List`, `Optional`, `ResponseEntity`, `Map` value, `CompletionStage` or
  reactive `Publisher`, two levels deep (`List<Map<String, Object>>`, `Mono<ResponseEntity<?>>`).
  `Map<String, String>`, `Map<String, ? extends Number>`, `MultiValueMap<String, String>` form
  posts, `Optional<T>`, `List<T>`, `ResponseEntity<Void>` and `ResponseEntity<T>` are fine. An
  untyped field inside the bound record or class (`record CreateOrder(Map<String, Object> attributes)`)
  and `@JsonAnySetter` are `archunit/spring-typed-request-field` (see Spring architecture rules).
- `SpringCorsWildcard` fires on a `"*"` origin (`setAllowedOrigins`, `addAllowedOrigin`, the
  pattern forms and the registry's `allowedOrigins`) only when the same method also allows
  credentials (`true` or `Boolean.TRUE`), and on a `@CrossOrigin` with origin `"*"` and
  `allowCredentials = "true"`. A filter chain is identified by the variable at the start of its call chain (`http`).
  `SpringCsrfDisabled` (`csrf(...disable())`, `csrf(AbstractHttpConfigurer::disable)`,
  `csrf().disable()`, `csrf(ServerHttpSecurity.CsrfSpec::disable)`) accepts a chain that also sets
  `SessionCreationPolicy.STATELESS` or a `NullSecurityContextRepository` (servlet), or
  `securityContextRepository(NoOpServerSecurityContextRepository.getInstance())` (WebFlux), and an
  OAuth2 resource server chain (`oauth2ResourceServer(o -> o.jwt(...))` or `opaqueToken`) whose
  `formLogin`, `httpBasic`, `rememberMe` and login flows are absent or disabled
  (`formLogin(AbstractHttpConfigurer::disable)`, `httpBasic(b -> b.disable())`,
  `formLogin().disable()`). `SpringPermitAllAnyRequest` fires on `anyRequest().permitAll()`,
  `anyExchange().permitAll()` and `requestMatchers("/**").permitAll()` or
  `pathMatchers("/**").permitAll()` unless the chain is scoped by `securityMatcher(...)` or the
  matcher names an `HttpMethod` (the `OPTIONS` preflight case), and on
  `web.ignoring().requestMatchers("/**")`. `SpringHardcodedUser` fires on
  `.password("literal")`, `.password(encoder.encode("literal"))` or a local variable or field
  initialized with a literal, on a `User` builder or an `inMemoryAuthentication()` user.
- `SpringQueryConcatenation` checks the first argument of `EntityManager.createQuery` and
  `createNativeQuery`, of the `JdbcTemplate` and `NamedParameterJdbcTemplate` query and update
  methods, and of `JdbcClient.sql`. It fires on `+` with a non-constant operand (a variable, a
  call; `UPPER_CASE` names count as constants), `String.format`, `formatted`, `concat`, `replace`,
  `String.join` and `MessageFormat.format` with a non-constant argument, a `StringBuilder` (inline
  or in a variable) that has a non-constant `append`, and a local variable initialized, reassigned
  (`sql = sql + name`) or extended with one of those. Constant pieces pass: literals, `UPPER_CASE`
  constants, a ternary between two literals (`desc ? "desc" : "asc"`), `String.format` with only
  literal arguments, the placeholder list `String.join(",", Collections.nCopies(n, "?"))`, and a
  local variable that holds only such pieces and is never reassigned. A text block, a constant,
  and values passed as bind parameters are the allowed form; for a list of values,
  `NamedParameterJdbcTemplate` or `JdbcClient` with `in (:ids)`. `EntityManager.createNativeQuery` also falls under `SpringDataNativeQuery`:
  the method needs the same `@SuppressWarnings("PMD.SpringDataNativeQuery")` marker.
- Per-row writes. `SpringDataNoSaveInLoop` (direct `save`, `delete`, `persist`, ... in a loop)
  also covers `forEachRemaining(repository::save)` and a `Consumer` variable holding
  `repository::save` that a loop calls or a `forEach` receives. `SpringDataBatchOfOne` fires on
  `saveAll`/`deleteAll`/`deleteAllById` called in a loop with a one-element `List.of`, `Set.of`,
  `Collections.singletonList` or `singleton`, inline or through a variable declared in the loop, also
  through `stream()`, `filter`, `map`, `toList()`, `collect(...)` and the like or a cast
  (`List.of(o).stream().filter(...).toList()`), or a fresh `new ArrayList<>()` (any empty `Collection`
  constructor) given exactly one `add` of a single element in the loop body and no other change;
  `List.of(array)` with one `Object[]` argument holds the array's elements and is not reported,
  inline or in a variable.
  `SpringDataRowWriteInLoop` fires, in a loop, on any other repository call whose result is
  discarded (a `@Modifying` update, a `deleteBy...`; also the body of an `ifPresent`,
  `ifPresentOrElse` or `executeWithoutResult` lambda, while the value of a `map` lambda is kept), on a call whose name starts with a write verb
  (`update`, `delete`, `remove`, `mark`, `set`, `rename`, `insert`, `upsert`, `increment`,
  `decrement`, `reset`, `clear`, `purge`, `archive`, `touch`) even when its result is used
  (`count += repository.markSold(id)`), on `Query.executeUpdate()` (not when the query binds an
  `Iterable` with `setParameter` to the name of an `in :ids` or `= any(:ids)` clause and binds no loop
  variable besides, which updates a chunk at once; the query may be held in a local and bound in
  separate statements, its text may be a constant, and a one-element `List.of(id)` is not a chunk) and on
  `forEach(repository::method)`. A method reference is reported even over chunks
  (`chunks.forEach(repository::retireAll)`): PMD does not see the referenced method's parameters, so
  write that loop as a lambda (`chunks.forEach(chunk -> repository.retireAll(chunk))`). It never fires on read names (`find`, `get`, `read`, `count`,
  `exists`, `query`, `stream`, `search`, `load`, `fetch`, `list`, `is`, `has`) or on a call that
  receives a collection as its first argument, or one and no loop variable (a chunk of ids is already
  set-based; `retain(id, kept)` still writes one row per `id`); the `saveAll`/`deleteAll` family
  and `flush` are left to the other rules. `SpringDataSaveInLoopHelper` follows one level: a loop
  (or a `forEach`, `map` or `peek` callback on a stream, `Iterable`, `Iterator` or `Map`) that calls
  `store(x)` or `this::store` of the same class, where `store` saves or deletes through a
  repository or `EntityManager`; a call that passes an `Iterable` to an overload whose parameter is
  one too is a batch and is skipped, while a parameter typed `Object`, `Serializable` or a type
  parameter takes the element and the list alike and is followed. A per-row `try`/`catch` around the call still counts: per-row
  error handling is done with `saveAll` per batch and error handling per batch, or an exception
  for the import. All of them skip a loop, or a `forEach` lambda, that also calls
  `EntityManager.clear()`. Whether `clear()` runs every so many items or on every item is not
  checked.
- `SpringUnreleasedResource` counts a field as owned when the class assigns it, in its
  initializer or any method or constructor, a value it builds itself: a constructor call, a static
  factory named `new*`, `create*`, `open*`, `connect*` or `build*` (not `newDirectExecutorService`,
  which starts no threads), or `build()`/`create()` at the
  end of a builder chain that starts at a type or a constructor, whose type is `ExecutorService`,
  `Timer`, a Netty `EventExecutorGroup`, `DisposableBean` or `AutoCloseable` (not the in-memory
  streams and writers, `java.util.stream` streams or the JDK `HttpClient`, whose threads stop when
  it is no longer used); a wrapper such as `Executors.unconfigurableExecutorService(...)` around one
  of those; or a `Thread` the class starts. Injected values, static fields (which `ClassLoadEffect`
  covers) and a field returned from a `@Bean` method of the class are left alone. A release is a
  `shutdown`, `shutdownNow`, `close`, `shutdownGracefully`, `cancel`, `interrupt`, `stop`,
  `destroy`, `dispose`, `terminate`, `disconnect` or `release` call on the field, or the field
  passed to a method whose name contains `shutdown`, `close`, `stop`, `terminate`, `dispose`,
  `destroy`, `release` or `cancel`, anywhere in the class, as long as the class has a method Spring
  calls at shutdown; inside that method, any call on the field or with the field as an argument
  (`ExecutorUtils.gracefully(pool)`) counts as its release. A public `shutdown()` on a scanned
  component does not count by itself, since Spring infers `close` and `shutdown` only for `@Bean`
  definitions. A field handed to another owner that closes it is reported; lift it with an
  exception for `pmd/SpringUnreleasedResource` on that path.
- `SpringStartupCleanup` looks at the startup method itself, not at the helpers it calls, and needs threads that are already running when the call fails: a Netty event
  loop group or a `Timer` field or local of the class, or, earlier in the same startup method, a
  started `Thread` or a task given to the class's own executor (executors start their threads on
  the first task). A `try` around the call whose `catch` or `finally` calls a method named like a
  release (`shutdown`, `close`, `stop`, `cancel`, `cleanup`, `abort`, ...) or whose `catch` does not rethrow
  passes. `start()` on a `Thread`, a `Matcher` or a `StopWatch` is not a failing call.
- `SpringDataFilterInQuery` fires on `repository.findAll()` without arguments followed by
  `.stream().filter/count/anyMatch/...`, `.size()` or `.isEmpty()`. On a reactive repository it
  also fires on `filter`, `filterWhen`, `count`, `any`, `all`, `hasElements`, `next`, `take` and
  `elementAt` of the `Flux`, on `collectList()` followed by `map`, `flatMap` or `filter` with
  `List::size`, `List::isEmpty` or a lambda that calls `size()`, `isEmpty()` or `stream()` and a
  filter on the list, and on `collectList().block()` followed by the blocking forms. A local that
  holds the result of `findAll()` counts as the call when the block that declares it reads it exactly once, in
  one of these forms; a local read more than once is left alone, since the method uses the rows.
  The TypeScript and JavaScript counterpart is `nitpicker/no-in-memory-query` and the Python one is
  `in-memory-query`; both also report sorts and aggregates computed in memory.
- `SpringTransactionalCheckedRollback` reports the `throws` clause of a `@Transactional` method
  (or a public method of a `@Transactional` class) that names a checked exception, unless the
  annotation has `rollbackFor` or `readOnly = true`. `SpringTransactionalReadOnlyWrite` reports a
  write from the shared list below (a call or a method reference such as `forEach(repo::save)`) in
  a method under `readOnly = true`, set on the method or inherited from the class; any
  `@Transactional` on the method, the jakarta one included, overrides the class. It also reports a
  setter call or field write on an entity the same method loaded into a local from a repository
  `find...`, `get...`, `read...`, `query...`, `search...`, `load...` or `fetch...` method (unwrapped
  with `orElseThrow()`, `orElse`, `orElseGet` or `get()`) or from `EntityManager.find`,
  `getReference` or `merge`: dirty checking would write it in a normal transaction and drops it under
  `readOnly`. Map the entity to a DTO when the change only shapes the response. Nitpicker drops
  such a finding when the local's declared type is a class or record of the project sources without
  `@Entity` (a DTO projection). `SpringTransactionalReadOnlyWrite` also counts a repository call that
  returns `int`, `Integer` or `void` as a `@Modifying` query whatever its name, unless the name
  starts like a read (`find`, `get`, `count`, `exists`, `sum`, `total`, `max` and the like), and
  drops the finding when the repository interface in the project sources declares that method with
  `@Query` and without `@Modifying` or `@Procedure`. `SpringProxySelfCall` also reports
  `this::method` references.
  `SpringNoSwallowedTransactionException` also covers a private or package-private helper of a
  `@Transactional` class, and a helper that a `@Transactional` method of the same class calls.
- Writes and transactions share one list of writes: a repository or `EntityManager` write named as
  above (a verb name counts when the verb is followed by an uppercase letter, a digit, `_` or
  nothing, so `updatedSince` is a read), `JdbcTemplate` or `NamedParameterJdbcTemplate` `update` and `batchUpdate`, `JdbcClient`
  `update()` and `Query.executeUpdate()`, `execute` on either JDBC template when its SQL (a literal
  or a string constant of the same file) starts with `insert`, `update`, `delete`, `merge`,
  `upsert`, `replace` or `truncate`, a jOOQ `insertInto`, `update`, `deleteFrom` or `mergeInto`
  chain that runs (`execute`, `executeAsync` or a `fetch...` after `returning`), the
  `DSLContext` `executeInsert`, `executeUpdate` and `executeDelete` calls, and `store`, `insert`,
  `update`, `delete` or `merge` on a jOOQ `TableRecord`, and `execute` after a jOOQ `truncate`.
  `SpringDataWriteWithoutTransaction` reports a method
  declared on a Spring Data repository that is annotated `@Modifying`, or named as a derived delete
  (`deleteBy...`, `removeAllBy...`) on a `JpaRepository`, when neither the method nor the interface
  carries `@Transactional` (Spring Data opens transactions only for the methods it inherits).
  Nitpicker drops both rules' findings when a superclass or interface in the project sources carries
  `@Transactional`.
  `SpringMultiWriteWithoutTransaction` reports a public method of a `@Service`, `@Component` or
  `@Repository` class without `@Transactional` on it or the class that makes two or more of those
  writes, counting each call of a non-public helper that writes, and a helper's own writes; writes inside
  `TransactionTemplate.execute`/`executeWithoutResult` or `TransactionalOperator.execute` do not
  count, a method that uses `TransactionalOperator.transactional` is left alone, and two writes on
  different branches of one `if`, `?:`, `switch` or `try`/`catch` count once, as do a write in an
  `if` branch that ends in `return` or `throw` and a write after that `if`; a `finally` block always
  runs, so its write counts. One `saveAll` is one
  write. `SpringCacheWriteInTransaction` reports, in a writing transaction (`@Transactional` without
  `readOnly = true` or a `NOT_SUPPORTED`, `NEVER` or `SUPPORTS` propagation, on the method or, for a
  public non-static method, on the class; a `TransactionTemplate` callback; a non-public helper that such a
  method calls), `put`, `putIfAbsent`, `evict`, `evictIfPresent`, `clear` and `invalidate` on a
  Spring `Cache`, and `@CachePut`, `@CacheEvict` without `beforeInvocation = true` or a `@Caching`
  with `put` or `evict` on such a method. Nitpicker drops it when the main sources configure a
  transaction-aware cache manager (`TransactionAwareCacheManagerProxy`,
  `TransactionAwareCacheDecorator`, `transactionAware()` on a builder or `setTransactionAware(true)`).
  `SpringLocalCacheWriteInTransaction` reports Caffeine and Guava `put`, `putAll`, `invalidate` and
  `invalidateAll`, writes through `asMap()`, a `get(key, loader)` whose loader writes, and a
  `put`, `putIfAbsent`, `computeIfAbsent`, `compute` or `merge` on a `Map` field whose value comes from
  a write in the same method (a generated id kept in memory). Code in an anonymous class (a
  `TransactionSynchronization`) or in a lambda passed to a method whose name says commit or
  completion runs later and is left alone.
- `SpringImmutableBeans` now includes `static` non-final fields. `SpringBeanCollectionState` needs
  both a plain collection and a write to it after startup. Writes in the constructor, an
  initializer block, a `@PostConstruct` method, `InitializingBean.afterPropertiesSet()`,
  `SmartInitializingSingleton.afterSingletonsInstantiated()`, a method that a `@Bean(initMethod = ...)`
  in the same file names, or a private helper (two levels deep, also through
  `this::register`) that only those call are startup and accepted; so are writes inside
  `synchronized` blocks or methods and in methods that take a `Lock`, and beans with
  `@RequestScope`, `@SessionScope` or a `@Scope` other than `singleton`. A write through a local
  variable or parameter that shadows the field's name is not a write to the field. The allowed form is a
  collection filled in the constructor and kept as `Map.copyOf`/`List.copyOf`, a
  `ConcurrentHashMap`, or a cache. `SpringHttpClientPerCall` accepts a client built in a field
  initializer, a constructor, a `@Bean` method, a private helper (two levels deep) that only those
  call, or returned from a `static` factory method; it also reports `new RestTemplateBuilder()` in
  any other method. `SpringHttpClientTimeouts` checks those places and reports
  `new RestTemplateBuilder()` whose chain has no `connectTimeout`, `readTimeout` (or their `set`
  forms), `requestFactory`, `requestFactorySettings` or `requestFactoryBuilder`, a Reactor Netty
  `HttpClient.create()` without `responseTimeout` in its chain or on its variable, a no-argument
  `ReactorClientHttpConnector`, `new RestTemplate()` without a later
  `setRequestFactory(...)`, `RestClient.create(...)`/`WebClient.create(...)` (except
  `RestClient.create(restTemplate)`, which keeps the template's factory), `HttpClient.newHttpClient()`,
  a `RestClient.builder()`, `WebClient.builder()` or `HttpClient.newBuilder()` whose call chain has
  no `requestFactory`, `clientConnector` or `connectTimeout`, and a `SimpleClientHttpRequestFactory`
  or `HttpComponentsClientHttpRequestFactory` whose variable never gets a timeout setter.
- `SpringNoErrorLeak` fires for `getStackTrace()` and, for an `Exception`, `RuntimeException`,
  `Throwable`, `IllegalArgumentException`, `IllegalStateException`, `NullPointerException`,
  `IOException`, `UncheckedIOException`, `DataAccessException`, `TransactionException`,
  `PersistenceException` or `SQLException` parameter, for its (or its cause's) `getMessage()`,
  `getLocalizedMessage()` and `toString()`, `"" + ex`, `String.valueOf(ex)` and formatting it. A
  value that only reaches a logger call passes, also through a local variable
  (`String message = ex.getMessage(); log.error("{}", message, ex);`). Handlers for your own
  exception types are not judged: their message is meant for the client.
- `JpaEnumString` also reads `@ElementCollection` fields: the element type of a collection and
  the value type of a map need `@Enumerated(EnumType.STRING)`, an enum map key
  `@MapKeyEnumerated(EnumType.STRING)`. It skips static and transient fields, `@Transient`, `@Convert` and Hibernate type
  annotations, entities that put `@Id` on a getter, and enums that an `@Converter(autoApply =
true)` class in the same file converts, directly or through a generic base class
  (`extends NameConverter<Shade>`). `JpaIdentityHashCode` reports the first read of a
  `@GeneratedValue` field (or its `getX()` getter) inside `hashCode`. Without a hand-written
  `hashCode`, Lombok counts too: `@Data` or `@Value` without `@EqualsAndHashCode`, and
  `@EqualsAndHashCode` over all fields (no arguments, or only `callSuper`), with `of` naming the
  id, or with `onlyExplicitlyIncluded = true` and `@EqualsAndHashCode.Include` on the id.
- `SpringTypedConfiguration` allows JVM properties (`java.`, `user.`, `os.`, `file.`, `line.`,
  `path.`, `javax.`, `jdk.`, `sun.`, `com.sun.`, `http.`, `https.`, `ftp.`, `socks...`) and the whole
  `System.getenv()` map, unless it is read by key (`System.getenv().get("X")`). It covers every
  class, plain helpers included, because a helper is the easy way around it; the allowed form there
  is to read the value once through `@ConfigurationProperties` and pass it in as a constructor or
  method argument. `SpringValueSecretDefault` uses the secret words of the config files'
  `literal-secret` check (see [Literal secrets](spring-configuration-files.md)): the last key segment,
  split into words, ends in `password`, `passwd`, `passphrase`, `secret`, `token`, `credential(s)`
  or a named key (`api-key`, `apiKey`, `signing-key`, `access-key`, ...), or is a bare `key` under an
  owner word (`app.api.key`, `jwt.key`), so `routing-key`, `partitionKey` and `app.sort.key` are
  not secrets. Any non-empty
  default fires except a nested placeholder or SpEL (`${a:${B}}`, `#{...}`), so
  `${app.token:changeme}` fires and `${auth.token-ttl:3600}` does not. It also covers a non-empty
  `@DefaultValue` on a secret-named `@ConfigurationProperties` component and
  `environment.getProperty("app.client-secret", "changeme")`, and a literal initializer of a
  non-static field of a `@ConfigurationProperties` class whose prefix plus field name is
  secret-named (`@ConfigurationProperties("auth")` with `String secret = "dev-secret"`).
- `SpringNullOnlyConfigCheck` reports a configuration string tested only for `null`. A property set
  to an empty value (`shop.token.issuer-uri=`, or an empty environment variable) binds as `""`,
  which passes the test, so the feature turns on with nothing to use. The strings are: a non-static
  `String` field or record component of a `@ConfigurationProperties` class (and of the classes
  nested in it), read in that class by name, `this.name` or its getter (`getName()`, or `name()` on
  a record); a `String` field with `@Value`, or one that a constructor assigns from a `@Value`
  parameter; a `@Value` `String` parameter in its method; and a no-argument `String` getter chain on
  a field, parameter or local whose declared type is named `...Properties` (not
  `java.util.Properties`), such as `properties.getJwt().getIssuerUri()`, which needs the project's
  classes on the classpath to know the getter returns `String`; and `environment.getProperty(key)`
  on an `Environment` or `PropertyResolver` outside `@Component`, `@Service`, `@Repository`,
  `@Controller` and `@RestController` classes, where `SpringTypedConfiguration` reports the read
  itself. A parameter, local, lambda parameter, `catch` parameter or pattern variable of the same
  name is another value. The tests are `== null`, `!= null`, `Objects.isNull`/`nonNull`,
  `Optional.ofNullable(x).isPresent()`/`isEmpty()` and `environment.containsProperty(key)`, and the
  fallbacks `Objects.requireNonNullElse(x, fallback)` and
  `Optional.ofNullable(x).orElse(fallback)`/`orElseGet`, which keep an empty value too (a fallback
  of `""` or `null` passes). Not reported: a test joined by `&&`/`||` with a test of the value
  itself (`StringUtils.hasText(x)`, `hasLength`, `x.isEmpty()`, `x.isBlank()`,
  `x.trim().isEmpty()`, `"".equals(x)`, Apache `isNotBlank`, Guava `isNullOrEmpty`, or any method
  call on it, such as `x.startsWith("https")`), a null-safe conversion that gives `null` back
  (`x == null ? null : x.trim()`), and tests inside `equals`, `hashCode`, `toString` and
  `compareTo`. The allowed form is `StringUtils.hasText(x)` (or `hasLength`, or `isBlank` next to
  the null test). When an empty value is a real setting, add an exception for the rule. The
  TypeScript preset reports the same mistake on `process.env` as
  `nitpicker/no-undefined-only-env-check`, the Python preset on `os.environ` as
  `env-none-only-check`.
  `SpringNoPostConstructIo` reports the call in a `@PostConstruct` method, in
  `InitializingBean.afterPropertiesSet()`, in a method that a `@Bean(initMethod = ...)` in the same
  file names, and in a private helper (two levels deep) that only those call.
  `SmartInitializingSingleton.afterSingletonsInstantiated()` runs once every singleton is ready, so
  I/O there is accepted. `SpringNoServiceLocator` skips an `ApplicationContextInitializer` or
  `EnvironmentPostProcessor`, which runs before the context exists and has no injection.

**Limits.** `JpaVersion` checks each `@Entity` or `@MappedSuperclass` that declares the `@Id`,
and each entity without a superclass, so the `@Version` field belongs next to the `@Id`. A finding
is dropped when a superclass found in the project's sources declares `@Version`; a superclass from
a library counts as having none. `AbstractClassWithoutAbstractMethod` skips `@MappedSuperclass`
classes, which are abstract to stop instantiation. The JPA and Spring rules match each `jakarta.*` type and its `javax.*` twin, so Spring Boot 2
code gets them too. `SpringDataDerivedQuery` leaves redeclared CRUD methods alone (`findById`, `findAll`, `save`,
`deleteById` and the rest of `ListCrudRepository`, `ListPagingAndSortingRepository`,
`JpaRepository` and `QueryByExampleExecutor`), since Spring implements those without parsing the
name, and accepts the `@Query` of the JDBC, R2DBC, MongoDB, Neo4j, Cassandra, Couchbase and
Elasticsearch modules; the other Spring Data rules know only the JPA annotations. Proxy annotations
on interface methods are accepted, because Spring reads them for both proxy kinds.
`SpringProxySelfCall` matches by name and argument count (a varargs method takes its fixed
arguments or more), and skips a call from one `@Transactional`
method to another with a plain `@Transactional` (same transaction) and matches a `this::name` reference by name.

The two proxy rules share one list of annotations, the same in the Kotlin preset:

| Rule (prints as)                  | Flags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Allowed form                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pmd/SpringProxySelfCall`         | A call from a class to its own method (`name(...)`, `this.name(...)` or `this::name`) that carries an annotation only a Spring proxy applies: Spring's `@Transactional` (except from one `@Transactional` method to a plain `@Transactional` one), `@Async`, the cache annotations, `@Retryable` (Spring Retry and Spring Framework 7), Spring Retry's `@CircuitBreaker`, `@ConcurrencyLimit`, `@PreAuthorize`, `@PostAuthorize`, `@PreFilter`, `@PostFilter` and `@Secured`; JSR-250 `@RolesAllowed` and `@DenyAll`; Resilience4j `@Retry`, `@CircuitBreaker`, `@RateLimiter`, `@Bulkhead` and `@TimeLimiter`; Micrometer `@Timed`, `@Counted` and `@Observed`; in a `@Validated` class, a Bean Validation or Hibernate Validator constraint or `@Valid` on a parameter, a type argument of one, or the method, of a method that is neither private nor static (a getter's own constraints count as a property's, not the method's); an annotation of the project meta-annotated with one of the Spring or JSR-250 ones, or with `@Constraint`; an annotation an `@Aspect` of the project names in `@annotation(...)`. | Move the annotated method to another bean and call it there.            |
| `pmd/SpringProxyMethodVisibility` | A method with one of the annotations of `SpringProxySelfCall` that is not public, or is `final` or `static`, and one of them on a `final` class. Interface methods are left out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Make the method public, non-final and non-static, in a non-final class. |

`@PermitAll` is left out: it checks nothing, so a call that skips it behaves the same. Micrometer's
annotations do nothing without their aspect bean (`TimedAspect`, `CountedAspect`, `ObservedAspect`),
and on a call that skips the proxy they do nothing either way. A project annotation counts through
other annotations of the project too, up to eight levels. Resilience4j and Micrometer find their
annotations by AspectJ pointcuts, which do not follow meta-annotations, so an annotation of the
project that only carries one of theirs does nothing anywhere and is not counted. The project's
annotations come from a scan of its Java sources, which hands them to the two PMD rules as rule
properties, on Gradle and Maven builds alike. An `@Aspect` names them as a type or through a bound
advice parameter, in an advice or a `@Pointcut`. A project that weaves its aspects with AspectJ at
compile or load time, instead of Spring's proxies, does run them on a self-call, and lifts the rule
with an exception.

`SpringDataNoSaveInLoop` covers
`for`, `while` and `do` loops and `forEach`, `map` and `peek` callbacks on a stream, an `Iterable`
or a `Map`, lambdas and method references (`forEach(repository::save)`) alike; `Optional.map` and
`ifPresent` run at most once and are not loops. It and `SpringDataNoFlush` skip a loop or an
iterating lambda that also calls `EntityManager.clear()`, the JPA batch idiom; for
`SpringDataNoFlush` that is the nearest loop or `forEach`, `map`, `peek` or `flatMap` lambda on a
stream, `Iterable`, `Map` or `Iterator` around the `flush()` (an `Optional.map` lambda is not a loop).
`SpringNoSwallowedTransactionException` reports catching `Exception`, `RuntimeException`,
`Throwable`, `DataAccessException`, `TransactionException` or `PersistenceException`, not narrower
exceptions such as `NumberFormatException`. `SpringQueryConcatenation` does not follow SQL that
comes from a helper method, a parameter or a field. `SpringDataSaveInLoopHelper` follows one helper
level (matched by name and argument count, varargs-aware), and `SpringNoPostConstructIo` follows private helpers two levels deep.
`JpaEnumString` sees an `autoApply` converter only in the same file; an enum converted by a
converter in another file needs an exception. A converter that extends a base class of the same file
converts the type argument the base passes on to `AttributeConverter` (`LabelConverter<K, E>` with
`AttributeConverter<E, String>` converts the second argument; a non-generic base converts its own
argument); a base in another file exempts every type argument of the subclass. `SpringPermitAllAnyRequest` does not resolve a
pattern held in a variable (`var all = "/**"`) or an `access(...)` that allows everyone.
`SpringCsrfDisabled` and `SpringPermitAllAnyRequest` match a chain by the name of its starting
variable within one method. Layering, entities in controller signatures and test placement need a
cross-class view, which PMD does not have; they are nitpicker's own ArchUnit rules, described next.

**Tests.** `spring/e2e/java-spring-rules.e2e.test.mjs` (gated like the other Java e2e tests and part of
`npm run test:java`) runs PMD through the init script on `adapters/fixtures/spring-project`, whose
sources mark every expected violation with a `// violation: <rule>` comment, and asserts the
reported set equals the marked set. The fixture also holds the legitimate forms each rule must
accept. It also runs Error Prone on the fixture and asserts its `FieldCanBeFinal`,
`PrivateConstructorForUtilityClass` and `MissingOverride` findings: `MissingOverride` in
`ProductRepository` and the one plain utility class, but no `FieldCanBeFinal` in the JPA entities
and no `PrivateConstructorForUtilityClass` on the application or configuration classes. The other
Error Prone checks fire on the deliberate violations the Spring rule examples hold.
