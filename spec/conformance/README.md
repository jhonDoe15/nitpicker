# Nitpicker conformance fixtures

Language-neutral fixtures for the comparison step every Nitpicker core must implement: given the
findings of a base snapshot and a head snapshot, decide which are new, resolved, unchanged or have a
changed metric, and find the merge base and renames in git. Findings follow
[`../findings.schema.json`](../findings.schema.json). The TypeScript core is the reference; its
test `core/diff/comparison/conformance.test.mjs` runs every fixture here, so the fixtures cannot
drift from it.

## Findings cases: `findings/<case>/`

| File            | Content                                                               |
| --------------- | --------------------------------------------------------------------- |
| `base.json`     | Analyzer report (`{ "findings": [...] }`) for the base snapshot.      |
| `head.json`     | Analyzer report for the head snapshot.                                |
| `expected.json` | `description`, optional `renames`, then either results or an `error`. |

Runner contract:

1. Parse `base.json` and `head.json` as analyzer reports. Parsing normalizes paths (backslashes to
   `/`, leading `./` removed), so expected paths are normalized.
2. Compare with `renames` (an object mapping base paths to head paths; empty when absent). Renames
   apply to the base side only: they remap a base finding's path and every occurrence of an old path
   inside its `identity`, longest old path first.
3. Before matching: a finding with `toolNotRun: true` covers the project directories listed in its
   `notRunScope` (`.` is the whole project; parsing reads `./` as `.` and rejects an empty string),
   or the whole project without one. A base notice also covers the head path of each renamed file
   whose base path lies in one of its directories; directories themselves never follow a move.
   Every `enforceable` head finding of the same `tool` whose `path` lies in a directory or equals a
   file a base notice covers becomes `descriptive`. A head finding with `toolNotRun: true` becomes
   `tool-error` (the change broke the tool) unless a base notice of the same `tool` has the same
   key (step 4, after renames) or the base notices of that `tool` together cover each of its
   directories; the runner reports a new `tool-error` finding as a tool error. A module renamed
   as a whole therefore turns its head notice into a `tool-error`, while the findings of its
   renamed files stay `descriptive`.
4. Two findings match when tool, rule, (renamed) path, symbol (empty when absent), (renamed)
   identity, classification and metric name (empty when absent) are all equal. Message and location
   are not compared. Two findings with the same key in one snapshot are an error.
5. Compare the outputs with `expected.json`:
   - `new`: head findings with no base match. `resolved`: base findings with no head match.
     `unchanged`: head findings with a base match whose metric did not change.
   - Each entry lists `tool`, `rule`, `path`, `symbol` (only if present), `identity` and
     `classification`; compare exactly those fields. The lists are ordered by tool, path, rule,
     identity.
   - `changedMetrics`: matches where both findings are `descriptive`, both have a metric of the same
     name, and the values differ. Entries have `tool`, `rule`, `path`, `identity`, `metric`,
     `baseValue`, `headValue`, `delta` (head minus base).
   - `error`: the comparison must fail, and the error message must contain this text. No results are
     expected.

## Git cases: `git/<case>/`

Repositories are not stored. `build.sh <empty-dir>` creates one deterministically (fixed identity and
dates; shared helpers in `git/lib.sh`; needs only POSIX `sh` and `git`). It tags the commits that
`expected.json` refers to.

| `expected.json` field | Meaning                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `baseRef`             | Ref to compare against; resolved in the built repository.                      |
| `projectPath`         | Analyzed project directory relative to the repository root (`.` for the root). |
| `mergeBase`           | Tag of the commit that must be the merge base of `baseRef` and `HEAD`.         |
| `head`                | Tag of the commit that must be `HEAD`.                                         |
| `renames`             | Expected base-to-head rename map, with paths relative to `projectPath`.        |
| `error`               | Instead of the fields above: the failure message must contain this text.       |

Runner contract: build the repository, resolve `baseRef` and `HEAD`, find the merge base of the two,
and compute renames between the merge base and `HEAD` with git's default rename detection, limited
to `projectPath` and reported relative to it. Compare the merge base and head commits (resolve tags
to ids) and the rename map with `expected.json`. Only renames count, not copies, additions or
deletions.

## How a language core runs them

Walk both directories; each subdirectory is one case. Implement a small test that drives the core's
own comparison and git functions and asserts the comparisons above. Skip nothing: a core is
conformant when every case passes. Add a case here, with its expected output verified against the
TypeScript core, before changing shared behavior.
