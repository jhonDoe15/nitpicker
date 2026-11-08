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
- Signatures: a value with three states is an `enum`, not a boxed `Boolean` parameter, field,
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
  exhaustive `switch` expression over it. A `switch` statement needs `default`.
- Enums: to sort the constants of one of your enums into two groups, classify every constant: a
  `switch` expression without `default`, or a field each constant declares (`PAID(true)`). Not
  `s == PAID || s == SHIPPED`, `Set.of(...).contains(s)` or a boolean `switch` with
  `default -> false` (`ExhaustiveEnumPredicate`).
- No static method that only passes its parameters on to another method; call that method.
  Factories named `of` or `from` and copies such as `List.copyOf` are fine.
- A record or `@ConfigurationProperties` class (and the classes nested in it) has `tags` or `tag`,
  not both; one item is a one-element list.
