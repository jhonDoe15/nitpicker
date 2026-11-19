# Delays that tests cannot override

A public method, constructor or function that waits a constant it cannot be given another value for is an
enforceable `pmd/UninjectableDelay` finding (`languages/java/adapters/review-rules/fixed-delays/`), in the Java
and Kotlin presets alike. A test of that code has to wait the whole delay out or fake the clock. The rule is
read from the main sources of every module and printed as a PMD rule, so it runs the same on Gradle and Maven
builds. The finding is on the line of the timer call.

- **The timer:** `Thread.sleep(X)`, `TimeUnit.<UNIT>.sleep(X)`, Kotlin `delay(X)`, and `schedule`,
  `scheduleAtFixedRate` or `scheduleWithFixedDelay` with `X` as an argument after the task (a `TimeUnit`
  argument sets the unit).
- **The constant:** `X` is a `static final` field (Java) or a `const val` or top-level `val` (Kotlin) of the same
  file, whose value is a number, a product or sum of numbers and other constants, or a Kotlin duration literal
  such as `2.seconds`, of 500 ms or more.
- **The owner:** the call sits in a public method, constructor or function (Kotlin: not `private`, `protected` or
  `internal`) that takes no parameter that can carry the delay: a parameter with a default (Kotlin), or one whose
  name says delay, timeout, interval, wait, duration, options, config, clock, scheduler or the like.
- **Allowed forms, not reported:** a parameter or a field set by the constructor that defaults to the constant
  (`Thread.sleep(delayMs)` with `Poller() { this(RETRY_DELAY_MS); }`; Kotlin `suspend fun poll(delayMs: Long =
  RETRY_DELAY)`), a delay under 500 ms, a private or protected method, and a literal or non-constant delay.
- **Not covered:** test sources and files under `exclude`, a constant declared in another file, and a private
  helper that a public method calls.

The message names the timer, the constant and its value in milliseconds, the owner and the allowed form, and ends
with the exception sentence for `{ "rule": "pmd/UninjectableDelay", "paths": ["<file>"], "reason": "..." }`.
Tests: `adapters/review-rules/fixed-delays/fixed-delays.test.mts`. The TypeScript, Python and Go counterparts are
`nitpicker/no-uninjectable-delay`, `uninjectable-delay` and `go-rules/uninjectable-delay`.
