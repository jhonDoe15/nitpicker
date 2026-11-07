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
- Enums: to sort the entries of one of your enums into two groups, classify every entry with a
  `when` without `else` (adding an entry then fails to compile), or a `Boolean` each entry
  declares. Not `s == PAID || s == SHIPPED`, `s in setOf(PAID, SHIPPED)` or a `when` with
  `else -> false` (`pmd/ExhaustiveEnumPredicate`).
- No top-level or `object` function that only passes its parameters, in order, to another function
  with the same parameters (`pmd/StaticForwardingWrapper`); call that function. Factories named
  `of` or `from` are fine. The same goes for a member that only passes its parameters to another
  member of its class (`pmd/ForwardingMethodAlias`); when that member is less visible, rename it to the alias's name and delete the alias.
- A data class, a `@ConfigurationProperties` class, the public properties of any class and the
  defaulted parameters of a public function have `tags` or `tag`, not both
  (`pmd/SingularAndPluralMember`); one item is a one-element list.
- The lambda passed to `computeIfAbsent`, `compute`, `computeIfPresent`, `merge`, or `getOrPut`
  on a `ConcurrentMap`, never changes the same map, not even from a callback it starts
  (`pmd/RecursiveMapUpdate`). Attach the cleanup to the result:
  `map.computeIfAbsent(key) { start(it) }.whenComplete { r, _ -> map.remove(key, r) }`.
- A validation annotation on a constructor property takes the field target:
  `data class OrderRequest(@field:NotBlank val item: String)`, not `@NotBlank val item`, which
  lands on the constructor parameter where `@Valid` never looks (`pmd/ValidationAnnotationTarget`).
