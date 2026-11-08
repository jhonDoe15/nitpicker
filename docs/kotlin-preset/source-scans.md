# Source scans

Part of the [Kotlin preset guide](../kotlin-preset.md).

Two checks read the `.kt` files themselves, after masking comments and string literals (the same
mask as `inline-suppression`), and report as tool `detekt`. Both can flag legitimate code, so both
take an `exceptions` entry per path.

**`catch-log-without-exception`.** A `catch (e: ...)` block that logs a failure must pass the caught
exception itself to the logger, so the stack trace is kept: `log.error("what failed", e)` (SLF4J, Log4j2),
`logger.error(e) { "what failed" }` or `logger.atError { cause = e }` (kotlin-logging),
`logger.log(Level.SEVERE, "what failed", e)` (java.util.logging), `Log.e(TAG, "what failed", e)` (Android).
`e.message`, `e.toString()` and a string template of the exception do not count, and neither does a log
call without the exception. Only the failure levels are checked: `warn` and `error` (and `fatal`), JUL
`warning`, `severe` and `log(Level.SEVERE | WARNING, ...)`, Android `Log.w`, `Log.e` and `Log.wtf`;
`debug`, `info` and `trace` logs in a catch are not findings. These pass as well: the SLF4J 2 fluent API
with the exception anywhere in the chain (`atError().setCause(e).log(...)`, `withThrowable(e)`), a cast of
the exception (`e as Throwable`), and a catch that rethrows `e` or throws a new exception with `e` as an
argument (its cause) after logging. A call is a log call when its receiver (also as `logger?.error(...)`) is
declared from `KotlinLogging.logger`, `LoggerFactory.getLogger`, `LogManager.getLogger` or
`getFormatterLogger`, `Logger.getLogger` or `System.getLogger`, or its name is `log` or `logger` (any case) or ends in one at a
camelCase or underscore boundary (`auditLog`, `appLogger`, `AUDIT_LOG`, `audit_log`; `dialog` and `catalog` are not loggers). The list lives in `languages/java/source/loggers.mjs`. The
innermost catch is the one checked, and a catch of `_`, `ignored...`, `expected...` or `unused...` is left
alone. Main and test sources are scanned. In main sources a catch that does nothing but log is
`kotlin-source/CatchOnlyLogsOrReturnsDefault` and only that (logging alone is not handling, as in the
Python preset), so this check looks at the catches that also handle the error some other way (throw,
return a failure, answer with an error response); in test sources, where that rule does not run, every
catch is checked. One finding per log call, identified by
`catch-log:<receiver>.<level>`.

**`test-without-assertion`.** A test method (`@Test`, `@ParameterizedTest`, `@RepeatedTest`,
`@TestTemplate`, block or expression body, backtick names) that calls no assertion. A call counts when its
name is `assert`, `check`, `verify`, `coVerify`, `expect` or `should` alone or followed by a capital
(`assertEquals`, `assertFailsWith`, `assertThrows`, `verifyOrder`, `expectThat`, `shouldThrow`; Kotest infix
`x shouldBe y` too), or `confirmVerified`, `fail`, `andExpect` or `forAll`. Variables (`expected`) and calls on
a receiver (`checkoutService.run()`) do not count. A test that is `@Test(expected = ...)` is skipped.
The project's own helpers are learned: the convention `kotlin.assertionHelpers` lists the names that end
the last statement of enabled tests without a known assertion in at least three test files, read like
an assertion (`ensure...`, `must...`, `validate...`, `is...`, `has...`, `await...`) and are defined in a test
or test-support source as a function whose body asserts or throws; pin a list of names in `conventions`
to set it yourself. `@Disabled` and `@Ignore` tests are skipped. Kotest specs written as `"name" { ... }` have no `@Test`
and are not scanned. The test sources are the Kotlin directories of the `test` source set.
One finding per test, identified by `test:<name>`.
