# Slow tests

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

- **Rule.** `slow-test` fails a test the change adds or edits when it takes more than 5 s as a unit
  test, or more than 30 s as an integration test (`thresholds.unitTestSeconds` and
  `thresholds.integrationTestSeconds`), the same rule, message shape and budgets as for
  [Java and Kotlin](../java-preset/slow-tests.md) and [Python](../python-preset/slow-tests.md). Its tool
  is `test-runtime`; the finding prints the bare route `slow-test`, and `test-runtime/slow-test` is
  accepted in `exceptions` as the same rule. The message names the budget, the measured time, the
  fixes (fake timers instead of waits, fakes for network, database and disk, or moving the test to
  an integration test) and the exception. It is reported by the `coverage` analyzer, which already
  runs the tests, so a failing test run reports `tests-failed` and no slow tests, and disabling `coverage` also
  turns the check off. TypeScript,
  JavaScript and React share it. `exclude` applies: a test in an excluded file is not checked.
- **Measurement.** Head only, from the per-test `duration` of the report the project's runner
  writes for the coverage run (Vitest and Jest JSON, the `node:test` reporter, Mocha JSON), which
  runs with coverage instrumentation, four workers at most, and so measures slower than a plain run.
  Only passed tests are timed (a failed or skipped test has no meaningful duration), and a test that
  ran more than once keeps its slowest time. A test over the smaller budget in that run is run again
  once, alone: only its file, selected by its full name, with one worker and without coverage, through
  the same runner seam. It is reported only when it is still over its budget, with the time of the
  second run; a second run that fails or finds nothing keeps the first time. So one noisy
  instrumented timing never fails a change, and the rerun starts no extra process when no test is
  slow. The seam's per-test timeout is 10 000 ms plus the larger of the two budgets (40 000 ms by
  default), so a test that takes longer than 10 s can be measured at all;
  `nitpicker/no-raised-test-timeout` still bans a project from raising its own timeout past
  10 000 ms.
- **Unit or integration.** A test is an integration test when its file is under the `e2e/` test
  root, or has a folder named `integration`, `integrations`, `e2e`, `end-to-end`, `functional`,
  `acceptance` or `system` (also with a `-tests` or `_tests` suffix, and `__integration__`) below
  one of the test roots (or below an `__tests__` folder), or is named `*.integration.test.*`,
  `*.e2e.test.*`, `*.int.test.*` or `*.it.test.*` (also `.spec.`). A production folder such as
  `src/integrations` is not a test folder. Every other test is a unit test.
- **Edited or added.** A test is found in its file by its full name (the `describe` titles and the
  test title joined by spaces, the way the runners report it); `it.each` and `describe.each` titles
  (`%s`, `%i`, `$name`), template titles and concatenated titles match as patterns, and a title the
  source does not spell out matches any name. A test counts when its call text (whitespace
  collapsed) differs from the base file's call with the same titles, or the file is new. A reported
  test no call names counts when its file differs from the base. Slow tests the change does not
  touch stay baselined, and the base snapshot reports none.
- **Exception.** `{ "rule": "slow-test", "paths": ["test/db/**"], "reason": "..." }` in the
  top-level `exceptions`, as printed in the message.
- **Tests.** `languages/typescript/adapters/slow-tests/` (fake runner reports with a temporary
  project and baseline, the rerun, the title patterns, the path rules) and
  `slow-tests-runners.test.mjs` (a test that really waits, on each of the four runners, asserting
  only that the rule fires).
