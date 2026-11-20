# Backoff delays that overflow

An exponential backoff that multiplies a base delay by `1 << attempt` is an enforceable `pmd/BackoffShiftOverflow`
finding (`languages/java/adapters/review-rules/value-checks/backoff/`), in the Java and Kotlin presets alike. A shift
count is taken modulo the width of the type, so for a large attempt count the shift wraps and the product overflows:
the delay turns negative or small, and a retry loop that should be slowing down spins or sleeps for no time at all. The
rule prints as a PMD rule like the other cross-file rules. The finding is on the line of the shift.

- **The check:** a product with `1 << n` or `1L << n` (Kotlin `1 shl n`, `1L shl n`) as one factor, where `n` is a plain
  name that nothing in the method bounds, and either `n` or the method is named like a retry (`attempt`, `retry`,
  `retries`, `tries`, `backoff`, `delay`, `wait`, `sleep`, `failure`).
- **Allowed forms, not reported:** a comparison of `n` with a limit in the method, `Math.min(n, k)` with `k` at most 30
  (a clamp to the type width, such as `Math.min(n, 62)`, does not count), a shift of a constant, and names that do not
  look like a retry.
- **Not covered:** an exponent that is an expression, a delay computed with `Math.pow`, and test sources.

The message names the allowed forms and ends with the exception route `pmd/BackoffShiftOverflow`.
