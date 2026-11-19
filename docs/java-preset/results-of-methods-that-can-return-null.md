# Results of methods that can return null

The result of a project method that can return `null` is an enforceable `pmd/NullableReturnUse` finding
(`languages/java/adapters/review-rules/nullable-returns/`) when a caller uses it without a null check. NullAway
needs an `@Nullable` annotation to know the method can return `null`, and SpotBugs only follows nulls inside one
method, so neither sees it. Three Defects4J bugs have this shape: a method returns a map that is still `null` when
the format has no header and the caller copies it, a method is documented as `null` when two lines are parallel
and the result goes into a method that dereferences it, and a getter that every other caller checks is used
without a check. The rule is read from the Java
main sources of every module and printed as a PMD rule, so it runs the same on Gradle and Maven builds. The finding
is on the line of the use. Kotlin types already carry nullability, so Kotlin sources are not read.

- **A nullable method:** a method declared in the main sources whose return type is not a primitive, `Boolean` or
  an `Optional`, and that is not annotated `@Nullable`, `@CheckForNull`, `@NonNull` or `@NotNull`, when it has a
  `return null;` (not in a lambda or an anonymous class), returns a local initialised to `null` that is assigned
  only inside an `if` without `else`, or documents in its Javadoc `@return` that it may be `null` (`null if`,
  `or null`, `may be null`, `null when`, `{@code null}`). A plain `return null;` is
  reported only where other callers check the result (at least one, and at least half of the call sites in the
  project), because most reports without that were values that the callers' own state keeps non-null. A Javadoc
  `@return` or a null-initialised local is also reported, with the message saying the use throws, when the
  method has at most two call sites and none checks it. A method that is only `return null;`, a `return null;` in
  an `if (param == null)` or after `System.exit`, a Javadoc that says the result is `null` only when the input is
  `null`, never or always `null`, or depends on a `boolean` parameter, are not nullable.
- **A callee that most callers check:** a method without the signals above that at least 3 call sites, and at
  least 4 of every 5, check for `null` is treated as nullable, and the message says that the other callers check
  the result.
- **The call:** an unqualified `m(args)` in the same class (or an outer class), `this.m(args)`, or `x.m(args)`
  where `x` is a local, parameter or field whose declared type is a project class that declares `m`, or a project
  class name for a static call. The type is matched through the package, the imports and the wildcard imports; a
  simple name shared by two visible classes is skipped. A single static import (`import static p.B.m;`)
  resolves `m(args)` to `B`; a wildcard static import is not read. An unqualified call inside a nested class that
  extends or implements a type is not resolved to the outer class's method, since the supertype may declare it.
  Abstract and interface methods are targets for the Javadoc and caller signals (there is no body to read).
  The method is matched by name and argument count; when any same-name, same-arity overload is not nullable, or
  the method is a varargs method, the call is skipped.
- **The use:** the result dereferenced in place (`m().foo()`), or a local assigned from it (`T v = m(...);`)
  (declared with a type or `var`, with at most one cast in between) that is then dereferenced (`v.foo()`, `v[i]`), iterated (`for (T e : v)`), switched on, locked on, unboxed
  (`v + 1`, `v < limit`, `int n = m();` with a boxed return type), passed to a copying constructor or method that
  throws on `null` (`new LinkedHashMap<>(v)`, `new ArrayList<>(v)`, `Collections.unmodifiableList(v)`,
  `addAll(v)`) or passed to a project method that dereferences that parameter before checking it.
- **Allowed forms, not reported:** a null check before the use (`v == null`, `v != null`, `Objects.isNull(v)`,
  `Objects.requireNonNull(v, "why")`, `v instanceof T`, `Optional.ofNullable(v)`, `assert v != null`, a predicate
  such as `isReadable(v)`), the same call checked earlier in the method (`m() != null && m().foo()`), a later
  assignment to `v`, and a caller that knows from context that the value is set and says so with
  `Objects.requireNonNull(v, "why")`.
- **Not covered:** test sources, files under `exclude`, a field that receives the result and is used in another
  method (a header map stored in a field by one method and copied by another), a result passed to a library method other than the copying
  constructors above, a null that flows through a ternary (`return x ? null : y;`), methods inherited from a
  superclass or called through a type that two classes share, and a result that is only returned or stored.

The message names the method, the line where it returns `null` (or the callers that check it), says the use
throws (or, when only callers' checks are the evidence, can throw) `NullPointerException` on that path, gives the fix (`if (v == null) return ...;`, or annotate the method and
handle it) and the exception, and ends with the exception sentence for
`{ "rule": "pmd/NullableReturnUse", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/nullable-returns/nullable-returns.test.mts`. The same gap exists in Python for functions
without `Optional` annotations (a `return None` on one path whose result is used as a value) and in TypeScript
without `strictNullChecks`; those presets do not have the rule yet.
