# Errors

Part of the [nitpicker-java](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Never swallow: no empty `catch` (PMD `EmptyCatchBlock` and Checkstyle both fail it). A `catch`
  returns a failure value, logs and recovers, or rethrows with the cause:
  `throw new IllegalStateException("bad quantity " + text, e);` (`PreserveStackTrace`).
- A `catch (InterruptedException e)` calls `Thread.currentThread().interrupt()` or rethrows; returning a
  default or logging alone loses the interrupt (`pmd/SwallowedInterrupt`).
- Catch the narrowest type: `catch (NumberFormatException e)`. `catch (Exception)`,
  `catch (RuntimeException)`, `catch (Throwable)` and `catch (NullPointerException)` fail. Keep
  the `try` around the one call that throws.
- Expected failures are values: a `sealed interface` result returning
  `new QuantityParse.Invalid(text)` beats throwing.
