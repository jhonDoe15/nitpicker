# Console output of tests

Part of the [Java preset guide](../java-preset.md).

- **Rule.** `test-runtime/test-console-output` fails a change whose tests print console output the
  base run did not print, with the same semantics as the TypeScript preset's rule: the output is
  compared as text after normalization, `testConsole.allow` in `nitpicker.config.json` skips a
  third-party message (`{ "contains": "...", "paths": [...], "reason": "..." }`, with the same
  matching), and an exception lifts a test file. The message quotes the normalized line, names the
  test file and test that printed it, says to fix the cause (a warning the code under test now logs,
  a mock or thread that outlives the test) and gives both routes.
- **What counts.** From the JUnit XML the test tasks already write (`TEST-*.xml`, copied as for
  [slow tests](slow-tests.md)): every `system-err` block, and the `system-out` blocks that carry a
  `WARN`, `WARNING`, `ERROR`, `FATAL` or `SEVERE` level, so Spring's banner and `INFO` startup lines
  never count. A block is a line plus its indented continuation lines; stack frames
  (`at ...`, `... 3 more`) are dropped. A JVM warning is several `WARNING:` lines and often follows
  the line that caused it (Mockito's "self-attaching" notice and the agent warning after it on JDK
  21); adjacent `WARNING:` lines and the line next to them are one block, so one finding. SLF4J's own
  notices (`SLF4J(W): No SLF4J providers were found.`) describe the test classpath, not the code
  under test, and land on whichever test first loads a logger: on Maven that is the first test,
  because Surefire discovers the ArchUnit classes in the test JVM, while Gradle runs them in
  `nitpickerArchunit`. Both builds drop them, so they report the same. Surefire's redirected output files (`<class>-output.txt`,
  with `redirectTestOutputToFile`) are copied too and read with the stdout rule. The init script
  sets `outputPerTestCase` on every test task, so Gradle names the test that printed a line as
  Surefire does; a test name loses its parameter list (`totals()` is `totals`).
- **Normalization.** The TypeScript preset's normalizer (`shared/rules/console/console-messages.mjs`), so
  `testConsole.allow` matches the same way in every preset: ANSI colors, absolute paths (kept as the last segment),
  timestamps and clock times, hex values, UUIDs, random-looking words and numbers (with their
  units) are replaced, so `cache miss for order 42` and `... 43` are the same message. The thread
  name of a Spring Boot (`--- [main]`) or Logback (`[main] WARN`) log line is replaced too: Gradle
  runs tests on `Test worker`, Surefire on `main`. The same normalizer also covers the escaped and
  replaced characters of Gradle and Surefire reports, `java.util.logging` clock lines, durations and
  the random parts of Mockito, ByteBuddy and proxy class names.
- **Keyed per module, not per file.** The finding's path is the module directory (`.` for the
  root) and its identity a hash of the normalized message. The JVM shares state across test
  classes: Spring caches one application context for every test class that asks for it, and a
  library warns once per JVM, so the class that prints a startup warning changes when tests are
  added or reordered. Keying per module keeps such a line baselined wherever it moves; a new line
  in any test of the module still fails. The finding carries the message words as `tokens`, for the
  shared matcher that tolerates one random-looking word.
- **Limits.** Output a test prints from a thread after it ends is attributed by the build to
  whatever runs then. A line printed only in some runs (a timing-dependent warning) shows up as new
  in the run that has it; allow it in `testConsole.allow` with the reason.
- **Tests.** `adapters/test-times/console-output.test.mjs`, `console-findings.test.mjs`,
  `maven/results/maven-test-results.test.mjs`, and `spring/java-spring.e2e.test.mjs`, which
  commits a test that prints a new line on top of the Spring fixture and asserts, on Gradle and on
  Maven, that it is the only console finding: Spring's startup output, the WARN line a service logs
  in an unchanged `@SpringBootTest`, and a renumbered line in an edited test all stay baselined.
