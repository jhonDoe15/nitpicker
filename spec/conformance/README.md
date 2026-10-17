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
3. Two findings match when tool, rule, (renamed) path, symbol (empty when absent), (renamed)
   identity, classification and metric name (empty when absent) are all equal. Message and location
   are not compared. Two findings with the same key in one snapshot are an error.
4. Then match by tokens. A finding may carry `tokens`, a list of strings (the words of its
   message). A head finding with tokens and no match from step 3 is similar to a base finding with
   tokens and no match from step 3 when tool, rule, (renamed) path and classification are equal,
   both have the same number of tokens, that number is at least 3, and the tokens are equal except
   at one position at most, where they form an _opaque change_. Pair similar findings with a maximum
   bipartite matching (each finding in at most one pair), taking head findings and candidate base
   findings in identity order. A paired head finding is `unchanged`; a paired base finding is not
   `resolved`.
   - An opaque change is two tokens that, without their leading and trailing characters that are
     not letters or digits, are both lowercase letters and digits of at least 5 characters, and at
     least one of them has a run of 4 consonants (`b-d`, `f-h`, `j-n`, `p-t`, `v-z`), fewer than
     0.2 vowels (`aeiou`) per character, or both a letter and a digit.
   - A token with a backtick is never part of an opaque change.
   - A token containing `<id>`, or a letter or digit next to a `<name>` placeholder, stands for a
     random value: it forms an opaque change with a token that is plain as defined above, and `<n>`
     forms one with `<id>`.
5. Compare the outputs with `expected.json`:
   - `new`: head findings with no base match (steps 3 and 4). `resolved`: base findings with no head
     match. `unchanged`: head findings with a base match whose metric did not change.
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
