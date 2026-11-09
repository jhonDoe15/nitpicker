# Errors

Part of the [nitpicker-java](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Never swallow: no empty `catch` (PMD `EmptyCatchBlock` and Checkstyle both fail it). A `catch`
  returns a failure value, logs and recovers, or rethrows with the cause:
  `throw new IllegalStateException("bad quantity " + text, e);` (`PreserveStackTrace`).
- Catch the narrowest type: `catch (NumberFormatException e)`. `catch (Exception)`,
  `catch (RuntimeException)`, `catch (Throwable)` and `catch (NullPointerException)` fail. Keep
  the `try` around the one call that throws.
- A timeout stops waiting, not the work (`pmd/timeout-abandons-operation`): in the `TimeoutException`
  handler of `future.get(1, SECONDS)` call `cancel(true)` on that future (not `cancel(false)` or
  `shutdown()`) or rethrow. A `supplyAsync` or `runAsync` future never interrupts its task, with
  `get`, `orTimeout`, `completeOnTimeout` or `cancel(true)`: submit the work to an `ExecutorService`
  and cancel the `Future` it returns.
- A project exception a controller can throw maps to a status: an `@ExceptionHandler` for it (or a
  base class) in a `@RestControllerAdvice`, or `@ResponseStatus` on the class
  (`archunit/spring-unmapped-exception`).
- Expected failures are values: a `sealed interface` result returning
  `new QuantityParse.Invalid(text)` beats throwing.
