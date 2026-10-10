# Shard weights

`shardWeight` on each check in `languages/typescript/preset/quality-checks.mjs` is the cost estimate that
`nitpicker --shard-count/--shard-index` uses to spread analyzers over CI shards (greedy
longest-first over dependency components, see `core/diff/sharding.mjs`). Only the relative sizes
matter. The original numbers were tuned on the codebase nitpicker was ported from; this note records
the retune from measurements on TypeScript projects, and how to repeat it.

## Method

`scripts/measure-shard-weights.mjs` builds a throwaway git project, installs the packed
nitpicker into it (npm 11, like the installed-consumer test), commits a baseline on `main`, edits a
few files on a `feature` branch, then times `nitpicker --base main --analyzer <name> --output ...`
for every configured analyzer, one at a time, `--runs` times each (median kept). Each number is the
whole differential cost: base worktree plus head, including process start-up and tool resolution.

- An analyzer with dependencies runs them too, so its own cost is its time minus its dependencies'
  (`crap` = `crap` run minus `coverage` run, floored at zero).
- An analyzer that exits with a tool error (2+) is reported under `failed` and left out, because the
  time of an early bail-out says nothing about its cost.
- `--blend a.json b.json ...` turns several reports into weights: each analyzer's mean share of a
  fixture's total own cost (over the fixtures where it ran), scaled so the weights sum to about 200.
  Shares rather than seconds, so a 4-file project and a 100-file one count equally.

```sh
cd typescript
for fixture in self consumer generated; do
  node scripts/measure-shard-weights.mjs --fixture "$fixture" --runs 3 --json "$fixture.json"
done
node scripts/measure-shard-weights.mjs --blend self.json consumer.json generated.json
# or measure any real project: --project <git root on a feature branch> --base main
```

Fixtures:

| Fixture     | What it is                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consumer`  | The installed-consumer test's project (one source file) plus one real passing test. Mostly fixed per-run overhead.                                                                     |
| `self`      | This package's own `core/`, `shared/`, `languages/` (about 110 files, 17k lines) relocated under `src/main/`, renamed `.mjs` to `.ts`. Tests that need the package layout are dropped. |
| `generated` | 40 small type-clean TypeScript modules with branching logic, each with a unit test. Large enough for mutation testing to take measurable time.                                         |

Limits worth knowing: `self` is JavaScript renamed to `.ts`, so it does not type-check and Stryker
refuses to run on it (`mutation` is therefore absent from its column and from its shares).
`generated` is synthetic. Neither is a large real application, and per-analyzer fixed overhead
(2 to 5 s here) flattens the small checks; on a bigger consumer the heavy analyzers pull further
ahead. Re-measure on a real consumer when one is available.

## Measurements

Median of 3 serial runs, seconds, Node 22.22, 4 vCPU Linux container, 2026-10-08. "Weight" is the
new `shardWeight`; "old" is the value before this change.

| Analyzer                  | consumer |  self | generated | old | weight |
| ------------------------- | -------: | ----: | --------: | --: | -----: |
| `eslint-lint`             |      6.4 |  23.5 |      12.7 |  49 |     25 |
| `eslint-errors`           |      3.5 |   5.7 |       5.1 |   4 |      9 |
| `eslint-logging`          |      4.0 |   5.5 |       5.2 |   5 |      9 |
| `eslint-module-effects`   |      4.4 |   7.8 |       4.9 |   4 |     11 |
| `entry-points`            |      2.9 |   4.3 |       4.0 |   8 |      7 |
| `prettier-format`         |      2.1 |   7.9 |       3.6 |  24 |      8 |
| `typescript-typecheck`    |      3.7 |   6.7 |       3.5 |  17 |      9 |
| `dependency-architecture` |      2.9 |   4.7 |       3.4 |   9 |      7 |
| `coding-standards`        |      4.0 |   7.2 |       4.3 |  17 |     10 |
| `coupling`                |      2.8 |   5.0 |       3.4 |   8 |      7 |
| `test-runtime`            |      3.9 |   5.9 |       4.9 |   9 |      9 |
| `structure`               |      2.0 |   2.5 |       1.8 |   2 |      4 |
| `duplicates`              |      1.4 |   1.1 |       1.2 |   1 |      2 |
| `dead-code`               |      2.6 |   2.2 |       2.5 |   4 |      5 |
| `coverage`                |      3.3 |  12.7 |      16.8 | 154 |     16 |
| `crap` (incl. coverage)   |      4.2 |  14.4 |      16.2 |   2 |      2 |
| `mutation`                |     17.1 | fails |     140.7 |  58 |     90 |

`policy-tests` is not a diff analyzer (it is filtered out of the sharded catalogue), so it was not
measured and keeps its old weight of 21.

## What changed and why

- `mutation` is the heaviest check by far and grows with source size times test time: 90 (was 58).
- `coverage` was overweight at 154: it is one test run, a fraction of one mutation run: 16.
- `crap` adds almost nothing on top of `coverage`: unchanged at 2. The scheduler keeps the two in
  one component, so their weights add.
- `eslint-lint` (type-aware, whole tree) is the heaviest static check but about half the old figure
  relative to the rest: 25 (was 49).
- `prettier-format` and `typescript-typecheck` were overweight (24 and 17): about 8 and 9.
- The remaining ESLint subsets and graph checks sit at the process-overhead floor, 7 to 11.

Resulting plans (sum of weights per shard): 2 shards 115/115, 3 shards 90/71/69, 4 shards
90/46/47/47. `mutation` alone is the lower bound on any plan. The previous 3-shard plan was
156/110/109.

## Tests

`languages/typescript/preset/shard-weights.test.mjs` asserts only the relative ordering (mutation above
coverage above the static checks, `crap` small relative to `coverage`, full lint above the focused
lints, every weight a positive integer) and tests the helpers. It does not assert timings or exact
weights, so re-measuring does not require changing it unless the shape genuinely changes.
