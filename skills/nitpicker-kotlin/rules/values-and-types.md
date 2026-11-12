# Values, types and data

Part of the [nitpicker-kotlin](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Scope functions: `let` for null (`value?.let { ... }`) and `apply` to configure an object you just
  created. No `run`, `with` or `also`, and no `let` or `apply` where a direct call works.
- Casts: no `as`, in tests too. Use an `is` check or `when` (smart cast), `as?` with the null handled, or
  `assertIs<T>(value)` in a test; a read-only `List` is copied with `toMutableList()`, not cast.
- Null: no `!!`, no `as String` on a nullable. Use `value ?: return`, `?.let`, or
  `checkNotNull(value) { "why" }` when null is a bug; `x?.let { ... }`, not `if (x == null) null else ...`.
- Records: a class that only holds data is a `data class` with `val`s; change a copy with `copy(...)`.
  A class with `var`s is not flagged, nor a JPA or Spring Data entity; the project adds other
  annotations to `UseDataClass`'s `excludeAnnotatedClasses` in its `detekt.yml`.
- Signatures: a value with three states is an `enum class`, not a `Boolean?` parameter, return
  type or property (`kotlin-source/TriStateBoolean`; a property or parameter a framework fills,
  such as `@Column`, `@JsonProperty`, `@SerialName` or an `@Entity` property, is exempt); a public
  function returns a new collection instead of changing a `MutableList`, `MutableMap` or array
  parameter (`items.add`, `table[key] = v`, `counts[0]++`, also through `val alias = items`;
  `kotlin-source/ParameterMutation`; private and local functions are exempt). When code moves,
  change every caller and delete the old name: no `@Deprecated` delegate or `typealias Old = New`
  (`kotlin-source/CompatibilityShim`). Time comes from an injected `Clock`; `Calendar`, `Date` and
  `SimpleDateFormat` are banned, and so are `now()` on the `java.time` types without a clock or
  zone, `ZoneId.systemDefault()`, `TimeZone.getDefault()` and `TimeZone.currentSystemDefault()`
  (`kotlin-source/DefaultTimeZone`); `Calendar`, `GregorianCalendar` and `SimpleDateFormat` need a
  zone (`kotlin-source/LegacyCalendarApi`).
- Time units: name a time value with its unit (`timeoutMillis`, `ttlSeconds`) and let it meet only the same
  unit: convert once where it enters (`TimeUnit.SECONDS.toMillis(ttlSeconds)`, `ttlSeconds.seconds`), pass
  milliseconds to `delay` and `Thread.sleep`, and keep epoch times in a `Long` or an `Instant`, never
  `.toInt()` (`kotlin-source/TimeUnitMismatch`).
- A public top-level, `object` or companion function, or a private or `internal` function or
  constructor, does not declare a default parameter that no call sets (`unused-option`): remove the
  parameter, or pass it from a real call. Tests count only for private and `internal` declarations
  and published modules.
- URIs from runtime text: build them with an encoding builder (`UriComponentsBuilder` with
  `encode()`, `URI(scheme, host, path, fragment)`), or parse where the failure is handled
  (`runCatching { URI.create(text) }`, a `try` that catches `IllegalArgumentException`);
  `URI.create(text)` and `URI(text)` on a non-constant string are flagged
  (`kotlin-source/UriCreateDynamic`).
- Regexes: escape a runtime value before it goes into a pattern (`Regex.escape(name)`), pass a
  whole pattern to `Regex(pattern)` on its own, and use the plain-text `replace`, `split` and
  `contains` for text without metacharacters (`kotlin-source/UnquotedRegexValue`,
  `kotlin-source/PlainTextRegex`).
  Every part of a literal pattern must change what it matches (`Regex("a|b|a")`, `"[\\w_]"` and
  `"x{1}"` are `kotlin-source/RegexPartDefect`), and nested quantifiers such as `"(\\s*\\w+)*x"` are
  `kotlin-source/BacktrackingRegex`.
- Enums: to sort the entries of one of your enums into two groups, classify every entry with a
  `when` without `else` (adding an entry then fails to compile), or a `Boolean` each entry
  declares. Not `s == PAID || s == SHIPPED`, `s in setOf(PAID, SHIPPED)` or a `when` with
  `else -> false` (`pmd/ExhaustiveEnumPredicate`).
- Operands: no copied operand (`kotlin-source/OperandSlip`). Not `a == a`, `x - x` or `a and a`
  (a NaN test on a `Double` is `x.isNaN()`), the same operand twice in one `&&`/`||` chain, comparisons of
  one value that contradict or repeat each other (`x < 3 && x > 5`, `x > 5 && x > 3`), `x * 0`, or
  `a += a + b`. Tests may apply an operator to one value twice to exercise it.
- No top-level or `object` function that only passes its parameters, in order, to another function
  with the same parameters (`pmd/StaticForwardingWrapper`); call that function. Factories named
  `of` or `from` are fine. The same goes for a member that only passes its parameters to another
  member of its class (`pmd/ForwardingMethodAlias`); when that member is less visible, rename it to the alias's name and delete the alias.
- Blocking calls (`Files.readString`, `File.readText`, JDBC, `Future.get()`, `latch.await()`,
  `queue.take()`, `Mono.block()`) in a `suspend` function, coroutine builder or `flow { }` go through
  `withContext(ioDispatcher) { ... }` (or `flowOn(ioDispatcher)`), or `runInterruptible(ioDispatcher) { ... }`
  for an interruptible one, with the `CoroutineDispatcher` injected through the constructor, never
  `Dispatchers.IO` at the call site (detekt `InjectDispatcher`); `withContext(NonCancellable)` does not
  move the call (`kotlin-source/BlockingCallInCoroutine`). A `withTimeout` block needs a suspension point:
  `withTimeout(1.seconds) { blocking() }` never times out, so offload the blocking call inside it
  (`kotlin-source/TimeoutWithoutSuspension`).
- A data class, a `@ConfigurationProperties` class, the public properties of any class and the
  defaulted parameters of a public function have `tags` or `tag`, not both
  (`pmd/SingularAndPluralMember`); one item is a one-element list.
- Do not update a `var` property of the class or file from a value read before a suspend call of
  the same function (`total += repository.fetch()`, or `val current = total` before the call and
  `total = current + delta` after it): call the suspend function into a local first and then
  update the property, or hold one shared `Mutex` (a property, not a local) around the whole
  read-modify-write; a `launch` inside the lock does not hold it
  (`pmd/NonAtomicUpdateAcrossSuspension`).
- Take a dependency as a constructor parameter; never look it up where it is used with Koin
  `get()`/`inject()`, a Guice `Injector`, `CDI.current()` or JNDI (`pmd/ServiceLocatorLookup`). With
  Koin, pass it as a constructor parameter in the module definition (`single { Orders(get()) }`), and
  take a `Lazy<T>` or a function type for a deferred lookup. Compose and Android: a
  `koinViewModel()` or `koinInject()` default parameter value and Android components (Activity,
  Fragment, Service, BroadcastReceiver, ContentProvider, Application) are fine. Only `main`, Koin
  definitions and functions taking a Koin `Scope`, a Guice `Module`'s `configure`,
  `@Provides`/`@Produces` functions and `@Bean` functions of a `@Configuration` class look
  dependencies up.
- Test a `String?` configuration property (a `@ConfigurationProperties` class, `@Value`) with
  `isNullOrBlank()`, not only `!= null`, `?.let` or `?:`: an empty property binds as `""`, which those
  count as set (`pmd/SpringNullOnlyConfigCheck`). Default it with `props.x?.ifBlank { null } ?: fallback`.
- The lambda passed to `computeIfAbsent`, `compute`, `computeIfPresent`, `merge`, or `getOrPut`
  on a `ConcurrentMap`, never changes the same map, not even from a callback it starts
  (`pmd/RecursiveMapUpdate`). Attach the cleanup to the result:
  `map.computeIfAbsent(key) { start(it) }.whenComplete { r, _ -> map.remove(key, r) }`.
- A data class keeps a back reference (a child's `parent`, a line's `order`) out of its primary
  constructor, as a body property, so the generated `toString`, `equals` and `hashCode` do not
  recurse (`pmd/GeneratedMemberCycle`). A data class does not extend a class with state it leaves
  out of `equals`: declare those properties `abstract` and override them in the primary constructor
  (`pmd/GeneratedEqualsSkipsSuperclass`).
- A validation annotation on a constructor property takes the field target:
  `data class OrderRequest(@field:NotBlank val item: String)`, not `@NotBlank val item`, which
  lands on the constructor parameter where `@Valid` never looks (`pmd/ValidationAnnotationTarget`).
- Pick the cheaper collection form: a `mutableSetOf()` for items you test with `in` while you
  collect them (`kotlin-source/ListUsedAsSet`), a map built once with `associateBy` before a loop
  instead of `find { it.key == key }` in it (`kotlin-source/LinearLookupInLoop`), and `minBy`/`maxBy`
  instead of `sortedBy { ... }.first()` (`kotlin-source/SortForExtreme`).
- A `Stream` returned by a repository function is handled row by row in `forEach`, flushing a
  fixed-size batch there, never collected with `toList()` or `collect` (`pmd/StreamedRowsCollected`).
