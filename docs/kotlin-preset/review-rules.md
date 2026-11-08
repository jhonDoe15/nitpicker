# Review rules

Part of the [Kotlin preset guide](../kotlin-preset.md).

Checks that detekt has no rule for, and in a Spring project the Java preset's Spring rules
([Spring rules](review-rules.md#spring-rules)), run on a syntax tree of the Kotlin sources; the
[test honesty](#test-honesty) rules run on the Kotlin test sources read as masked text. They use the rule
ids and the exception route of the Java preset's PMD rules, so a finding reads the same in both
languages and one `exceptions` entry style covers either.

How it works: task `nitpickerKotlinPsi` compiles the sources of `languages/java/gradle/kotlin-psi/` with the `javac`
of the JVM that runs Gradle, once per build into the root project's `build/tmp/nitpickerKotlinPsi`, and runs them
once per module with the pinned Kotlin compiler's parser. Gradle must run on a JDK (Java 21): on a Java runtime
without `javac` the task fails and says so. One parse
of the main and test source roots writes `kotlin-metrics.json` (main only: structure, CRAP, coupling) and
`kotlin-facts.json` (main and test: classes, functions, properties, calls, type aliases, waits, timeouts and
comparison chains; for main sources also the calls that run while a file or object loads, and the type or
initializer of each property). The rules are evaluated in Node (`languages/java/adapters/kotlin/review-rules/`) from the
facts, so they have no type resolution. A name is matched through the file's imports and the project's own
declarations, across all modules of the build; a call that cannot be tied to one declaration is left alone, so
an unclear case is not flagged. A file nested deeper than even the large stack of that program allows is
skipped with a note on stderr.

| Rule id                                          | Where                                            | Flags                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FixedSleepInTest`, `NegativeWaitInTest`         | `review-rules/tests/test-waits.mjs`              | a fixed wait in a test: `Thread.sleep`, `TimeUnit.X.sleep`, `parkNanos`, `delay` in `runBlocking`, timed `join` or `wait`, `after(ms)`, kotest `continually`, `during`                                                                                                                                                                                                                                                           |
| `DisabledTest`                                   | `review-rules/tests/honesty/`                    | a skipped test: `@Disabled`, `@Ignore`, `@Ignored` (also aliased or carried by an annotation), Kotest `xtest`, `xcontext`, `xdescribe`, `xit`, `xshould`, `xgiven`, a `!` name prefix, a `.config(...)` that never runs, a constant false condition or assumption                                                                                                                                                                |
| `FocusedTest`                                    | `review-rules/tests/honesty/`                    | a Kotest focus that runs only part of the suite: the `f:` name prefix, `ftest`, `fcontext`, `fdescribe`, `fit`, `fshould`, `fgiven`                                                                                                                                                                                                                                                                                              |
| `RetryInTest`                                    | `review-rules/tests/honesty/retries/`            | a retry set in test code: `@RetryingTest`, `@RepeatedIfExceptionsTest`, TestNG `retryAnalyzer`, `IRetryAnalyzer`, `RetryAnalyzerCount`, `setRetryAnalyzer`, Kotest `retries`                                                                                                                                                                                                                                                     |
| `ServerOrContainerPerTest`                       | `review-rules/tests/setup/`                      | a container, server or process started for each test: a `@Container`, `@Rule` or `@RegisterExtension` property of a JUnit instance, a Kotest container extension in a per-test mode, a start in `@BeforeEach`, `@Before`, `beforeTest` or `beforeEach` on an object made for each test, the same start in two or more tests of a class                                                                                           |
| `AssertionInControlFlow`                         | `review-rules/tests/honesty/`                    | an assertion that can be skipped: inside an `if` or a `when` whose branches do not all assert, a loop, a safe call, `&&`, `\|\|`, `?:`, a swallowing `try` or `runCatching`, or after an early return                                                                                                                                                                                                                            |
| `CoroutineEscapesTest`                           | `review-rules/tests/coroutines/`                 | a `launch`, `async`, `launchIn`, `stateIn` or `shareIn` on a scope the test does not own (`CoroutineScope(...)`, a scope field, `viewModelScope`) that nothing joins, awaits or cancels                                                                                                                                                                                                                                          |
| `MockedSubjectInTest`                            | `review-rules/tests/mocks/`                      | a mock of the class under test (`mockk<OrderService>()`, `mock<OrderService>()`, `mock(OrderService::class.java)`, `@MockK`, `@Mock`), or a spy of it whose own methods the test stubs (`spyk(...)`, `spy(...)`, `@SpyK`, `@Spy`, with `every`, `coEvery`, `justRun`, `whenever`, `` `when` ``, `given` or `stub`)                                                                                                               |
| `StaticMockOfProjectType`                        | `review-rules/tests/mocks/`                      | `mockkObject`, `mockkStatic` (class, `"pkg.FileKt"` or `::function`), `mockkConstructor`, `mockStatic` or `mockConstruction` of code declared in the project's main sources                                                                                                                                                                                                                                                      |
| `RelaxedMockInTest`                              | `review-rules/tests/mocks/`                      | a relaxed MockK mock of a class declared in the project's main sources: `mockk<Mailer>(relaxed = true)`, `mockkClass(Mailer::class, relaxed = true)`, `@RelaxedMockK`, `@MockK(relaxed = true)`, `@MockkBean(relaxed = true)`                                                                                                                                                                                                    |
| `GlobalStateLeakInTest`                          | `review-rules/tests/global-state/`               | a test that changes process-wide state (a system property, the default `Locale` or `TimeZone`, `System.out`, a default handler, a security provider, `Dispatchers.setMain`, or a property or `set...` function of a project `object` or class) that nothing in the class puts back                                                                                                                                               |
| `StaticForwardingWrapper`                        | `review-rules/main/forwarding-wrappers.mjs`      | a function whose body only passes its parameters, in order, to another function                                                                                                                                                                                                                                                                                                                                                  |
| `SingularAndPluralMember`                        | `review-rules/main/member-names.mjs`             | a member and its plural form (`tag` and `tags`) in one class, or two defaulted parameters of a public function                                                                                                                                                                                                                                                                                                                   |
| `ValidationAnnotationTarget`                     | `review-rules/validation/validation-targets.mjs` | a Bean Validation annotation (`jakarta.validation.constraints`, `javax.validation.constraints`, `org.hibernate.validator.constraints`, or `@Valid`) on a primary-constructor `val` or `var` of a main source without a `field:`, `get:` or `all:` use-site target; Kotlin puts it on the constructor parameter, where Bean Validation does not look. Kotlin-only: a Java record carries the annotation to its field and accessor |
| `SpringUnusedContext`                            | `review-rules/tests/spring-context.mjs`          | a `@SpringBootTest` class that uses nothing from the context                                                                                                                                                                                                                                                                                                                                                                     |
| `ExhaustiveEnumPredicate`                        | `review-rules/main/enum-predicates.mjs`          | a test that lists only some constants of an enum (`==` chains, `in setOf(...)`, `listOf(...).contains(s)`, a `when (s)` whose branches yield one Boolean and whose `else` yields the other), so a constant added later falls into the other case                                                                                                                                                                                 |
| `timeout-abandons-operation`                     | `review-rules/main/timeouts/timeouts.mjs`        | a timeout that stops waiting but leaves the work running: `future.get(timeout, unit)` without a cancel or rethrow, `get`, `orTimeout` or `completeOnTimeout` on `supplyAsync`/`runAsync`, `withTimeout { work.await() }` on a coroutine started in an outside scope                                                                                                                                                              |
| `unused-option` (tool `structure`)               | `review-rules/main/unused-options/`              | a defaulted parameter that no call sets, of a public top-level, `object` or companion function or a private or internal function or constructor                                                                                                                                                                                                                                                                                  |
| `ClassLoadEffect`                                | `review-rules/main/load-effects.mjs`             | a call with an external effect (database, network, files, processes, threads and pools, JVM-wide settings) that runs while a file, `object`, companion object or enum class loads                                                                                                                                                                                                                                                |
| `UnboundedThreadPool`                            | `review-rules/main/thread-pools/`                | `Executors.newCachedThreadPool()` (also imported) and a `ThreadPoolExecutor(...)` whose maximum pool size is `Int.MAX_VALUE`; the allowed form is a bounded pool or `Dispatchers.IO.limitedParallelism(n)`                                                                                                                                                                                                                       |
| `RecursiveMapUpdate`                             | `review-rules/main/map-updates/`                 | a change to a map inside the lambda passed to that same map's `computeIfAbsent`, `compute`, `computeIfPresent`, `merge`, or `getOrPut` on a `ConcurrentMap`, also in a callback created there or a same-class function it calls or references; see the limits below                                                                                                                                                              |
| `GeneratedMemberCycle`                           | `review-rules/main/generated-members/`           | a primary-constructor property of a data class that closes a cycle of data classes: a class that holds itself both as a single property and in a collection (a parent and its children), or data classes that refer to each other; the generated `toString`, `equals` and `hashCode` then recurse. See the limits below                                                                                                          |
| `GeneratedEqualsSkipsSuperclass`                 | `review-rules/main/generated-members/`           | a data class that extends a project class with state (a `val`/`var` constructor property or a body property with a backing field) that it does not override in its primary constructor, so the generated `equals` and `hashCode` ignore it                                                                                                                                                                                       |
| `UnboundedFanOut` (tool `kotlin-source`)         | `review-rules/main/fan-out/`                     | a task started for every element of a collection (`async`, `launch`, `supplyAsync`, `thread`) whose work makes a remote or message call; see the limits below                                                                                                                                                                                                                                                                    |
| `UnboundedReactiveFanOut` (tool `kotlin-source`) | `review-rules/main/reactive-fan-out/`            | a Reactor `flatMap` over a collection without a concurrency argument, `Mono.zip`/`Mono.when`/`Flux.merge` over a list built per element, or `flatMapMerge(Int.MAX_VALUE)`, whose element work makes a remote or message call; see the limits below                                                                                                                                                                               |

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
  read: a sleep in main sources is `detekt.style.ForbiddenMethodCall` (see [One-way rules](one-way-rules.md)).
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
  `@RestControllerAdvice`, `@Configuration`, `@SpringBootApplication`, `@AutoConfiguration`,
  `@TestConfiguration`), resolved through the imports or written fully qualified, as in the Spring rules.
- Timeouts (`pmd/timeout-abandons-operation`, main sources only, the Kotlin form of the rule every preset
  has under that name; the facts come from `kotlin-psi/timeouts/`): `withTimeout` and `withTimeoutOrNull`
  cancel the coroutines they start, so they pass. Three forms are reported, with the Java rule's
  semantics. `x.get(timeout, unit)` inside a `try` that catches `TimeoutException`, when the second
  argument is a `TimeUnit` constant (`TimeUnit.SECONDS`, or `SECONDS` imported from
  `java.util.concurrent.TimeUnit`, also under an alias or a star import; the facts carry no types, so
  the catch and the unit identify `Future.get`, and `cache.get("key", "fallback")` is not read as one),
  when a timeout handler neither throws (a `throw` inside a lambda or a local function does not count)
  nor passes `x` to a call other than a log or print call, and the function never stops the work:
  `cancel(...)` on `x` unless its argument is `false`, `shutdownNow()` on the executor `x` comes from
  (`val x = pool.submit(...)`, or a call that receives `x`), or `interrupt()` on a local
  `val t = Thread(x)`; for an `x` of unknown origin (a parameter or a property) `shutdownNow()` or
  `interrupt()` on any named receiver counts. `shutdown()` and `Thread.currentThread().interrupt()`
  never count. A `get` on a future that `CompletableFuture.supplyAsync(...)` or `runAsync(...)`
  started is reported whatever the handler cancels, as is `orTimeout` or `completeOnTimeout` on a
  chain that starts there, directly or through a local `val`, because cancelling or completing a
  `CompletableFuture` never interrupts its task; only a rethrow, a hand-off or `shutdownNow()` on the
  executor passed to `supplyAsync` lets that `get` pass. And a `withTimeout`/`withTimeoutOrNull` block
  (imported from `kotlinx.coroutines`, also under an alias or a star import) whose lambda calls
  `await()` or `join()` on a local `val`, or `awaitAll`/`joinAll` with it (`awaitAll(a, b)`,
  `listOf(a, b).awaitAll()`), that `<scope>.async` or `<scope>.launch` started before the block with
  an explicit receiver (`GlobalScope`, a stored `CoroutineScope`), when neither the value nor that
  scope is cancelled (`cancel`, `cancelAndJoin`, `cancelChildren`, also through
  `scope.coroutineContext.cancelChildren()`) anywhere in the function. An `async` without a receiver
  is a child of the enclosing `coroutineScope` and is cancelled with it, a `Deferred` from a
  parameter, a property or a function result has an unknown owner, and neither is reported. The
  identity is `<owner>.<function>:<form>:<name>` (the enclosing class and function, the form, and the
  waited variable or the call it is chained on), so it holds no source text and an edit elsewhere
  does not renumber it.
- Singular and plural: both members must have the same element type (the plural a list, set,
  collection or array of it). Inspected: the primary-constructor properties of a `data class`, the
  properties of a `@ConfigurationProperties` class, the public and internal primary-constructor
  properties of any other class that declares no functions (not `private` or `protected` ones, and
  not JPA entities, embeddables, mapped superclasses or Spring `@Component`, `@Service`,
  `@Repository`, `@Controller`, `@RestController` or `@Configuration` classes), and two parameters
  with default values of a public function or constructor (not `protected`, `override` or local
  ones). A default is the Kotlin form of an optional input, so
  required parameters (`fun hasRole(role: String, roles: Set<String>)`, a lookup) are not
  reported. Two members whose meanings differ (`owner` beside `owners` for the co-owners) are the
  case for an exception with a reason.
- Spring context: any injected or mock bean, `MockMvc`, `WebTestClient`, `TestRestTemplate`,
  `CapturedOutput`, `ApplicationEvents`, `ApplicationContext` or a `webEnvironment` with a random or defined
  port counts as use.
- Enum predicate: the enum is found among the Kotlin and Java declarations of the whole build and needs at
  least three constants; one that is not found and a test that lists every constant are not flagged. A
  `when (status)` is flagged when it ends in `else`, every other branch yields the same `true` or
  `false` (`Status.NEW, Status.PAID -> true`, or `-> return true` when every branch returns), `else`
  yields the other, and it lists at least two constants of a stable subject; a `when` without `else`,
  one whose branches yield other values, one with `in` or `is` conditions and `when (val s = ...)` are
  not. The test must be returned, assigned, kept in a variable, the last expression of a lambda, the
  body of a property getter, or the condition of an `if` that has an `else` and is itself one of those.
  Backticked constants (``Status.`in` ``) are matched by their name. A test in a property initializer is
  named after the property (`Holder.isOpen`), as it is in a getter.
- Unused option: a defaulted parameter that no call sets by name or position (matched by name and through
  an import alias). A call that cannot match the signature is ignored, a call with a spread sets every
  parameter, and a `copy(name = ...)` call sets that parameter of a data class. Functions that are
  `override`, `open`, `abstract`, `operator`, `infix`, `main` or annotated are never judged, nor are names
  with a callable reference or that a Java file mentions. Two kinds of declarations are judged:
  - Public functions at the top level, in a top-level `object` or in the companion object of a top-level
    class, the Kotlin form of TypeScript's exported functions and Python's module-level functions. Calls in
    the main sources of every module of the build count, and so do the module's own tests when the module
    is published (a Gradle `publishing` publication, as for `test-only-export`); callable references and
    Java sources of every module are checked. An `object` or companion of a Spring-managed class is left
    alone; the annotation is resolved through the imports as in the Spring rules (`@Component`, `@Service`,
    `@Repository`, `@Controller`, `@RestController`, `@ControllerAdvice`, `@RestControllerAdvice`,
    `@Configuration`, `@SpringBootApplication`, `@AutoConfiguration`, `@TestConfiguration`, also written
    fully qualified), and the forwarding-wrapper rule uses the same check. Public member functions and
    public constructors are not judged: frameworks build and call them by reflection (Jackson,
    configuration binding, injection), out of sight of the facts, and TypeScript and Python do not judge
    them either.
  - Private and internal functions (not in an interface) and the constructors of final classes without
    annotations, private or internal. All their callers are in the module, so calls in its main sources and
    tests count, a type alias of the class counts as its name, and only the module's own facts and Java
    sources are read. Data classes are skipped when the module has `jackson-module-kotlin`,
    `kotlinx-serialization` or `moshi-kotlin` on its main compile or runtime classpath (`runtimeOnly`
    counts), since a library may set the defaults; a library that does so without that jar (reflection in
    a framework) is not seen.

  Callers the facts do not see switch off the judging of public functions only in the modules they can
  call. Each such place, read from the Gradle build, reaches the projects it depends on (directly or
  through other projects): an Android or Multiplatform project; a Kotlin or Java project outside the
  analysis root; a source set other than `main` and `test` that holds `.kt` or `.java` files and is not
  generated (Spring Boot's `aot` and `aotTest`, see the Java preset's Spring AOT) (it also reaches its
  own project); an included build whose build files name a project of this build as
  `group:name` (an included build that names none, such as a plugin build, reaches nothing); and a file
  the facts step skipped, which reaches its module and that module's dependencies. Test code (a source set
  whose name has `test` or `jmh`, a JVM test suite, a source set a `Test` task runs, a skipped test file)
  only counts for the declarations of its own module when that module is published, since tests count
  nowhere else. One report-only note (`callers-not-analyzed`) names these places, anchored on the public
  function of an affected module that comes first by path and line.

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
- Generated members: `GeneratedMemberCycle` and `GeneratedEqualsSkipsSuperclass` are the Java rules
  of the same names. Only data classes count, since only they generate the members; a class that
  writes `toString`, or both `equals` and `hashCode`, leaves that member out. A property type is
  followed through its type arguments (`List<Line>`, `Map<String, Line>`), resolved by nesting,
  explicit and aliased imports, the same package and star imports; an explicit import shadows a
  same-package class, and a `vararg` counts as a collection. A type that contains a function type
  is not followed, nor is a `typealias`, since the facts keep no type arguments for it.
  A class that holds itself only in a collection (a tree) or only as one property (a list) is not a
  cycle, and the two-class form also reports a menu whose items hold submenus, which is the intended
  case the message names. The superclass check follows Kotlin superclasses up to ten levels and
  stops at a `final override fun equals`; a Java superclass is not read.
- Map updates: `RecursiveMapUpdate` is the Java rule of the same name. A change is `put`, `putAll`,
  `putIfAbsent`, `remove`, `clear`, `compute*`, `merge`, `replace`, `replaceAll`, `getOrPut`,
  `map[key] = value`, `+=` and `-=` on the map, or `remove`, `removeIf`, `removeAll`, `retainAll`,
  `clear` and `-=` on its `keys`, `values` or `entries`. The map is the same local or parameter, or
  the same property read bare, through `this.` or through `this@Outer.`, resolved to the nearest
  enclosing class that declares it, so an inner class's `counts` is not the outer `counts`; a lambda
  parameter or local of the same name keeps a call off. A bare name inside a `with`, `apply` or `run`
  lambda on another receiver may be that receiver's property, so it is not followed past that lambda
  (`this@Outer.map` is). `getOrPut` counts only on a receiver typed `ConcurrentHashMap`,
  `ConcurrentMap` or `ConcurrentSkipListMap` (declared or from its initializer): there the value is
  stored only after the function returns, so a cleanup that runs inside it is undone. Same-class
  helpers, called from the lambda or passed as `::helper`, are followed one level, by name, and only
  for a property map. A lambda inside a local function or an `object` expression is not followed.
- Fan-out: `UnboundedFanOut` is the rule the TypeScript and Python presets call `unbounded-fan-out`,
  printed as `kotlin-source/UnboundedFanOut` (the id an `exceptions` entry names). A task is an
  `async` or `launch` lambda, `CompletableFuture.supplyAsync`/`runAsync` on the default pool or an
  executor created by `newCachedThreadPool`, `newVirtualThreadPerTaskExecutor`,
  `newThreadPerTaskExecutor` or `commonPool`, `submit`/`execute` on such an executor, `thread` or
  `startVirtualThread`, started inside a `for` loop or an iterating lambda (`map`, `forEach`,
  `flatMap`, `onEach`, `associate*`, the `*To` forms and their indexed variants) or `repeat`. Its
  work is remote when a call in it, or in a function it calls (same class, a class of the project
  through a typed receiver, a top-level function of the package or a `this::helper` reference, up
  to three calls deep), has a receiver (a parameter, property, local or top-level `val`) typed as a Ktor or `java.net.http` `HttpClient`,
  `OkHttpClient`, `RestTemplate`, `RestClient`, `WebClient`, `KafkaTemplate`, a Kafka producer,
  `RabbitTemplate`, `AmqpTemplate`, `JmsTemplate`, `StreamBridge` or an AWS SQS or SNS client. The
  receiver chain of the lambda is read from the syntax tree, so a chain such as
  `urls.filter { ... }.map { ... }` or `(0 until urls.size).map { ... }` counts as a fan-out over
  `urls`. These pass: the
  call inside `withPermit { ... }` or after a semaphore's `acquire()` in the same task or helper
  (a permit taken around other work does not count); `async`/`launch` on a dispatcher made with
  `limitedParallelism`; a fixed collection (`listOf` and the other builders, enum `entries` or
  `values()`, a `val` or property holding a builder); `take`, `takeLast`, `subList` or `slice`
  whose size does not read the collection's own size (`minOf(10, urls.size)` passes,
  `take(urls.size)` does not); a chunk variable over `chunked(n)` or `windowed(n)`; a count-driven
  worker pool (`repeat(workers)`, `1..workers`, `0 until concurrency`), while a count taken from a
  size (`repeat(urls.size)`, `urls.indices`) stays a fan-out over the collection; and a task
  awaited (`await`, `join`, `get`) before the next element. A task started per chunk of
  `chunked(n)` is reported, since the number of chunks grows with the collection. Limits:
  `limitedParallelism` caps the threads that run the tasks, not the suspended calls in flight, so
  a suspending client under such a dispatcher is still unbounded in practice; it is allowed as
  [#439](https://github.com/jhonDoe15/nitpicker/issues/439) asks, and `withPermit` is the form
  the message names. Flows (`flatMapMerge` without `concurrency`), an executor received as a
  parameter or injected, an abstract or interface method (its implementations are not followed),
  a receiver whose type the facts cannot name, and a count computed from data rather than read
  from a size (`for (i in 0 until pages)`, which passes as a worker-pool count) are not reported. A call
  that this rule reports is not reported again by `IoCallInLoop`; a bounded or awaited per-item
  call keeps that finding.
- Reactive fan-out: `UnboundedReactiveFanOut` is the counterpart of the Java preset's
  `pmd/UnboundedReactiveFanOut` and the TypeScript preset's `unbounded-reactive-fan-out`. It reports a
  Reactor `flatMap` or `flatMapSequential` without a concurrency argument whose chain starts at
  `Flux.fromIterable`, `fromStream`, `fromArray` or `toFlux()` on a collection (up to 256 calls at
  once, Reactor's default); `Mono.zip`, `Mono.zipDelayError`, `Mono.when`, `Mono.whenDelayError` and `Flux.zip` over
  `items.map { ... }` or a local holding one (every call at once); `Flux.merge` and
  `Flux.mergeSequential` with that list as their only argument (up to 256 at once, or all at once for a spread
  `*list.toTypedArray()`); and `flatMapMerge(Int.MAX_VALUE)` on a Flow. The element work, a lambda
  or a `this::helper`/`::helper` reference, must reach a remote or message call as `UnboundedFanOut`
  decides it. These pass: a concurrency argument (`flatMap({ fetch(it) }, 8)`), `concatMap`, a
  `buffer`, `window`, `collectList` or `reduce` before the operator, a `take` or `limitRequest` there
  whose size does not read the collection's size (`take(10)` passes, `take(ids.size.toLong())` does not), a fixed
  collection (the same builders and properties as `UnboundedFanOut`), two publishers passed one by
  one, a `Flux` that does not start from a collection, a call inside `withPermit`, and
  `flatMapMerge` with its default of 16 or a smaller limit (raising the default through the
  `kotlinx.coroutines.flow.defaultConcurrency` system property is not visible in the source). A
  reference to another object's method (`feeds::fetch`) is not followed. The operator is read from
  the receiver text, so an import alias (`import reactor.core.publisher.Flux as F`) or a static import
  of `fromIterable` is not recognized, and a `Flux` held in a local is not followed. A call this rule reports is
  not reported again by `IoCallInLoop`.
- Not covered: Android and Kotlin Multiplatform modules (the facts step is registered for
  `org.jetbrains.kotlin.jvm` only), and source-set `exclude` patterns (every `.kt` file under a source
  directory is read, as for detekt and the other Kotlin steps).

## Test honesty

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
- `MockedSubjectInTest` and `StaticMockOfProjectType`: the Kotlin forms of the Java rules, read from the test
  source text of files that import `io.mockk` or `org.mockito`. The class under test is the type of an
  `@InjectMockKs` or `@InjectMocks` property, or else the test class name without `Test`, `Tests`, `IT` or
  `Spec`; it must be declared in the project's main sources. A spy is reported only when the test stubs one of
  its methods (a local spy, in the block that declares it); a spy that is only verified and a
  `CALLS_REAL_METHODS` mock, the way to test an abstract class, are fine. `mockkStatic("java.time.LocalDate")`, `mockkObject` of a
  library object and other library code are not reported. Allowed: pass the collaborators in through the
  constructor and give the test fakes of them, test a helper through the public function that calls it, and
  pass a function, an interface or a `Clock` instead of mocking an `object` or a top-level function.
- `RelaxedMockInTest`: the Kotlin form of the Python `mock-without-spec`. A relaxed mock answers every call
  nobody stubbed with a default (`0`, `""`, an empty list, another mock), so the code under test runs on
  made-up results and the test keeps passing when the class changes. Read from test files that import
  `io.mockk` or `com.ninjasquad.springmockk`; reported for types declared in the project's main sources
  (a relaxed `Logger` or other library type is fine) other than the class under test, which
  `MockedSubjectInTest` reports. `relaxUnitFun = true` relaxes only `Unit` calls and is not reported. Allowed:
  stub what the test needs on a plain `mockk<Mailer>()` (`every { ... } returns ...`), `relaxUnitFun = true`, or
  a fake. Java has no counterpart: a Mockito mock's default answers are its only mode, and its stubbing rules
  are a separate check.
- `RetryInTest`: a retry set in test code, so a flaky test cannot pass on a later attempt. JVM forms, in
  any test source: JUnit Pioneer `@RetryingTest` and rerunner-jupiter `@RepeatedIfExceptionsTest` (also
  through an import alias or in an `@[...]` group; any retry annotation is reported, `@RetryingTest(1)`
  included, and so is a meta-annotation declared with one, at its declaration), TestNG
  `@Test(retryAnalyzer = ...)`, a class or object that implements `IRetryAnalyzer` or extends
  `RetryAnalyzerCount`, and a `setRetryAnalyzer(...)` call (an `IAnnotationTransformer` doing it for every
  test), but not a function declared with that name. Kotest forms: `retries` in `.config(...)` on a test or
  a container, `retries = n` (or `this.retries = n`) as a statement of a spec body or `init` block (not an
  argument of another call, not a property of another object), `override val retries` in a class that
  extends `AbstractProjectConfig` or `AbstractPackageConfig`, also over several lines, with `get()` or
  `by lazy`, and through a base class of the same file, and `retries` in `TestConfig(...)` or
  `DefaultTestConfig(...)` when the name comes from `io.kotest` (an import, an alias, a star import or the
  fully qualified name). Not reported: a literal `0` or `null`, a constant of the same file that is `0` or
  `null`, `retryDelay` alone, and `@RepeatedTest`, which is not a retry because every repetition must pass.
  A base config class in another file and a constant from another file are not followed. The Java preset
  has the same rule id for the JVM forms. Fix the cause instead, for example wait on the condition instead
  of a fixed delay or isolate shared state; use `exceptions` only for a test that must retry on purpose.
- `GlobalStateLeakInTest`: the same rule id as the Java preset. Reported in a test source file: `System.setProperty`,
  `clearProperty`, `setProperties`, `setOut`, `setErr` and `setIn`, `Thread.setDefaultUncaughtExceptionHandler` (also
  with a trailing lambda), `Locale.setDefault` and `TimeZone.setDefault` (from `java.util`), `Security.addProvider` and
  `insertProviderAt`, `setDefault` on `CookieHandler`, `Authenticator`, `ProxySelector`, `ResponseCache` and `SSLContext`,
  the `HttpsURLConnection` default factory and verifier, `Dispatchers.setMain`, and an assignment (`=`, `+=`, `++`) to a
  property of a project type (`Clock.offset = 5`, `Prices.Companion.rounding += 1`) or a call of its `set...` function
  (not `setUp...`). A type counts as the project's under the same package-root rule as the Java preset; a library's
  object and a type declared in the test file are left alone. Restored means: the same state set again in a `finally`
  of the same function, in an `@AfterEach`, `@AfterAll`, `@After`, `@AfterClass` or `kotlin.test` `@AfterTest` function,
  in an `afterEach`, `afterAll`, `afterTest`, `afterSpec`, `close` or `tearDown` function or a Kotest `afterTest { }`,
  `afterEach { }`, `afterSpec { }` or `afterContainer { }` block of the class, or in a function of the class that one of
  those calls; `Dispatchers.resetMain()` and a `reset...`, `clear...` or `restore...` call on the same project type count
  too. A change inside one of those places is not reported, nor one in a `.use { }` block on the changed type or a
  restoring extension type (`Clock.frozen().use { }`), nor one under junit-pioneer `@RestoreSystemProperties`,
  `@DefaultLocale`, `@DefaultTimeZone` or `@StdIo`, next to a system-stubs `@SystemStub` or JUnit 4 `@Rule` field of the
  matching kind, with a Kotest `SystemPropertyTestListener`, `LocaleTestListener` or `TimeZoneTestListener`, or inside
  `withSystemProperty { }`, `withSystemProperties { }`, `captureStandardOut { }`, `restoreSystemProperties { }` or a
  system-stubs `execute { }`. Outside a test class (a helper object), a restore anywhere in the file counts. The scan
  reads text, so a restore in a superclass or another file is not followed.
- `ServerOrContainerPerTest`: a container, server or process started for each test, the Kotlin
  side of the Java rule. Reported: a property annotated `@Container` (Testcontainers) or
  `@RegisterExtension` holding a `WireMockExtension`, declared in a class body (not a companion
  object or `object`) of a class without `@TestInstance(PER_CLASS)`, a `@Rule` (or `@get:Rule`)
  property holding a container, a WireMock or OkHttp mock server, an `EmbeddedKafkaRule` or a
  `MockServerRule`, and a property of such a class that starts its value
  (`MockWebServer().apply { start() }`); a Kotest `ContainerExtension` in
  `ContainerLifecycleMode.Test`, `LifecycleMode.EveryTest` or a `perTest()` listener; a start in
  `@BeforeEach`, `@Before`, `@BeforeMethod`, an `override fun beforeTest`, `beforeEach` or
  `beforeAny`, a Kotest `beforeTest { }`, `beforeEach { }` or `beforeAny { }`, or a function of
  the class one of them calls, on an object made for each test; and the same start in two or
  more tests of a class. A start is `x.start()`, also at the end of a builder chain
  (`GenericContainer(...).withEnv(...).start()`) or inside `apply`, `also`, `let`, `run` or `use`
  on the object. The started types are matched through the imports: any Testcontainers class
  named `*Container`, WireMock, OkHttp `MockWebServer`, embedded Redis, Jetty, Tomcat and
  `ProcessBuilder`, a JDK `HttpServer.create`, and the calls `SpringApplication.run`,
  `runApplication`, `SpringApplicationBuilder(...).run`, `Runtime.getRuntime().exec`,
  `startClientAndServer` and Ktor's `embeddedServer(...).start`. An object made for each test is
  a new object, a local, a property the class's hook assigns, an instance property of a JUnit
  class without `PER_CLASS`, or a property that the class's `@AfterEach`, `@After`,
  `@AfterMethod` or Kotest `afterTest`/`afterEach`/`afterAny` stops; a start on a companion or
  Kotest spec property is left alone, since a second `start()` does nothing. The receiver is
  looked up as a local of the hook or test first, then as a property of its class, its companion
  object and the enclosing classes, so a same-named property of another class does not count.
  Two starts are the same when the statement, and the declaration of a local it starts, read the
  same apart from comments and spacing. A start in a helper that tests (not hooks) call is not
  followed.
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

## Spring rules

In a Spring project (Spring on the compile classpath) the rules of the Java preset's
`spring-ruleset.xml` that make sense in Kotlin run on the main Kotlin sources, with the same ids
(`pmd/SpringProxySelfCall`), the same allowed form written the Kotlin way, and the same exception route.
They live in `review-rules/spring/` and read the facts of [Review rules](review-rules.md): annotations
with their arguments, calls with their receiver, chain and scope, catch clauses, `return null`, and the
uses of an `@ExceptionHandler`'s exception.

| Area                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rules and the Kotlin forms they flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beans                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `SpringConstructorInjection` (`@Autowired`, `@Inject`, `@Resource` or `@Value` on a property, a `lateinit var` or a setter function, `@Autowired` on the only constructor or on a secondary constructor), `SpringImmutableBeans` (a `var` property or `var` constructor property of a stereotype bean or its `companion object`; `@PersistenceContext` is allowed), `SpringNoServiceLocator` (not in an `ApplicationContextInitializer` or `EnvironmentPostProcessor`, such as a bean-DSL initializer), `SpringNoLazyInjection`, `SpringStaticPostProcessorBean` (a `@Bean` function that returns a `BeanPostProcessor` or `BeanFactoryPostProcessor`, a Spring subtype or a project class extending one, or carries `@ConfigurationPropertiesBinding`, outside a `companion object`, without `@JvmStatic`, or with a parameter other than `Environment` or `ObjectProvider`; `ApplicationContext` and `BeanFactory` parameters pass too, `@Lazy` and `@Value` ones are left to `SpringNoLazyInjection` and `SpringTypedConfiguration`, and beans registered through the `beans { }` DSL are not `@Bean` functions and are not checked), `SpringOrderedProvider` (`stream()`, `iterator()`, `spliterator()`, `forEach`, `forEachIndexed`, `onEach`, `map`, `mapNotNull`, `flatMap`, `filter`, `fold`, `toList`, `toSet` or `asSequence` on an `ObjectProvider`, or a `for` loop over one), `SpringLiteConfiguration`, `SpringNoComponentScan`, `SpringBeanCollectionState` (a `val` holding `HashMap()`, `mutableMapOf()`, `mutableListOf()`, ... of a singleton bean or its `companion object` changed outside startup and outside `synchronized`, `withLock`, `lock()` or `@Synchronized`, also through `map[key] = value`, `+=`, `cache.apply { put(k, v) }`, `with(cache) { ... }` and `cache.also { it.add(k) }`; a local or parameter of the same name is not the property), `SpringHttpClientPerCall`, `SpringHttpClientTimeouts` (an `apply { setConnectTimeout(...) }` on the construction's own chain, or a setter on its variable in the same function, counts as configured; a qualified `org.springframework.web.client.RestTemplate()` is a construction too), `SpringNoPostConstructIo` (repository, `EntityManager`, JDBC or HTTP calls in `@PostConstruct`, `afterPropertiesSet`, a `@Bean(initMethod = ...)` function, or a private helper only they call) |
| Lifecycle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `SpringUnreleasedResource` (a property of a stereotype, `@Configuration`, `@SpringBootApplication` or `@AutoConfiguration` class that the class assigns `Executors.new*()`, a `ThreadPoolExecutor`, `ScheduledThreadPoolExecutor`, `ForkJoinPool`, `Timer`, a started `Thread`, a Netty event loop group, a Kafka client or `AdminClient.create`, `MongoClients.create`, Apache `HttpClients.createDefault`, `DriverManager.getConnection`, a `HikariDataSource`, a Spring `ThreadPoolTaskExecutor` or `ThreadPoolTaskScheduler`, a `CoroutineScope(...)`, `MainScope()` or `newFixedThreadPoolContext`, or a call that wraps one of these, with no `@PreDestroy`, `DisposableBean.destroy`, `AutoCloseable.close`, `Lifecycle.stop`, `ContextClosedEvent` listener or `@Bean(destroyMethod = ...)` function that releases it, where a call on the property or on one of its members (`scope.coroutineContext.cancelChildren()`) or with it as an argument inside that function counts as a release; a `by lazy` property is not checked; Kotlin has no resolved types here, so the owned types are this list rather than every `AutoCloseable`), `SpringStartupCleanup` (as in Java, with Netty's own event loop group classes, `DefaultEventExecutorGroup` and `Timer` as the types that start threads, in the constructor and `init` blocks, `@PostConstruct`, `afterPropertiesSet`, `ApplicationRunner.run`, `Lifecycle.start`, a `@Bean` `initMethod` and the private helpers only they call; a `try` whose `catch` or `finally` calls a release or whose `catch` does not rethrow passes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `SpringTypedConfiguration` (`@Value` outside `@Configuration` classes, `System.getProperty` of application keys outside `@Configuration`, `@SpringBootApplication`, `EnvironmentPostProcessor`, `ApplicationContextInitializer` and `main`, `Environment.getProperty`, `env["key"]` and `context.environment.getProperty` in beans), `SpringValueSecretDefault` (also `getProperty(key) ?: "default"` and a string-literal default of a secret-named constructor property of a `@ConfigurationProperties` class), `SpringProfileOnConfiguration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Proxies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `SpringProxyMethodVisibility` (a proxied function that is `private`, `protected`, `final`, in an `object` or `companion object`, or in a class the compiler leaves final; proxied means the annotations of the Java preset's proxy rules, a project annotation meta-annotated with one of the Spring or JSR-250 ones (up to three levels), an annotation an `@Aspect` class names in `@annotation(...)`, and a function of a `@Validated` class with a constraint or `@Valid` on a parameter, a type argument or the function, private functions, functions of objects and getters aside; only annotations and aspects declared in Kotlin are read, and a project that weaves its aspects with AspectJ lifts the rule with an exception), `SpringProxySelfCall` (also `this::name` references and calls that leave out default arguments or pass several varargs; a call inside `other.run { }`, `with(other) { }` or `other.apply { }` goes to `other`), `SpringTransactionalAnnotation`, `SpringNoTransactionalController`, `SpringNoRequiresNew`, `SpringNoSwallowedTransactionException` (a broad or persistence `catch` (Spring `dao`, `transaction`, `orm` and `jdbc`, JPA and Hibernate exceptions) without a throw, or `runCatching` without a later `getOrThrow()` or a `getOrElse`, `onFailure`, `fold`, `recover` or `recoverCatching` whose lambda throws, in a `@Transactional` function or a private helper only it calls; `throw`, `error(...)`, `TODO(...)` and a call to a project function declared `: Nothing` all throw), `SpringTransactionalCheckedRollback` (`@Throws` of a checked exception, or an uncaught `throw` of one in the function, also a project exception extending one, without `rollbackFor`), `SpringTransactionalReadOnlyWrite`, `SpringAsyncExecutor` (also an expression body such as `= CompletableFuture.completedFuture(id)`), `SpringScheduledFixedDelay`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Web                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `SpringComposedMapping`, `SpringRestController`, `SpringValidRequestBody`, `SpringTypedResponse` (`Any`, `JsonNode`, `Map<String, Any>`, `ResponseEntity<*>`, a list, `Optional`, `Mono` or `Flux` of those, or `null`; without a declared return type, an expression body such as `= mapOf<String, Any>(...)` or one that returns a parameter gives the type), `SpringTypedRequestBody`, `SpringNoErrorLeak` (the stack trace, or the `message`, `localizedMessage` or `toString()` of a generic, JDK or persistence exception or its cause, in a template, concatenation or argument of the response, also through a local `val` and under an aliased `@ExceptionHandler` import; logging it is fine), `SpringNoCrossOrigin`, `SpringCorsWildcard`, `SpringPasswordEncoder`, `SpringPermitAllAnyRequest` (also `authorize(anyRequest, permitAll)` in the Kotlin DSL), `SpringCsrfDisabled` (also `csrf { disable() }`), `SpringHardcodedUser` (also a password held in a local `val` or a property with a string literal)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| JPA                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `JpaLazyFetching`, `JpaEntityClass` (a `data class` entity, or a final one: a class neither `open` nor opened by the all-open plugin, checked only when the build reports the plugin's options), `JpaManyToManyCascade`, `JpaManyToManySet` (a `List`, `MutableList`, `LinkedList` or `Collection` without `@OrderColumn`, also written fully qualified), `JpaVersion` (an entity without a superclass, or a class with its own `@Id`, and no `@Version`), `JpaSequenceIds`, `JpaEnumString` (a property of an enum declared in the project (nested enums and Java enums under the Java source roots included, also nested in a Java class) or a JDK enum, without `@Enumerated(EnumType.STRING)`, also in an `@ElementCollection` and as map keys; the type may be inferred from the initializer (`= Status.NEW`, `mutableSetOf<Status>()`); an auto-applied `AttributeConverter` exempts its type, whether declared in Kotlin (`@Converter(autoApply = true)` or `@Converter(true)`, directly or through project base classes, generic or not, whose type parameters are followed to the converted type) or in Java under the Java source roots; a computed property with a getter and no backing field, a delegated one or an abstract one is not a column; enums of other libraries, such as `HttpStatus`, are not known and are not checked), `JpaIdentityHashCode` (a `hashCode` reading the `@GeneratedValue` property, or a `data class` entity with a generated id in its constructor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Spring Data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `SpringDataDerivedQuery`, `SpringDataNativeQuery` (also `EntityManager.createNativeQuery`; `@Suppress("PMD.SpringDataNativeQuery")` on the function or class allows it), `SpringDataModifyingQuery`, `SpringDataWriteWithoutTransaction` (a declared `@Modifying` function or a derived delete on a `JpaRepository` without `@Transactional` on it or the interface), `SpringDataNamedParameters`, `SpringDataQueryTextBlock` (any `+` or `.plus(...)` in `@Query` outside string literals, `const val` names joined too, or a `$name` or `${...}` template inside one; an escaped `${'$'}` or `\$` is a literal dollar), `SpringDataNoSaveInLoop`, `SpringDataBatchOfOne` (`saveAll(listOf(x))` in a loop, also `listOf<T>(x)`, `java.util.List.of(x)`, `Collections.singletonList(x)`, `setOf(x)` and the like, or a local of the loop body holding one and never added to; the list may pass through `filter`, `map`,                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `toList` and the like or an `as` cast, and a fresh `mutableListOf()`, `ArrayList()` or similar given exactly one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `add(x)` or `+= x` of a single element in the loop body counts too), `SpringDataRowWriteInLoop`, `SpringDataSaveInLoopHelper` (also `forEach(this::helper)`, calls that leave out default arguments or pass several varargs, member-extension helpers, companion-object helpers and top-level helpers of the file; an overload whose parameter takes the collection passed is a batch; a parameter typed `Any`, `Serializable` or a type parameter (unbounded or bounded by a collection) takes it too), `SpringDataNoFlush`, `SpringDataFilterInQuery` (`findAll()` followed by `filter`, `count`, `any`, `first`, `find`, `size`, `isEmpty` and the like, the `Flux` forms `hasElements`, `next`, `take`, `elementAt` and `filterWhen`, or by `stream()`, `asSequence()`, `toList()` or `collectList()` (then `block()`, `awaitSingle()` or `awaitFirst()` allowed) and a filter, on blocking, reactive and coroutine repositories; a local holding the result is not followed, because the facts do not list every read of it) |

Kotlin-specific choices:

- Finality. Kotlin classes and functions are final unless `open`, and Spring cannot subclass a final
  class to proxy it. The build tells which classes the compiler opens: the init script reads the
  `allopen` options of `compileKotlin`, and on Maven nitpicker reads the `kotlin-maven-plugin`
  configuration of the module (`<compilerPlugins><plugin>spring</plugin>` and `all-open:annotation=`
  or `all-open:preset=` in `<pluginOptions>`; a Maven module always reports them)
  (`kotlin("plugin.spring")` is the `spring` preset, which opens
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
  interfaces read from the Java source roots. The JPA, MongoDB, Cassandra, Neo4j, Couchbase,
  Elasticsearch, key-value, revision and `JpaRepositoryImplementation` interfaces are listed; any other
  library interface named `org.springframework.data.<store>.<...>Repository` counts as well when the name
  is imported by name or written in full; a name that only a star import could supply is not guessed
  (a project `AuditRepository` next to `import org.springframework.data.domain.*` is a plain class). A Hibernate
  `Session` is an entity manager like `EntityManager`.
- Call types. Locals and receivers are typed through calls: `chunked`, `windowed`, `groupBy`, `partition`,
  `toList`, `toSet`, `withIndex`, `zip`, `associate*`, `mapValues`, `map` and similar collection calls,
  `Lists.partition`, `Iterables.partition` and `ListUtils.partition`, collection factories (`listOf`,
  `arrayListOf`, `mutableMapOf<K, V>()`, ...), constructors, the project's own functions with a declared
  return type (also inherited ones) and derived `findAll*` repository queries. The element of a `map`,
  `mapNotNull`, `flatMap`, `zip { a, _ -> ... }`, `associateWith` or two-lambda `associateBy` result is the
  type of the lambda's last expression when that is the parameter or a property chain on it
  (`items.map { it.tags }` is a `List` of the `tags` type), and `Any` otherwise. Map entries (`entry.value`,
  `(key, values)`), `Pair` and `Triple` components, `IndexedValue` and `Page`/`Slice` `content` follow.
- One finding per site: `kotlin-source/HttpWithoutTimeout` is dropped where `SpringHttpClientTimeouts` or
  `SpringHttpClientPerCall` reports the same line, since the Spring message names the Spring form. A
  Spring finding lifted by an exception does not drop it.
- `ProcessWaitWithoutTimeout` is a text scan (the Java preset's `pmd/ProcessWaitWithoutTimeout` matches by type): a
  `.waitFor()` call without arguments on any receiver counts, since `Process` is the class that declares it; a
  project's own `fun waitFor()` called without a receiver does not. A program whose purpose is to run a child to
  completion (a build wrapper) takes an exception.
- Exceptions for `pmd/SpringQueryConcatenation` are accepted, since PMD still checks the Java sources of
  a mixed project with it.
- `System.getenv` is not part of `SpringTypedConfiguration` here: detekt's `ForbiddenMethodCall`
  already bans it outside the composition root (see [One-way rules](one-way-rules.md)).
- Loops. A call is in a loop inside a `for`, `while` or `do` body, a `forEach`, `forEachIndexed`, `onEach`
  or `repeat` lambda, or a `map`, `flatMap`, `mapNotNull`, `associate*` lambda on a value whose declared type
  is a collection, sequence, array, map or stream (or a `listOf(...)` or a range). The value may be a
  property chain (`batch.items`, `byId.values`) or a call chain whose head is one
  (`items.filter { ... }.map { ... }`, `items.asSequence().map { ... }`). `map` on a `Mono`,
  `Optional` or a value of unknown type is not a loop. A `for` or `while` body that also calls
  `EntityManager.clear()` is a batch and is not flagged, as in the Java rules; so is an iterating lambda
  that calls it. Only the nearest loop counts: a `flush` in an inner loop whose outer loop clears is still
  reported. Whether `clear()` runs every so many items or on every item is not checked. `mapTo`, `mapIndexed*`, `flatMapTo`, `associate*To`, `mapValues` and `mapKeys` lambdas
  are loops too, and so is an anonymous function (`forEach(fun(item) { ... })`). Another repository call
  without a write verb (`SpringDataRowWriteInLoop`) counts when its value is dropped: a statement of its
  own, the branch of an `if` or `when` used as a statement (braced or not), the left side of an elvis whose
  right side jumps (`?: return@forEach`), a `return@label` value, or the last expression of a lambda whose
  value is dropped in turn (`let`, `run`, `with`, `also`, `apply`, `executeWithoutResult`, `runCatching`, a
  project helper returning `Unit`, ...). The last expression of a `map`-like lambda is a value the loop
  keeps (`val shipped = items.map { repository.ship(it.id) }`), as in the Java rules, unless the `map`
  result itself is dropped. A read chained into another call (`repository.byStatus(s).forEach { ... }`) is
  not a write. A scope function on a repository (`repository.apply { ... }`, `let`, `run`, `also`, `with`)
  is not a call itself, the calls inside it are. Method references
  (`items.forEach(repository::save)`, `items.forEach(this.repository::save)`, a local
  `val drop = repository::delete`) count as calls in the loop when an iterating call (`forEach`, `map`, ...)
  or a `let`, `also`, `run`, `apply`, `takeIf` or `takeUnless` inside the loop takes them, and not when the elements are themselves collections
  (`ids.chunked(n).forEach(repository::deleteAllById)`).
  `executeUpdate()` on a query held in a local, or built with `createNamedQuery`, `setLockMode` or
  `setMaxResults`, is a row write. It is a batch only when the query binds a collection to the parameter of
  an `in :ids` or `= any(:ids)` clause (`setParameter("ids", chunk)`, also on a query held in a local and
  bound in separate statements, or with the text in a `const val`) and binds no loop variable besides; a
  one-element collection (`setOf(id)`) or another collection parameter is not a chunk.
  A repository receiver may be a local copy (`val r = repository`) or the extended type of an extension
  function (`fun OrderRepository.saveEach(...)`). A member-extension helper is called only on a receiver
  of its own type, so `file.delete()` in a loop is not the `Order.delete()` helper.
- Set-based writes. A repository call in a loop that passes a collection as its first argument, or passes
  one and no loop variable, is one statement per batch, not a row write (`retain(id, kept)` still writes
  one row per `id`), and a one-element collection (`setOf(id)`) does not count. Collections: a parameter
  of a `chunked(n)` or `windowed(...)` lambda or `for` loop, a lambda parameter declared as a collection, a destructured map value (`groups.forEach { (_, ids) -> ... }`,
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
