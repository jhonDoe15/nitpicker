# Values, types and data

Part of the [nitpicker-java](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Text: `"a".equals(x)` or `a.equals(b)`, never `==` on strings or other objects. Pass a charset and
  a locale: `s.getBytes(StandardCharsets.UTF_8)`, `s.toUpperCase(Locale.ROOT)`.
- Strings, arrays and files: no field initializer that repeats the default (`= 0`, `= null`,
  `= false`). Append one character as a char (`append('x')`) and chain appends
  (`sb.append(a).append(b)`). Write `i + "x"`, not `"" + i + "x"`; `String.valueOf(i)` only when
  nothing else is concatenated. Build loop output in a local `StringBuilder`. Copy arrays with
  `System.arraycopy`, and an array into a collection with `Collections.addAll(target, array)`. Open
  files with `Files.newInputStream` or `Files.newBufferedReader`, not `FileInputStream`.
- Null: a method returning a collection returns an empty one (`List.of()`), never `null`. Any
  other value that may be absent is declared `@Nullable` (the project's annotation, JSpecify's
  `org.jspecify.annotations.Nullable` if it has none) and checked before use. Never assign `null`
  (`out = null`); restructure instead.
- Spring `Assert.notNull` checks for null, nothing else (`pmd/AssertNotNullWrongCheck`): test a condition with
  `Assert.isTrue(count >= 0, "...")`, and check a `String`, collection or map that must not be empty with
  `Assert.hasText`, `hasLength` or `notEmpty`. `Assert.notNull(count >= 0, ...)`, `Assert.notNull(longValue, ...)`
  and `Assert.notNull(name, "name must not be empty")` always pass.
- Types: declare interfaces (`List<String> out = new ArrayList<>()`, not `ArrayList<String> out`).
- Mutable state: don't return or store a caller's array or collection directly. Return
  `data.clone()` or `List.copyOf(items)`, and copy in the constructor.
- Signatures: a public method does not branch on a `boolean` parameter (`pmd/BooleanFlagParameter`):
  write two methods or take an enum. A value with three states is an `enum`, not a boxed `Boolean` parameter, field,
  return type or record component (`pmd/TriStateBoolean`; a field or parameter that a framework
  fills, such as `@RequestParam`, `@JsonProperty` or an `@Entity` field, is exempt); a public
  method returns a new collection or array instead of changing a parameter (`items.add`,
  `Arrays.sort(names)`, `counts[0] = 0`, also through `this.items = items`;
  `pmd/ParameterMutation`; private helpers and queues shared between threads are exempt). When code
  moves, change every caller and delete the old name: no `@Deprecated` delegate
  (`pmd/CompatibilityShim`; a Javadoc `@deprecated` without the annotation is no way around it).
  Time comes from `java.time` with a `Clock` or a zone; `Calendar.getInstance()`,
  `new GregorianCalendar()` and `new SimpleDateFormat(...)` without a time zone are flagged
  (`pmd/LegacyCalendarApi`), and so are `ZoneId.systemDefault()` and `TimeZone.getDefault()`
  (`pmd/DefaultTimeZone`).
- HTTP text is case-insensitive and structured headers are parsed: lowercase a header value, URI scheme or
  host, cookie name or file extension before comparing it (`toLowerCase(Locale.ROOT)`, `equalsIgnoreCase`) and
  parse `Content-Type`, `Accept` and cookies with `MediaType.parseMediaType`, `MediaType.parseMediaTypes`,
  `ContentDisposition.parse` or `HttpCookie.parse` instead of `split(",")` or `split(";")`
  (`pmd/HttpValueCase`, `pmd/HandSplitHttpHeader`). `getHeader` and `HttpHeaders` ignore the case of the
  name; a library that is itself the parser takes an exception.
- Split `key:value` text once: `text.split(":", 2)` with a length check, or `indexOf(':')` with `substring`, not
  `text.split(":")[1]`, which drops what follows the second separator and throws when there is none
  (`pmd/PairSplitDropsRest`).
- A `Map` or `Set` key made of several strings is a record or `List.of(a, b)`, not `a + "-" + b`: different
  pairs (`"a-b"` with `"c"`, `"a"` with `"b-c"`) give the same key (`pmd/DelimitedLookupKey`).
- Read a host and port with `URI` (`new URI("http://" + host)`, `getHost()`, `getPort()`) or Guava `HostAndPort`,
  not `host.split(":")`: an IPv6 literal `[::1]:3000` has colons of its own (`pmd/HostPortColonSplit`).
- Split file text with `lines()`, `split("\\R")` or a `BufferedReader`, not `split("\n")`: a CRLF file keeps a
  `\r` on each line (`pmd/NewlineOnlyLineSplit`).
- Truncate text after `Character.isHighSurrogate(text.charAt(end - 1))` (then `end--`), or by code point, not
  `text.substring(0, max)`, which can split an emoji (`pmd/SurrogateSplittingCut`).
- Library getters that answer `null` are checked before use: `request.getQueryString()`, `getHeader(name)`,
  `getParameter(name)`, `getPathInfo()`, `getSession(false)` and
  `Package.getImplementationVersion()`. Compare with `null`, or fall back with
  `Objects.requireNonNullElse(request.getParameter("page"), "1")` (`pmd/NullableLibraryResult`).
- Time units: name a time value with its unit (`timeoutMillis`, `ttlSeconds`) and let it meet only the same
  unit: convert once where it enters (`TimeUnit.SECONDS.toMillis(ttlSeconds)`, `Duration.ofSeconds(s).toMillis()`)
  and pass a `TimeUnit` that matches the value (`pmd/MixedTimeUnits`). Keep epoch times in a `long` or an
  `Instant`, never `(int) (System.currentTimeMillis() / 1000)` (`pmd/EpochNarrowedToInt`).
- Widen before you multiply: `System.currentTimeMillis() + ttlSeconds * 1000L`, `(long) hour * 60`,
  `TimeUnit.SECONDS.toMillis(ttlSeconds)` or `Math.multiplyExact`; an `int` product added to a `long` has
  already overflowed (`pmd/IntProductWidenedLate`).
- Ask the subtype question from the right side before casting to `Foo`: `Foo.class.isAssignableFrom(type)`
  (`ClassUtils.isAssignable(Foo.class, type)`) or `value instanceof Foo`; `type.isAssignableFrom(Foo.class)`
  accepts only `Foo` and its supertypes (`pmd/ReversedAssignableCheck`).
- Do not cast a value from a `Map<String, Object>` or `Properties` read from JDBC, YAML or JSON straight to a number
  or date: use `((Number) row.get("count")).intValue()`, `Integer.parseInt(String.valueOf(value))`,
  `rs.getObject(column, LocalDate.class)` or a typed binding (`pmd/MapValueCastToNumber`).
- Use `getName()` (or `getTypeName()`) for keys, builders and messages: `getCanonicalName()` is `null` for anonymous and
  local classes and lambdas; when the dotted source name is needed, fall back with
  `name != null ? name : type.getName()` (`pmd/CanonicalNameMayBeNull`).
- URIs from runtime text: build them with an encoding builder
  (`UriComponentsBuilder...encode().build().toUri()`, `new URI(scheme, host, path, fragment)`), or
  parse where the failure is handled (`URI.create(text)` in a `try` that catches
  `IllegalArgumentException`); `URI.create` on a non-constant string is flagged
  (`pmd/UriCreateDynamic`). `URLDecoder.decode(text, charset)` throws the same exception on a stray `%`:
  catch it too.
- Regexes: `split`, `matches`, `replaceAll` and `replaceFirst` take a regex, so wrap a runtime
  value in `Pattern.quote(value)` (also when you join it into a `Pattern.compile` pattern), and use
  `replace` for plain text (`pmd/UnquotedRegexValue`, `pmd/PlainTextRegex`).
  Every part of a literal pattern must change what it matches (`"a|b|a"`, `"[\\w_]"` and `"x{1}"` are
  `pmd/RegexPartDefect`), and nested quantifiers such as `"(\\s*\\w+)*x"` are `pmd/BacktrackingRegex`.
- Maps: the function passed to `computeIfAbsent`, `compute`, `computeIfPresent` or `merge` never
  changes the same map, not even from a callback it starts (`pmd/RecursiveMapUpdate`). Attach the
  cleanup to the returned value:
  `map.computeIfAbsent(key, k -> start(k)).whenComplete((r, e) -> map.remove(key, r))`.
- Lombok: a back reference (a child's `parent`, an item's `order`) carries `@ToString.Exclude` and
  `@EqualsAndHashCode.Exclude`, or the generated members recurse until `StackOverflowError`
  (`pmd/GeneratedMemberCycle`). `@Data` or `@EqualsAndHashCode` on a subclass of a class with fields
  states `callSuper = true`, or `callSuper = false` when the inherited fields do not count
  (`pmd/GeneratedEqualsSkipsSuperclass`).
- `equals` and `hashCode` read the same fields: `hashCode` may use a subset of what `equals` compares, never a field
  `equals` ignores, and never `super.hashCode()` or `System.identityHashCode(this)` next to an `equals` that compares
  fields (`pmd/HashCodeDisagreesWithEquals`). Keep mutable state out of both.
- A field the constructor sets and a getter exposes belongs in `equals` and `hashCode`: add the new field to both
  methods (`Objects.equals(extension, that.extension)`, `Objects.hash(groupId, artifactId, extension)`), or mark it
  `transient` or name it as a cache, lock or listener when it is not part of the value (`pmd/EqualsLeavesOutField`).
- A copy constructor, `clone()`, `toBuilder()` or `copy()` copies every field the class declares: when you add a
  field, add it to the copy too (`.tracker(this.tracker)`, `this.tracker = other.tracker`). A field that starts fresh
  in the copy (a lock, a cache, a counter, a listener list) is `transient` or named as such (`pmd/CopyMethodDropsField`).
- Data and results: `record` for data, a `sealed interface` of records for an outcome, and an
  exhaustive `switch` expression over it, with no `default` (`pmd/ExhaustiveSwitchHasDefault`, also for
  a pattern switch). A classic `switch` statement needs `default`.
- Enums: to sort the constants of one of your enums into two groups, classify every constant: a
  `switch` expression without `default`, or a field each constant declares (`PAID(true)`). Not
  `s == PAID || s == SHIPPED`, `Set.of(...).contains(s)` or a boolean `switch` with
  `default -> false` (`ExhaustiveEnumPredicate`).
- No static method, and no instance method (`ForwardingMethodAlias`), that only passes its
  parameters on to another method of the same class; call that method (or, when it is less visible, rename it to the alias's name and delete the alias).
  Factories named `of` or `from` and copies such as `List.copyOf` are fine.
- An override that forwards to `super` or to a delegate of its own supertype passes every parameter it
  receives (`return delegate.render(template, locale, strict);`), not the shorter overload that drops
  one (`pmd/ForwardDropsParameter`).
- Fill each setter or builder slot with the value named for it (`config.timeColumn(timeColumn)`, not
  `config.tableName(timeColumn)`), and pass every member of a numbered family (`type1, type2, type3`),
  not one twice (`pmd/SiblingValuePassed`).
- A record or `@ConfigurationProperties` class (and the classes nested in it) has `tags` or `tag`,
  not both; one item is a one-element list.
- Take a dependency as a constructor parameter (a `Provider` or `Instance` when it is optional or
  created per use); never look it up where it is used from a Guice `Injector`, `CDI.current()`, a
  `BeanManager` or JNDI (`ServiceLocatorLookup`). Only `main`, a Guice `Module`'s `configure`,
  `@Provides`/`@Produces` methods, `@Bean` methods of a `@Configuration` class and CDI extensions
  look dependencies up.
- Test a configuration string (a `@ConfigurationProperties` field, a `@Value` string) with
  `StringUtils.hasText(x)`, not only `x != null`: an empty property binds as `""`, which passes a null
  check (`SpringNullOnlyConfigCheck`).
- Pick the cheaper collection form: a `HashSet` (or `LinkedHashSet`) for items you test with
  `contains` while you collect them (`pmd/ListUsedAsSet`), a `Map` built once with
  `Collectors.toMap` before a loop instead of `stream().filter(x -> x.getKey().equals(key)).findFirst()`
  in it (`pmd/LinearLookupInLoop`), and `min(comparator)`/`max(comparator)` instead of
  `sorted(...).findFirst()` (`pmd/SortForExtreme`).
- Skip a collection step whose result is thrown away: `anyMatch(...)` instead of
  `filter(...).findFirst().isPresent()` or `filter(...).count() > 0`, and `size()` or `isEmpty()` on
  the source instead of on a `toList()` or `new ArrayList<>(source)` copy
  (`pmd/RedundantStreamStep`).
- A `Collectors.toMap`, `toUnmodifiableMap`, `toConcurrentMap` value function and a `groupingBy`
  classifier never return `null` (they throw on it): filter the nulls first, map them
  (`Objects.toString`), or collect into a `HashMap` with `collect(HashMap::new, ..., Map::putAll)`
  (`pmd/NullMapValue`).
- An absent `Optional` is turned into a value with `orElse(default)`, `orElseThrow(() -> new NotFoundException(id))`
  or `orElse(null)` plus a null check where it is used; `orElseGet(null)` passes a null `Supplier` and throws
  when the value is absent (`pmd/OptionalOrElseGetNull`).
- A `Collectors.toMap` over parsed text or request data (a split string, file lines, cookies, headers) has a merge
  function that says what a repeated key means, `toMap(Cookie::getName, Cookie::getValue, (first, second) -> first)`,
  or uses `groupingBy` (`pmd/ToMapDuplicateKey`).
- Output whose order matters (generated files, SQL column lists, schemas, config text) is built from a
  `LinkedHashMap`, `LinkedHashSet`, `TreeMap` or a sorted stream, not from a `HashMap` or `HashSet` joined or appended in
  iteration order (`pmd/HashOrderInOrderedOutput`).
- A collection that the code changes later is built mutable: `new ArrayList<>(List.of("#"))`, not `Arrays.asList`, `List.of`, `Map.of`, `Collections.emptyList()` or `Stream.toList()`, whose `add`, `put` and `remove` throw
  `UnsupportedOperationException` (`pmd/ImmutableCollectionChanged`).
- A copy constructor copies the collections it takes from the other object (`new ArrayList<>(other.items)`,
  `List.copyOf`) when either object changes them later (`pmd/CopyConstructorSharesCollection`).
- A `Stream` from a repository, `getResultStream()` or `queryForStream` is handled row by row in
  `forEach`, flushing a fixed-size batch there, never collected with `toList()` or `collect`
  (`pmd/StreamedRowsCollected`).
- Secrets come from the environment or a secrets manager, never from a literal given to `password`,
  `token`, `apiKey` and the like (`pmd/HardcodedSecret`, `pmd/CredentialLiteral`), and a log call or
  exception message says a secret is set or shows a masked tail, never the value (`pmd/SecretInLog`).
- A value put into an HTML string is escaped first (`HtmlUtils.htmlEscape`, `Encode.forHtml`) or the page comes
  from an escaping template engine (`pmd/UnescapedHtmlValue`).
- A replacement that comes from data goes through `Matcher.quoteReplacement(value)` in `replaceAll`,
  `replaceFirst` and `Matcher.replaceAll`, or use `String.replace(CharSequence, CharSequence)`
  (`pmd/ExpandingReplacement`): the replacement reads `$1` and `\\`.
- A glob or pattern turned into a regex or a `LIKE` pattern with `replace` calls is escaped for the target
  first (`pmd/PatternTranslation`): `Pattern.quote(glob).replace("*", ".*")`, never the raw value; for `LIKE`
  escape `%`, `_` and the escape character, then map the wildcards.
- A password or secret digest is never compared with `equals` (`pmd/SecretDigestEquals`): check a password with
  `passwordEncoder.matches(raw, stored)` (a salted encoder never returns the stored value again), and compare an
  HMAC or a digest of a secret with `MessageDigest.isEqual(expected, actual)`, which takes constant time.
- Resolve every string attribute of an annotation the way its siblings are (`pmd/AnnotationAttributeNotResolved`):
  when a method passes `listener.topics()` and `listener.group()` through `resolve(...)`,
  `resolveEmbeddedValue` or `evaluate(...)`, pass `listener.consumes()` through it too, so a placeholder or
  expression in it is not taken literally. An attribute that is meant to be literal stays raw.
- A loop uses its loop variable (`pmd/LoopVariableUnused`): `for (String name : names) ctx.getBean(name, type)`,
  `delegates.get(i).handle(ctx)`, not `names[0]` or `delegates.get(0)` on every pass. A loop that only repeats
  work names its variable `ignored`.
- A "no limit" maximum is never added to anything (`pmd/MaxValueOverflow`): `startPos + width` with a
  `width` that is `Integer.MAX_VALUE`, a constant of it or a parameter a caller passes it, overflows to a
  negative index or bound. Compare without adding (`width >= length - start`), widen first
  (`(long) start + width`), use `Math.addExact`, or check the sentinel before the arithmetic.
- A JDK `HttpClient` or OkHttp response is checked (`statusCode()`, `isSuccessful()`) before its body is handed to a JSON
  parser (`pmd/UncheckedResponseBody`): a proxy error page is not JSON, and the parse error hides the status.
- A parsed double is checked with `Double.isFinite(x)`, not only `Double.isNaN(x)`: `"Infinity"` and `"1e999"` parse to
  an infinity that `isNaN` lets through (`pmd/NanOnlyGuard`).
- A count that is a subtraction is clamped before `repeat`, `Arrays.copyOf` or `new ArrayList<>(n)`:
  `" ".repeat(Math.max(0, width - text.length()))`; a negative count throws (`pmd/NegativeCountArgument`).
- A bounds check before `get(index)`, `charAt(index)` or `array[index]` rejects with `index >= size()` (or `>= length`):
  `index > size()` lets `index == size()` through to an `IndexOutOfBoundsException` (`pmd/IndexBoundOffByOne`); `>` is
  right only for an insertion position.
- A backoff delay does not grow by `1L << attempt` without a bound: cap the exponent (`Math.min(attempt, 20)`) or use
  `Math.multiplyExact` and fall back to the maximum delay; the shift wraps and the delay turns negative
  (`pmd/BackoffShiftOverflow`).
- A duration or a timeout is measured with a monotonic clock, not two wall-clock reads: read
  `System.nanoTime()` or use a `Stopwatch` or Micrometer `Timer.Sample` instead of subtracting two `Instant.now()` or
  `System.currentTimeMillis()` readings (`pmd/WallClockElapsed`).
- A path, route, package or host is matched on whole segments, never by `String` prefix
  (`pmd/AffixWithoutBoundary`): `path.equals(base) || path.startsWith(base + "/")`, `Path.startsWith`,
  `host.equals(domain) || host.endsWith("." + domain)`, and `URI.getHost()` for a URL.
- A suffix or prefix is removed with an anchored check, never `replace` (`pmd/AffixRemovedByReplace`):
  `name.endsWith(".git") ? name.substring(0, name.length() - 4) : name`, because `replace` also hits `blog.git.io`.
- A key lower-cased or upper-cased for a lookup is looked up in a collection normalized the same way (`pmd/CaseMismatchedLookup`): build the set with `toLowerCase(Locale.ROOT)`, use `new TreeSet<>(String.CASE_INSENSITIVE_ORDER)`;
  a map filled with `name.toLowerCase()` is read with it too.
- A precondition message names the value it checks (`pmd/PreconditionMessageNamesOtherValue`): the check on `timeToLive`
  says so, and the unit gets its own check and message.
- SQL built from parts reads as one valid statement once joined (`pmd/MalformedQueryText`): a `?` after every `LIKE` and
  `=`, as many values as columns in an `INSERT`, and a space at the start of every appended fragment.
- An object-store or search listing follows its pages (`pmd/UnpagedListing`): `listObjectsV2Paginator(request)` or a loop on
  `isTruncated()` and `nextContinuationToken()`, and a RediSearch query sets `limit(offset, count)` and loops.
- A null branch that does not leave is not followed by a use of the same value
  (`pmd/NullBranchFallThrough`): `if (value == null) { out.append("null"); }` followed by `value.getClass()` fails on the null path, or handles the value twice. End the
  branch with `return` or `throw`, or put the use in an `else`.
