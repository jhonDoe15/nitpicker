# Elapsed time measured with the wall clock

A duration or timeout computed from two wall-clock readings is an enforceable `pmd/WallClockElapsed` finding
(`languages/java/adapters/review-rules/value-checks/wall-clock/`), in the Java and Kotlin presets alike. The wall clock
jumps with NTP corrections, manual changes and VM pauses, so the duration comes out negative or huge, a timeout fires
early or never, and the metric reports nonsense: kestra's scheduler measured its evaluation-loop duration with
`Duration.between(start, clock.instant())`. The rule prints as a PMD rule like the other cross-file rules. The finding
is on the line that reads the start.

- **The check:** a local assigned from `System.currentTimeMillis()`, `Instant.now()`, `LocalDateTime.now()`,
  `ZonedDateTime.now()`, `OffsetDateTime.now()`, `LocalTime.now()`, or `clock.instant()` / `clock.millis()`, whose every
  use in the method is a subtraction from another wall-clock read (`now - start`, `Duration.between(start, now)`), when
  the difference is compared with `<`, `>`, `<=` or `>=` or passed to a `record`, `observe` or `timing` call.
- **Allowed forms, not reported:** `System.nanoTime()` (Kotlin `TimeSource.Monotonic`), a `Stopwatch`, a Micrometer
  `Timer.Sample`, and a start that is also stored, sent or compared with a stored timestamp, which is business time.
- **Not covered:** a start kept in a field, a start passed to another method, and test sources.

The message names the allowed forms and ends with the exception route `pmd/WallClockElapsed`.
