# Counts computed by subtraction

A count that is the difference of two values and goes straight to a method that rejects negative counts is an enforceable
`pmd/NegativeCountArgument` finding (`languages/java/adapters/review-rules/value-checks/negative-count/`), in the Java
and Kotlin presets alike. When the right side is the larger one, `String.repeat` and `new ArrayList<>(n)` throw
`IllegalArgumentException`, `Arrays.copyOf` throws `NegativeArraySizeException`, and Kotlin `take`, `takeLast`, `drop`,
`dropLast`, `String.repeat` and `List(n)` throw `IllegalArgumentException`: duckduckgo's `takeLast(a.size - b.size)` threw
once the new list was longer than the old one. The rule prints as a PMD rule like the other cross-file rules. The finding
is on the line of the call.

- **The call:** `.repeat(n)`, `.take(n)`, `.takeLast(n)`, `.drop(n)`, `.dropLast(n)`, `Arrays.copyOf(a, n)`,
  `new ArrayList<>(n)` and Kotlin `List(n)` or `ArrayList(n)`, where `n` is a subtraction of two non-constants at the top
  level of the argument, or a local assigned once from one. A right side that is a number (`level - 1`) is not reported.
  Kotlin's top-level `repeat(n) { }` and `padStart`/`padEnd` accept a negative count and are not reported.
- **Allowed forms, not reported:** a left side named `max`, `largest` or `longest`, a right side that is a local counter
  (`int n = 0` and only `n++` or `n += ...`), `Math.max(0, ...)`, `maxOf`, `coerceAtLeast`, `coerceIn` or `abs` in the argument, and
  an `if`, `while`, `?` or `&&` before the call on the same statement line that compares the two sides (or the local).
- **Not covered:** a count that is a method parameter computed by the caller, an `IntStream.limit`, and guards that sit
  on other lines than the comparison they depend on.

The message names the call and the allowed form, and ends with the exception route `pmd/NegativeCountArgument`.
