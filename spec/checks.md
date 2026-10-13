# Nitpicker checks catalog

Every check category in the TypeScript preset, derived from `languages/typescript/preset/quality-checks.mjs`
and the adapters in `languages/typescript/adapters/`. Findings follow
[`findings.schema.json`](findings.schema.json). The `javascript` preset runs the same checks on `.js`, `.mjs`
and `.cjs` files (and on `.ts`, `.mts` and `.cts` files while a project migrates), so this catalog applies to
it unchanged.

How classification works:

- **enforceable**: a finding with `classification: "enforceable"` that is new relative to the base
  snapshot fails the gate (`newEnforceableFindings > 0`).
- **report-only**: `classification: "descriptive"`. Shown in the report (metric changes appear in
  `changedMetrics`) but never fails the gate. Only descriptive findings may carry a `metric`.
- `tool-error`: an analyzer that could not run. Not a check category; it sets
  `overallStatus: "tool-error"`.

Thresholds are the defaults in the preset. Where a value is not a hard-coded limit it says so.
The limits of the custom rules and the languages that enforce them come from
`shared/policy.mjs`; the [Custom rules](#custom-rules) table is generated from it
(`npm run gen:checks`) and a test fails when it is stale.

## ESLint checks

Each runs ESLint with a different config. Every ESLint message becomes an **enforceable** finding
(`rule` is the ESLint rule id). No numeric threshold: any new message fails.

A message is identified by its rule, message and the syntax it points at. A message on a whole
function is identified by the function's signature, not its body. A message inside a named
function whose code was edited keeps matching the base while the function has no more messages of
that rule and kind than on the base (a count ratchet); a message on a line the change touched, of a
strict rule, is still new, and so is a message on a line the change added. Rules that report a
number about a function (`sonarjs/cognitive-complexity`, `complexity`, `max-lines-per-function`,
`max-statements`, `max-params`, `max-depth`) fail an edited function only when that number rises.

| Check                   | Scope                              | Config                                                         | Status      |
| ----------------------- | ---------------------------------- | -------------------------------------------------------------- | ----------- |
| `eslint-lint`           | source and test globs              | `languages/typescript/preset/defaults/eslint.config.mjs`       | enforceable |
| `eslint-errors`         | production source (tests excluded) | `languages/typescript/preset/eslint-config/errors.mjs`         | enforceable |
| `eslint-logging`        | production source (tests excluded) | `languages/typescript/preset/eslint-config/logging.mjs`        | enforceable |
| `eslint-module-effects` | production source (tests excluded) | `languages/typescript/preset/eslint-config/module-effects.mjs` | enforceable |

## Entry points

| Check          | Rule                        | Threshold                                         | Status      |
| -------------- | --------------------------- | ------------------------------------------------- | ----------- |
| `entry-points` | `public-alternative-bypass` | none: importing around a public entry point fails | enforceable |

## Static checks

| Check                     | Rule                         | Threshold                                         | Status                                                             |
| ------------------------- | ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| `prettier-format`         | `prettier/prettier`          | none: any new or touched unformatted region fails | enforceable                                                        |
| `typescript-typecheck`    | `TS<code>` per diagnostic    | none: any new diagnostic fails                    | enforceable                                                        |
| `dependency-architecture` | dependency-cruiser rule name | rule severity                                     | `error` severity is enforceable; any other severity is report-only |

## Quality-area checks

| Check              | Rules (finding)                                                                                                                   | Default threshold                                                                                                                                | Status                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `policy-tests`     | the project's policy test suite                                                                                                   | all tests must pass; timeout 2 min                                                                                                               | enforced by failing the run (a non-zero vitest exit throws; the runner emits no findings) |
| `coding-standards` | `public-contract-production-use`, `runtime-boundary/*`, `callback-protocol/*`, ESLint coding-standard rules, `baseline-expansion` | new sites beyond the legacy baseline (`languages/typescript/preset/coding-standards/legacy-sites.json`); raising a baseline allowance also fails | enforceable                                                                               |
| `coupling`         | `stability-direction`                                                                                                             | see [Custom rules](#custom-rules)                                                                                                                | enforceable                                                                               |
|                    | `module-coupling`, `package-coupling`, `stability-direction-metric`, `coupling` summary                                           | none                                                                                                                                             | report-only (metrics: fan-in/out, instability, cohesion, `instabilityDelta`)              |
| `test-runtime`     | `no-production-runtime`, `type-only-production-dependency`                                                                        | see [Custom rules](#custom-rules)                                                                                                                | enforceable                                                                               |
|                    | `category-count`, `test-runtime` summary                                                                                          | none                                                                                                                                             | report-only                                                                               |
| `structure`        | `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`                | per-function limits: see [Custom rules](#custom-rules)                                                                                           | enforceable                                                                               |
|                    | `function-structure`, `class-structure`, `distribution`, `structure` summary                                                      | none                                                                                                                                             | report-only (metrics)                                                                     |
| `duplicates`       | `duplicate-clone`                                                                                                                 | see [Custom rules](#custom-rules)                                                                                                                | enforceable                                                                               |
|                    | `duplicate-clone-size`                                                                                                            | none                                                                                                                                             | report-only (`lines`, `tokens`)                                                           |
| `dead-code`        | knip `files`, `exports`, `types`                                                                                                  | none: any new unused file, export or type fails                                                                                                  | enforceable                                                                               |
|                    | every other knip category (for example dependencies)                                                                              | none                                                                                                                                             | report-only                                                                               |
| `coverage`         | `changed-branch-coverage`                                                                                                         | see [Custom rules](#custom-rules)                                                                                                                | enforceable                                                                               |
|                    | `coverage` (per-file branch %), `test-efficiency` (`coveredBranchesPerTest`, `testCount`)                                         | none                                                                                                                                             | report-only                                                                               |
| `crap`             | `crap-score-limit`                                                                                                                | see [Custom rules](#custom-rules)                                                                                                                | enforceable                                                                               |
|                    | `crap-coverage-unknown`                                                                                                           | see [Custom rules](#custom-rules)                                                                                                                | enforceable                                                                               |
|                    | `function-crap`, `crap` summary                                                                                                   | none                                                                                                                                             | report-only (`complexity`, coverage percentages, `crap`)                                  |
| `mutation`         | `mutant-survived`, `mutant-nocoverage`                                                                                            | see [Custom rules](#custom-rules)                                                                                                                | enforceable                                                                               |
|                    | other mutant statuses, `mutation-summary`                                                                                         | none                                                                                                                                             | report-only                                                                               |

## Custom rules

Generated from `shared/policy.mjs`. "enforced" means the language's adapter produces the
rule and it fails the gate; "not enforced" means the check does not exist for that language yet.

The function limits and the CRAP score limit ratchet: editing a function that was already over a
limit on the base fails only when the change raises that metric (lines, statements, nesting,
parameters, or the CRAP score). A function the change pushes over a limit, and a new function over
a limit, fail as usual. The failure of a function that got worse names the base value ("grew from 68
to 72 lines"); a touched function that did not get worse is listed in the report as "Touched, still
over limit" and does not fail.

<!-- generated:custom-rules begin (npm run gen:checks) -->

| Rule                              | Check              | Default limit                                                                                                  | TypeScript | Java         | Python       | Kotlin       |
| --------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | ------------ | ------------ |
| `function-lines-limit`            | `structure`        | more than 50 lines                                                                                             | enforced   | enforced     | not enforced | not enforced |
| `function-statements-limit`       | `structure`        | more than 15 statements                                                                                        | enforced   | enforced     | not enforced | not enforced |
| `function-control-nesting-limit`  | `structure`        | control nesting deeper than 2                                                                                  | enforced   | enforced     | not enforced | not enforced |
| `function-parameters-limit`       | `structure`        | more than 3 parameters                                                                                         | enforced   | enforced     | not enforced | not enforced |
| `crap-score-limit`                | `crap`             | CRAP score at or above 9; override with `QUALITY_CRAP_SCORE_LIMIT` (positive number) or `thresholds.crapLimit` | enforced   | enforced     | not enforced | not enforced |
| `crap-coverage-unknown`           | `crap`             | function with unknown coverage and no CRAP score                                                               | enforced   | enforced     | not enforced | not enforced |
| `changed-branch-coverage`         | `coverage`         | a changed branch with coverage below 95%                                                                       | enforced   | enforced     | not enforced | enforced     |
| `mutant-survived`                 | `mutation`         | no score gate (`thresholds.break` is `null`); each new surviving mutant fails                                  | enforced   | enforced     | not enforced | not enforced |
| `mutant-nocoverage`               | `mutation`         | no score gate (`thresholds.break` is `null`); each new uncovered mutant fails                                  | enforced   | enforced     | not enforced | not enforced |
| `duplicate-clone`                 | `duplicates`       | jscpd in `mild` mode; any new clone fails                                                                      | enforced   | enforced     | not enforced | not enforced |
| `stability-direction`             | `coupling`         | a package depending on a less stable package                                                                   | enforced   | enforced     | not enforced | not enforced |
| `no-production-runtime`           | `test-runtime`     | a test must exercise production runtime code                                                                   | enforced   | not enforced | not enforced | not enforced |
| `type-only-production-dependency` | `test-runtime`     | a test must exercise production runtime code                                                                   | enforced   | not enforced | not enforced | not enforced |
| `baseline-expansion`              | `coding-standards` | raising a legacy baseline allowance fails                                                                      | enforced   | enforced     | not enforced | not enforced |
| `public-alternative-bypass`       | `entry-points`     | none: importing around a public entry point fails                                                              | enforced   | not enforced | not enforced | not enforced |

<!-- generated:custom-rules end -->

Notes:

- Ordering and cost: `crap` depends on `coverage`; `coverage` and `mutation` share the
  `test-execution` concurrency group. `mutation` has a 30 minute timeout; `coverage` 5 minutes;
  `policy-tests`, `coding-standards`, `coupling`, `test-runtime`, `dead-code` and `crap` 2 minutes;
  `structure` and `duplicates` 1 minute.
- "No threshold" means the gate is differential: the finding fails because it is new, not because
  it crosses a numeric limit.
- Kotlin runs PIT and reports its mutants, but as descriptive findings that never fail (plain PIT
  on Kotlin bytecode reports mostly compiler-generated mutants), so `mutant-survived` and
  `mutant-nocoverage` are "not enforced" for Kotlin. Numbers and the decision:
  [kotlin-preset.md](../docs/kotlin-preset.md).
