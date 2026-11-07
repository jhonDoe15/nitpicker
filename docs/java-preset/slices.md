# Slices

Part of the [Java preset guide](../java-preset.md).

Order: each slice is one PR, adds one tool, and changes only the init script, one ingester or
mapping, tests, and this document.

| #   | Slice                    | Tool and report                                                  | Findings                                                                                                 | Status  |
| --- | ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Base                     | PMD, SpotBugs, google-java-format, JaCoCo; init script, e2e test | see below                                                                                                | done    |
| 2   | Integration              | none new                                                         | Wire into the CLI and reporters (text, JSON, SARIF from X4); `tool-error` on Gradle failure; npm `files` | done    |
| 3   | Checkstyle               | Checkstyle XML via the Gradle `checkstyle` plugin                | `ingestCheckstyle` (X6) as is                                                                            | done    |
| 4   | ArchUnit                 | ArchUnit rules as JUnit tests; JUnit XML failures                | new small ingester: one enforceable finding per violated rule and offending class                        | done    |
| 5   | CRAP                     | structure metrics for complexity, JaCoCo for per-method coverage | new `crap` ingester joining both; same rules as the TypeScript `crap` check (limit 9)                    | done    |
| 6   | Duplicates               | jscpd with the `java` format, JSON report                        | new ingester: `duplicate-clone` and `duplicate-clone-size`, as in the TypeScript `duplicates` check      | done    |
| 7   | Mutation                 | PIT, XML report                                                  | new ingester: `mutant-survived`, `mutant-nocoverage` enforceable, summary descriptive (see X10)          | done    |
| 8   | Gate on changed coverage | JaCoCo with changed line ranges from git                         | `changed-branch-coverage` equivalent (needs a head-vs-base line mapping, not a per-report ingester)      | this PR |

PMD and SpotBugs appear before the other tools because both emit SARIF 2.1.0 and need no new
ingester. Slices 4 to 7 need Java-specific tooling (Gradle test task wiring, Node
for jscpd, a long-running PIT) and each is expensive enough to deserve its own review. Slices 5 and
8 depend on slice 1's JaCoCo output.
