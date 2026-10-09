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
The limits of the custom rules and the languages that enforce them come from
`typescript/shared/policy.mjs`; the [Custom rules](#custom-rules) table is generated from it
(`npm run gen:checks` in `typescript/`) and a test fails when it is stale.

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
| `coupling`         | `stability-direction`                                                                                                             | see [Custom rules](#custom-rules)                                                                                           | enforceable                                                                               |
|                    | `module-coupling`, `package-coupling`, `stability-direction-metric`, `coupling` summary                                           | none                                                                                                                        | report-only (metrics: fan-in/out, instability, cohesion, `instabilityDelta`)              |
| `test-runtime`     | `no-production-runtime`, `type-only-production-dependency`                                                                        | see [Custom rules](#custom-rules)                                                                                           | enforceable                                                                               |
|                    | `category-count`, `test-runtime` summary                                                                                          | none                                                                                                                        | report-only                                                                               |
| `structure`        | `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`                | per-function limits: see [Custom rules](#custom-rules)                                                                      | enforceable                                                                               |
|                    | `function-structure`, `class-structure`, `distribution`, `structure` summary                                                      | none                                                                                                                        | report-only (metrics)                                                                     |
| `duplicates`       | `duplicate-clone`                                                                                                                 | see [Custom rules](#custom-rules)                                                                                           | enforceable                                                                               |
|                    | `duplicate-clone-size`                                                                                                            | none                                                                                                                        | report-only (`lines`, `tokens`)                                                           |
| `dead-code`        | knip `files`, `exports`, `types`                                                                                                  | none: any new unused file, export or type fails                                                                             | enforceable                                                                               |
|                    | every other knip category (for example dependencies)                                                                              | none                                                                                                                        | report-only                                                                               |
| `coverage`         | `changed-branch-coverage`                                                                                                         | see [Custom rules](#custom-rules)                                                                                           | enforceable                                                                               |
|                    | `coverage` (per-file branch %), `test-efficiency` (`coveredBranchesPerTest`, `testCount`)                                         | none                                                                                                                        | report-only                                                                               |
| `crap`             | `crap-score-limit`                                                                                                                | see [Custom rules](#custom-rules)                                                                                           | enforceable                                                                               |
|                    | `crap-coverage-unknown`                                                                                                           | see [Custom rules](#custom-rules)                                                                                           | enforceable                                                                               |
|                    | `function-crap`, `crap` summary                                                                                                   | none                                                                                                                        | report-only (`complexity`, coverage percentages, `crap`)                                  |
| `mutation`         | `mutant-survived`, `mutant-nocoverage`                                                                                            | see [Custom rules](#custom-rules)                                                                                           | enforceable                                                                               |
|                    | other mutant statuses, `mutation-summary`                                                                                         | none                                                                                                                        | report-only                                                                               |

## Custom rules

Generated from `typescript/shared/policy.mjs`. "enforced" means the language's adapter produces the
rule and it fails the gate; "not enforced" means the check does not exist for that language yet.

<!-- generated:custom-rules begin (npm run gen:checks) -->

| Rule                              | Check              | Default limit                                                                                                  | TypeScript | Java         |
| --------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------ |
| `function-lines-limit`            | `structure`        | more than 50 lines                                                                                             | enforced   | enforced     |
| `function-statements-limit`       | `structure`        | more than 15 statements                                                                                        | enforced   | enforced     |
| `function-control-nesting-limit`  | `structure`        | control nesting deeper than 2                                                                                  | enforced   | enforced     |
| `function-parameters-limit`       | `structure`        | more than 3 parameters                                                                                         | enforced   | enforced     |
| `crap-score-limit`                | `crap`             | CRAP score at or above 9; override with `QUALITY_CRAP_SCORE_LIMIT` (positive number) or `thresholds.crapLimit` | enforced   | enforced     |
| `crap-coverage-unknown`           | `crap`             | function with unknown coverage and no CRAP score                                                               | enforced   | enforced     |
| `changed-branch-coverage`         | `coverage`         | a changed branch with coverage below 95%                                                                       | enforced   | enforced     |
| `mutant-survived`                 | `mutation`         | no score gate (`thresholds.break` is `null`); each new surviving mutant fails                                  | enforced   | enforced     |
| `mutant-nocoverage`               | `mutation`         | no score gate (`thresholds.break` is `null`); each new uncovered mutant fails                                  | enforced   | enforced     |
| `duplicate-clone`                 | `duplicates`       | jscpd in `mild` mode; any new clone fails                                                                      | enforced   | enforced     |
| `stability-direction`             | `coupling`         | a package depending on a less stable package                                                                   | enforced   | not enforced |
| `no-production-runtime`           | `test-runtime`     | a test must exercise production runtime code                                                                   | enforced   | not enforced |
| `type-only-production-dependency` | `test-runtime`     | a test must exercise production runtime code                                                                   | enforced   | not enforced |
| `baseline-expansion`              | `coding-standards` | raising a legacy baseline allowance fails                                                                      | enforced   | enforced     |
| `public-alternative-bypass`       | `entry-points`     | none: importing around a public entry point fails                                                              | enforced   | not enforced |

<!-- generated:custom-rules end -->

Notes:

- Ordering and cost: `crap` depends on `coverage`; `coverage` and `mutation` share the
  `test-execution` concurrency group. `mutation` has a 30 minute timeout; `coverage` 5 minutes;
  `policy-tests`, `coding-standards`, `coupling`, `test-runtime`, `dead-code` and `crap` 2 minutes;
  `structure` and `duplicates` 1 minute.
- "No threshold" means the gate is differential: the finding fails because it is new, not because
  it crosses a numeric limit.
