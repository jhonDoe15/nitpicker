# Nitpicker checks catalog

Every check category in the TypeScript preset, derived from `typescript/preset/quality-checks.mjs`
and the adapters in `typescript/adapters/diff/`. Findings follow
[`findings.schema.json`](findings.schema.json).

How classification works:

- **enforceable**: a finding with `classification: "enforceable"` that is new relative to the base
  snapshot fails the gate (`newEnforceableFindings > 0`).
- **report-only**: `classification: "descriptive"`. Shown in the report (metric changes appear in
  `changedMetrics`) but never fails the gate. Only descriptive findings may carry a `metric`.
- `tool-error`: an analyzer that could not run. Not a check category; it sets
  `overallStatus: "tool-error"`.

Thresholds are the defaults in the preset. Where a value is not a hard-coded limit it says so.

## ESLint checks

Each runs ESLint with a different config. Every ESLint message becomes an **enforceable** finding
(`rule` is the ESLint rule id). No numeric threshold: any new message fails.

| Check                   | Scope                              | Config                                    | Status      |
| ----------------------- | ---------------------------------- | ----------------------------------------- | ----------- |
| `eslint-lint`           | source and test globs              | `preset/defaults/eslint.config.mjs`       | enforceable |
| `eslint-errors`         | production source (tests excluded) | `preset/eslint-config/errors.mjs`         | enforceable |
| `eslint-logging`        | production source (tests excluded) | `preset/eslint-config/logging.mjs`        | enforceable |
| `eslint-module-effects` | production source (tests excluded) | `preset/eslint-config/module-effects.mjs` | enforceable |

## Entry points

| Check          | Rule                        | Threshold                                         | Status      |
| -------------- | --------------------------- | ------------------------------------------------- | ----------- |
| `entry-points` | `public-alternative-bypass` | none: importing around a public entry point fails | enforceable |

## Static checks

| Check                     | Rule                         | Threshold                        | Status                                                             |
| ------------------------- | ---------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `prettier-format`         | `prettier/prettier`          | none: any unformatted file fails | enforceable                                                        |
| `typescript-typecheck`    | `TS<code>` per diagnostic    | none: any new diagnostic fails   | enforceable                                                        |
| `dependency-architecture` | dependency-cruiser rule name | rule severity                    | `error` severity is enforceable; any other severity is report-only |

## Quality-area checks

| Check              | Rules (finding)                                                                                                                   | Default threshold                                                                                                           | Status                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `policy-tests`     | the project's policy test suite                                                                                                   | all tests must pass; timeout 2 min                                                                                          | enforced by failing the run (a non-zero vitest exit throws; the runner emits no findings) |
| `coding-standards` | `public-contract-production-use`, `runtime-boundary/*`, `callback-protocol/*`, ESLint coding-standard rules, `baseline-expansion` | new sites beyond the legacy baseline (`preset/coding-standards/legacy-sites.json`); raising a baseline allowance also fails | enforceable                                                                               |
| `coupling`         | `stability-direction`                                                                                                             | a package depending on a less stable package                                                                                | enforceable                                                                               |
|                    | `module-coupling`, `package-coupling`, `stability-direction-metric`, `coupling` summary                                           | none                                                                                                                        | report-only (metrics: fan-in/out, instability, cohesion, `instabilityDelta`)              |
| `test-runtime`     | `no-production-runtime`, `type-only-production-dependency`                                                                        | a test must exercise production runtime code                                                                                | enforceable                                                                               |
|                    | `category-count`, `test-runtime` summary                                                                                          | none                                                                                                                        | report-only                                                                               |
| `structure`        | `function-lines-limit`                                                                                                            | more than 50 lines                                                                                                          | enforceable                                                                               |
|                    | `function-statements-limit`                                                                                                       | more than 15 statements                                                                                                     | enforceable                                                                               |
|                    | `function-control-nesting-limit`                                                                                                  | control nesting deeper than 2                                                                                               | enforceable                                                                               |
|                    | `function-parameters-limit`                                                                                                       | more than 3 parameters                                                                                                      | enforceable                                                                               |
|                    | `function-structure`, `class-structure`, `distribution`, `structure` summary                                                      | none                                                                                                                        | report-only (metrics)                                                                     |
| `duplicates`       | `duplicate-clone`                                                                                                                 | jscpd in `mild` mode over `src`; any new clone fails                                                                        | enforceable                                                                               |
|                    | `duplicate-clone-size`                                                                                                            | none                                                                                                                        | report-only (`lines`, `tokens`)                                                           |
| `dead-code`        | knip `files`, `exports`, `types`                                                                                                  | none: any new unused file, export or type fails                                                                             | enforceable                                                                               |
|                    | every other knip category (for example dependencies)                                                                              | none                                                                                                                        | report-only                                                                               |
| `coverage`         | `changed-branch-coverage`                                                                                                         | a changed branch with coverage below 95%                                                                                    | enforceable                                                                               |
|                    | `coverage` (per-file branch %), `test-efficiency` (`coveredBranchesPerTest`, `testCount`)                                         | none                                                                                                                        | report-only                                                                               |
| `crap`             | `crap-score-limit`                                                                                                                | CRAP score at or above 9; override with `QUALITY_CRAP_SCORE_LIMIT` (positive number)                                        | enforceable                                                                               |
|                    | `crap-coverage-unknown`                                                                                                           | function with unknown coverage and no CRAP score                                                                            | enforceable                                                                               |
|                    | `function-crap`, `crap` summary                                                                                                   | none                                                                                                                        | report-only (`complexity`, coverage percentages, `crap`)                                  |
| `mutation`         | `mutant-survived`, `mutant-nocoverage`                                                                                            | no score gate (`thresholds.break` is `null`); each new surviving or uncovered mutant fails                                  | enforceable                                                                               |
|                    | other mutant statuses, `mutation-summary`                                                                                         | none                                                                                                                        | report-only                                                                               |

Notes:

- Ordering and cost: `crap` depends on `coverage`; `coverage` and `mutation` share the
  `test-execution` concurrency group. `mutation` has a 30 minute timeout; `coverage` 5 minutes;
  `policy-tests`, `coding-standards`, `coupling`, `test-runtime`, `dead-code` and `crap` 2 minutes;
  `structure` and `duplicates` 1 minute.
- "No threshold" means the gate is differential: the finding fails because it is new, not because
  it crosses a numeric limit.
