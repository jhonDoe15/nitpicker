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
- Time units: name a time value with its unit (`timeoutMillis`, `ttlSeconds`) and let it meet only the same
  unit: convert once where it enters (`TimeUnit.SECONDS.toMillis(ttlSeconds)`, `Duration.ofSeconds(s).toMillis()`)
  and pass a `TimeUnit` that matches the value (`pmd/MixedTimeUnits`). Keep epoch times in a `long` or an
  `Instant`, never `(int) (System.currentTimeMillis() / 1000)` (`pmd/EpochNarrowedToInt`).
- URIs from runtime text: build them with an encoding builder
  (`UriComponentsBuilder...encode().build().toUri()`, `new URI(scheme, host, path, fragment)`), or
  parse where the failure is handled (`URI.create(text)` in a `try` that catches
  `IllegalArgumentException`); `URI.create` on a non-constant string is flagged
  (`pmd/UriCreateDynamic`).
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
