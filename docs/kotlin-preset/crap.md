# CRAP

Part of the [Kotlin preset guide](../kotlin-preset.md).

Kotlin functions get the shared CRAP rule: `crap-score-limit` at a score of 9 or more
(`thresholds.crapLimit` overrides it) and `crap-coverage-unknown` when no coverage is known, tool
`crap`, with the same ratchet for edited functions that were already over the limit. The score is
`ccn^2 * (1 - coverage)^3 + ccn`, with the lower of line and branch coverage, as for Java, and the
CRAP ingester (`ingestCrapFunctions`) is the Java one.

**Complexity and coverage (decisions).** The complexity is the one from `kotlin-psi`, for
the reason above; it counts what `StructureMetrics.java` counts for Java. Coverage is JaCoCo's per-method
data. The match is by file and line, not by function name, because Kotlin's JVM names do not follow
the source: JaCoCo keys classes by `package/sourcefilename`, so `FileNameKt` facades, companions,
nested classes and `DefaultImpls` of one file are all that file's methods. The key is built from the
`package` statement of the file and its file name, not from its directory, so a file outside the
directory of its package (`src/main/kotlin/Flat.kt` with `package demo`) gets its coverage. A JaCoCo
method belongs to the function whose line range holds its first line, unless it lies inside a unit of its own (a member
of a class declared in the function, a lambda, a local function). So the getter `getDoubled` belongs to `val doubled get() = ...`,
the lambda `bump$lambda$0` and a local function belong to their own units, not to the function that declares them. A lambda that
the compiler inlined (`let { }`, `map { }`, a lambda passed to an `inline` function) has no method of its own: it
is scored from the source lines of its range in JaCoCo's per-line data, as an `init` block is, and the function around it is
scored without those lines, unless nothing is left to measure. The synthetic `name$default` method that Kotlin
generates for default arguments is ignored: it has no source of its own and delegates to the function.
An `init` block and a property initializer that is not a lambda or a call with a lambda run inside the
class constructor or the static initializer, whose JaCoCo method starts on the class line, outside
the unit. Their coverage is therefore read from the source lines of the unit in JaCoCo's per-file
line data (covered lines, covered branches), minus the lines of a unit nested in them; the lower of
the two percentages is used as everywhere else.
A `@JvmStatic` companion function, which compiles to the function and a static method that delegates
to it on the same line, is counted once, through the method that holds the code. The score of a
function whose range holds no instrumented method is unknown, which is a finding
(`crap-coverage-unknown`; its message says to add a test that calls the function).

**`inline` functions have no CRAP score (decision).** The compiler copies the body of an `inline`
function into every caller and the original is never run, so JaCoCo reports it as uncovered (a
`reified` one as missing), whatever the tests do. A score computed from that could not be brought down
by any test and would fail a complex inline function for good. They are left out of the CRAP rule;
`function-lines-limit` and the other structure limits apply to them as to any function, and a
complex inline function should be split up. The metrics step marks them (`inline: true` in
`kotlin-metrics.json`).

The Java sources of a mixed module get their complexity from `StructureMetrics.java`; it never reads a
`.kt` file.
