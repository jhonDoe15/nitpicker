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
- HTTP text is case-insensitive and structured headers are parsed: lowercase a header value, URI scheme or
  host, cookie name or file extension (`lowercase()`, `equals(x, ignoreCase = true)`) before comparing it, and
  parse `Content-Type`, `Accept` and cookies with `MediaType.parseMediaType`, `ContentDisposition.parse` or
  `HttpCookie.parse` instead of `split(",")` or `split(";")` (`kotlin-source/HttpValueCase`,
  `kotlin-source/HandSplitHttpHeader`). A library that is itself the parser takes an exception.
- Split `key:value` text once: `text.split(":", limit = 2)`, or `substringBefore` with `substringAfter`, not
  `text.split(":")[1]` or `val (key, value) = text.split(":")`, which drop what follows the second separator
  (`kotlin-source/PairSplitDropsRest`).
- Read a host and port with `URI("http://$host")` (`host`, `port`), not `host.split(":")` or
  `substringBefore(":")`: an IPv6 literal `[::1]:3000` has colons of its own (`kotlin-source/HostPortColonSplit`).
- Split file text with `lines()` or `readLines()`, not `split("\n")`: a CRLF file keeps a `\r` on each line
  (`kotlin-source/NewlineOnlyLineSplit`).
- Truncate text after a `Character.isHighSurrogate` check (or by code point), not `text.take(max)`, which can
  split an emoji (`kotlin-source/SurrogateSplittingCut`).
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
  (`kotlin-source/UriCreateDynamic`). `URLDecoder.decode(text, charset)` throws the same exception on a stray `%`:
  catch it too.
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
- Skip a collection step whose result is thrown away: `flatMap { }` instead of `map { }.flatten()`,
  and `size` or `isEmpty()` on the source instead of on a `toList()` copy
  (`kotlin-source/RedundantStreamStep`); `any { }` instead of `find { } != null` and `filter { }`
  before `first()` or `count()` are detekt's.
- A `java.util.stream.Collectors` `toMap` value function or `groupingBy` classifier that can be `null`
  throws: use `associate` or `groupBy`, or filter or map the nulls first
  (`kotlin-source/NullMapValue`).
- A `Stream` returned by a repository function is handled row by row in `forEach`, flushing a
  fixed-size batch there, never collected with `toList()` or `collect` (`pmd/StreamedRowsCollected`).
- A value put into an HTML string is escaped first (`HtmlUtils.htmlEscape`, `Encode.forHtml`) or the page is built
  with `kotlinx.html` (`pmd/UnescapedHtmlValue`).
- A replacement that comes from data goes through `Regex.escapeReplacement(value)`, or use the lambda overload
  `regex.replace(text) { value }`, or `String.replace(String, String)` (`pmd/ExpandingReplacement`): the
  replacement reads `$1` and `\\`.
- A glob or pattern turned into a `Regex` or a `LIKE` pattern with `replace` calls is escaped for the target
  first (`pmd/PatternTranslation`): `Regex.escape(glob).replace("*", ".*")`, never the raw value; for `LIKE`
  escape `%`, `_` and the escape character, then map the wildcards.
- A "no limit" maximum is never added to anything (`pmd/MaxValueOverflow`): `startPos + width` with a
  `width` that is `Int.MAX_VALUE`, a constant of it, a parameter that defaults to it or a caller passes it,
  overflows to a negative index or bound. Compare without adding (`width >= length - start`), widen first
  (`start.toLong() + width`), use `Math.addExact`, or check the sentinel before the arithmetic.
- A JDK `HttpClient` or OkHttp response is checked (`statusCode()`, `isSuccessful`) before its body is decoded as JSON
  (`pmd/UncheckedResponseBody`): a proxy error page is not JSON, and the parse error hides the status.
- A parsed double is checked with `x.isFinite()`, not only `x.isNaN()`: `"Infinity"` and `"1e999"` parse to an
  infinity that `isNaN` lets through (`pmd/NanOnlyGuard`).
- A count that is a subtraction is clamped before `take`, `takeLast`, `drop`, `dropLast`, `repeat` or `List(n)`:
  `list.takeLast((a.size - b.size).coerceAtLeast(0))`; a negative count throws (`pmd/NegativeCountArgument`).
- A bounds check before `get(index)` or `list[index]` rejects with `index >= size`: `index > size` lets `index == size`
  through to an `IndexOutOfBoundsException` (`pmd/IndexBoundOffByOne`); `>` is right only for an insertion position.
- A backoff delay does not grow by `1L shl attempt` without a bound: cap the exponent (`Math.min(attempt, 20)`); the shift
  wraps and the delay turns negative (`pmd/BackoffShiftOverflow`).
- A duration or a timeout is measured with a monotonic clock, not two wall-clock reads: read
  `System.nanoTime()` or `TimeSource.Monotonic.markNow()` instead of subtracting two `Instant.now()` or
  `System.currentTimeMillis()` readings (`pmd/WallClockElapsed`).
- A path, route, package or host is matched on whole segments, never by `String` prefix
  (`pmd/AffixWithoutBoundary`): `path == base || path.startsWith("$base/")`, `Path.startsWith`,
  `host == domain || host.endsWith(".$domain")`, and `URI.getHost()` for a URL.
- A suffix or prefix is removed with `removeSuffix` or `removePrefix`, never `replace` (`pmd/AffixRemovedByReplace`),
  because `replace` also hits `blog.git.io`.
- A key lower-cased or upper-cased for a lookup is looked up in a collection normalized the same way (`pmd/CaseMismatchedLookup`): build the set from `values.map { it.lowercase() }`, or use a case-insensitive collection;
  a map filled with `name.lowercase()` is read with it too.
- A precondition message names the value it checks (`pmd/PreconditionMessageNamesOtherValue`): the check on `timeToLive`
  says so, and the unit gets its own check and message.
- SQL built from parts reads as one valid statement once joined (`pmd/MalformedQueryText`): a `?` after every `LIKE` and
  `=`, as many values as columns in an `INSERT`, and a space at the start of every appended fragment.
- An object-store or search listing follows its pages (`pmd/UnpagedListing`): `listObjectsV2Paginator(request)` or a loop on
  `isTruncated()` and `nextContinuationToken()`, and a RediSearch query sets `limit(offset, count)` and loops.
