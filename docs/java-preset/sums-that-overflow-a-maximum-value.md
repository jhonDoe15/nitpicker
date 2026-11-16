# Sums that overflow a maximum value

An integer `+`, `*` or `+=` with an operand that can hold the maximum of its type is an enforceable
`pmd/MaxValueOverflow` finding (`languages/java/adapters/review-rules/max-value-sums/`), in the Java and
Kotlin presets alike. A "no limit" value such as `Integer.MAX_VALUE` overflows as soon as it is added to
something, and the negative result goes on as an index, a length or a bound: apache/commons-cli's
`Math.min(startPos + width, text.length())` threw `StringIndexOutOfBoundsException` for the default
`width = Integer.MAX_VALUE`. The same shape appears in paging (`offset + limit` for "all") and timeouts
(`now + timeout` for "forever"). The rule prints as a PMD rule like the other cross-file rules, because the
sentinel and the sum are often in different files.

- **A maximum-valued operand:** a constant, field or local initialised to `Integer.MAX_VALUE`,
  `Long.MAX_VALUE` (Kotlin `Int.MAX_VALUE`) or the literal `2147483647`, a Kotlin parameter whose default
  value is one, or a parameter that a call in the project passes one (positionally or by name, directly or
  through such a constant, field or parameter, across files). An accessor of such a field
  (`getMaxWidth()`) or of a method that only returns one (`unlimited()`) counts, and so does a local chosen by a ternary with a maximum branch. In a method that creates `PageRequest.of(page, MAX)` or `Pageable.ofSize(MAX)`, `getPageSize()` counts as a maximum. A parameter of the same name that shadows a maximum field does not.
- **The sum is used as:** an index (`items[a + b]`, `get`, `subList`, `substring`, `charAt`, `copyOf`),
  a length or capacity (`new int[a + b]`, `ArrayList(a + b)`, `limit`, `take`, `repeat`), a loop bound
  (`i < a + b`, Kotlin `until` and `..`), an argument of `Math.min`/`Math.max` (`minOf`, `maxOf`), an
  operand of a comparison, or it is stored in a local that is used that way later in the method.
- **Allowed forms, not reported:** compare without adding (`width >= length - start`); widen first
  (`(long) start + width`, Kotlin `start.toLong() + width`); `Math.addExact`; a sentinel check or any
  comparison of the operand earlier in the method against the maximum or a bound (`if (width == Integer.MAX_VALUE) ...`, `width >= length - start`; a sign check such as `width < 0` does not count); clamping it with
  `Math.min` earlier (`width = Math.min(width, length)`).
- **Not covered:** test sources, files under `exclude`, call sites that reach a parameter through a
  getter, a lambda or a framework (a `PageRequest` created in one method and read in another), and a maximum documented only in a comment.
  Names are matched by simple name and argument count, not by type, so an unrelated method of the same
  name can carry the sentinel; the exception route below lifts such a hit.

The message names the operand, the sum, the maximum and the allowed forms, and ends with the exception
sentence for `{ "rule": "pmd/MaxValueOverflow", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/max-value-sums/max-value-sums.test.mts`.
