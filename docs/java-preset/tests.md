# Tests

Part of the [Java preset guide](../java-preset.md).

- `languages/java/adapters/reporting/java-reports.test.mjs`: fast, always on. Report conversion, project-relative paths,
  classification, line-shift stability.
- `languages/java/adapters/review-rules/*.test.mjs` and `messages/wait-advice.test.mjs`: fast,
  always on. The enum filter, the test-only class check and the Awaitility advice.
- `languages/java/messages/rule-messages.test.mjs`: fast, always on. Short Checkstyle names, fix
  text, the exception route, and the shape of every catalog entry.
- `languages/java/messages/rule-catalog.e2e.test.mjs`: gated like the other e2e tests. The catalogs
  name exactly the rules of the pinned tool versions.
- `languages/java/adapters/java-e2e/java-preset.e2e.test.mjs`: gated behind `NITPICKER_JAVA_E2E=1` (`npm run test:java`, which also runs `java-spring.e2e.test.mjs`, `spring/e2e/spring-arch.e2e.test.mjs`, `escape-hatches.e2e.test.mjs`, `languages/java/adapters/java-e2e/pit-targets.e2e.test.mjs`, `languages/java/maven/preset/red-base/maven-red-base.e2e.test.mjs`, `languages/java/adapters/errorprone/error-prone.e2e.test.mjs`, the other Error Prone e2e tests `rule-catalog.e2e.test.mjs` and `languages/java/adapters/java-e2e/red-base/java-red-base.e2e.test.mjs`, one file at a time because each stops the Gradle daemons when it ends). Needs Java 21, Gradle, Maven and network access to Maven Central; about 85 seconds
  warm. `.github/workflows/java-e2e.yml` runs it (Temurin 21, Gradle 8.14.3, Maven 3.9.11) on a push to `main` that changes `languages/java/**`, `core/**`, `shared/**`, `package.json`, `package-lock.json`, `vitest.config.mts` or the workflow, by hand (`workflow_dispatch`), and on a pull request when the `run-ci` label is added. On a tiny Gradle project (`languages/java/adapters/fixtures/gradle-project`, one legacy PMD and
  SpotBugs violation on the base) it checks: a clean change passes; a change that only moves the
  legacy violation stays baselined; a change adding an empty catch block (PMD), a default-charset
  `String` (SpotBugs) and misformatted code fails with exactly those three findings as new.
  `pit-targets.e2e.test.mjs` runs `nitpickerPit` on a project whose packages sit under `org.acme`
  and a class directly in `org`, and checks that PIT starts and mutates every class.
- The conformance suite (`npm run test:conformance`) already covers the comparison itself. The
  Java-specific part of X11's done criterion ("passes the conformance suite") is that the findings
  produced here satisfy the findings schema, which `collectJavaFindings` enforces on every run via
  `parseAnalyzerReport`.

Gradle commands default to a 15-minute deadline, configurable with
`NITPICKER_GRADLE_TIMEOUT_MINUTES` as described above. On Linux and macOS, nitpicker starts each command
in its own process group and stops that group with SIGTERM at the deadline, then SIGKILL
after 500 ms. This also stops inherited Gradle/test-worker processes when the launcher exits
first or ignores SIGTERM. On Windows, the deadline force-stops the command tree with
`taskkill /T /F`. Cleanup adds at most 1.5 seconds on Linux/macOS or 2 seconds on Windows, plus process-launch overhead. Processes
that deliberately leave the command group, including a pre-existing shared Gradle daemon,
are outside this boundary; use `--no-daemon` when the whole build must stop with the command.
