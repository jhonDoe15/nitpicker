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
- In a date-time pattern, `mm` is the minute and `MM` the month (`dd.MM.yyyy HH:mm`), the year is `yyyy` or `yy`,
  the 24-hour clock is `HH` (not `kk`), and `hh` or `KK` needs `a`; none of these throws when written wrong
  (`pmd/DatePatternLetterSlip`).
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
  Do not hand a regex to `replace` (`replace("\\s+", "")` removes nothing) or plain text with a
  metacharacter to `replaceAll` (`replaceAll(".tmp", "")`, `replaceAll("?", v)`), and give
  `replaceAll` `Matcher.quoteReplacement(File.separator)` instead of a raw separator
  (`pmd/ReplaceWithWrongLiteralKind`).
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
- Write each early out of `equals(Object)` in the same direction: return `false` when a field differs
  (`if (!name.equals(that.name)) return false;`, `if (type != that.type || !key.equals(that.key)) return false;`),
  never when it matches (`pmd/InvertedEqualsCheck`).
- Put parentheses around a conditional that sits inside a concatenation:
  `"id=" + (name != null ? name.trim() : "none")`. Written without them, `+` binds first and the
  concatenation, which is never `null`, is what `!= null` tests (`pmd/ConcatenationComparedWithNull`).
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
- A `compare` or `compareTo` method and a `Comparator` lambda return `Integer.compare(a.line, b.line)`,
  `Long.compare(a.time, b.time)` or `Double.compare(a.x, b.x)`, or build the comparator with
  `Comparator.comparingInt(Item::count)`, never a subtraction: the difference overflows `int` and
  `(int)` truncates a `long` or `double` difference (`pmd/SubtractionComparison`).
- A getter returns the field it is named for (`getScrollWidth()` returns `areaWidth`, not the
  neighbouring `areaHeight`, and `getLeft()` not `right`); a cloned getter gets its field changed together with its name
  (`pmd/GetterReturnsSiblingField`).
- Assign a bound from the accessor that carries its name (`int max = range.getMax();`,
  `afterPath = getAfterPath(change)`, not the accessor of the opposite end); a copied line gets both
  sides edited (`pmd/OppositeBoundAssigned`).
- A method or variable named for a change (`isModified`, `hasChanged`, `dirty`) is computed with a
  negated comparison (`return !saved.equals(edited);`), not plain equality, which says the opposite
  (`pmd/ChangeNamedEquality`).
- Do not pass a variable to a setter or mutator called on itself (`defaults.putAll(defaults)`,
  `node.setPeer(node)`, `node.attach(node)`) when another variable of that type is in scope; name the
  one that was meant (`pmd/ReceiverPassedAsArgument`).
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
- `BigDecimal.divide(divisor)` with one argument throws `ArithmeticException` when the quotient does not
  terminate (`1 / 3`): pass a scale and a rounding mode, `divide(divisor, 2, RoundingMode.HALF_EVEN)`, or a
  `MathContext`, unless the divisor is always a power of ten (`pmd/BigDecimalExactDivide`).
- Never put a side effect in `peek` or in a block-bodied `map` of a stream that ends in `count()` over a sized
  source: since Java 9 `count()` skips the pipeline, so use `forEach` and then `size()` (`pmd/PeekSkippedByCount`).
- The argument of `orElse`, `getOrDefault` or `requireNonNullElse` is evaluated even when the value is present, so a
  repository, JDBC, HTTP or messaging call, or a method that throws, goes into `orElseGet`, `orElseThrow` or
  `computeIfAbsent`, never into the fallback argument (`pmd/EagerFallbackDoesIo`).
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
- A counting `for` loop updates its index toward its exit condition (`pmd/LoopUpdateAwayFromExit`):
  `for (int i = list.size() - 1; i >= 0; i--)` and `for (int i = 0; i < n; i++)`, not `i >= 0` with `i++`
  or `i < n` with `i--`, which never ends.
- A literal index stays inside the length its own guard proved: `params.length > 2 ? params[2] : null`,
  `if (parts.length < 2) return;` before `parts[1]`, `list.size() >= 3` before `list.get(2)`; a guard one short
  of the index lets through exactly the length that throws (`pmd/ConstantIndexBeyondGuard`).
- Cut exactly the affix you tested: `path.substring("file://".length())` after `startsWith("file://")`, and
  `s.substring(1, s.length() - 1)` after checking both quotes, not a hard-coded offset that is one off
  (`pmd/AffixLengthMismatch`).
- A null check does not make a list, array or string non-empty: read `get(0)`, `[0]`, `charAt(0)` or
  `iterator().next()` after `!isEmpty()`, `size() > 0` or `length > 0`
  (`pmd/FirstElementOfMaybeEmpty`).
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
- The result of a project method that can return `null` is checked before it is used
  (`pmd/NullableReturnUse`): `Point v = line.intersection(other); line.toSubSpace(v);` throws when the lines are
  parallel and the method returns `null`. A plain `return null` is reported only where other callers check the
  result. Add `if (v == null) return ...;`, annotate the method `@Nullable` and handle it,
  or, when the caller knows the value is set, document it with `Objects.requireNonNull(v, "why")`.
- A function does not call itself, directly or through another function of the file (`pmd/SelfRecursion`): a retry or poll is a loop over attempt numbers, a tree walk is a loop over a worklist (a `Deque` that each step adds the node's children to), flat data uses `map` or `flatMap`. An exception fits only when the recursion is bounded and deliberate.
- A recursive walk over references that can lead back (`getDependencies()`, `getReferences()`, `getCause()`,
  `getInterfaces()`) passes a visited `Set` or a depth limit down (`pmd/UnguardedCyclicRecursion`).
- A walk over both operands of an expression (`getLeft()` and `getRight()`) loops over the left-leaning chain and
  recurses only into the right operand, or takes a depth limit (`pmd/OperandDepthRecursion`).
- Every entry point into a guarded recursion checks the same in-progress `Set` or `Map` as its sibling, or calls the
  guarded sibling (`pmd/UnguardedRecursionEntry`).
- A cache never stores an answer that a recursion guard may have cut short in a deeper turn: skip the `put` or mark
  the value as partial (`pmd/CacheAfterGuardFallback`).
- A worklist that can add several items per turn keeps a `Set` of the items already expanded
  (`if (!expanded.add(item)) continue;`): a depth limit alone does not bound the number of paths
  (`pmd/DepthOnlyWorklist`).
- A worklist pass whose transfer can remove facts keeps the last output per edge and recomputes each input from them,
  instead of `input.get(next).addAll(out)` (`pmd/ShrinkingWorklistJoin`).
- A public method or constructor does not wait a constant it cannot override
  (`pmd/UninjectableDelay`): `Thread.sleep(RETRY_DELAY_MS)` or `TimeUnit.SECONDS.sleep(...)` on a
  `private static final` makes a test wait it out. Take the delay as a parameter, or a field the constructor
  sets, that defaults to the constant (`this(RETRY_DELAY_MS)`).
- Domain code does not change what it was given (`pmd/MutatingMethodInDomain`, classes of a `domain` package):
  `items.add(x)`, `index.put(k, v)`, `list.sort(...)` or `date.setTime(...)` on a parameter. Build a new value:
  `List.copyOf` plus the change, `Stream.toList()`, `Map.copyOf`, or a new collection created and filled
  in the same method.
- A wrapper that forwards an interface to its delegate forwards its constant or no-op `default` methods too
  (`pmd/DelegateSkipsDefaultMethod`): when `getMetrics()` or `isAsync()` is a `default` the wrapper does not
  override, callers get the default and the delegate's value is lost. Forward it, or override it calling
  `Interface.super.method()` to keep the default on purpose.
