# Comparison with existing tools

Nitpicker is a differential gate: it analyzes a base and a head snapshot, matches findings between
them, and fails only on new enforceable findings. This page compares that design with four existing
approaches, on two points: the split between enforceable and report-only findings, and
fingerprints that survive renames.

Source status. Statements marked [web] were checked against the cited pages on 2026-10-08. Statements
marked [memory] are from the author's background knowledge and were not re-verified; check them
before relying on them.

## What nitpicker does

- Every finding is classified `enforceable`, `descriptive`, or `tool-error`
  (`typescript/core/diff/finding-schema.mjs`). Only new enforceable findings (and tool errors) fail
  the gate; descriptive findings such as metrics are reported as deltas and never fail it.
- A finding's identity key is tool, rule, path, symbol, analyzer-provided identity, classification
  and metric name (`typescript/core/diff/fingerprint.mjs`). It has no line number, so inserting
  lines above a finding does not make it new. Renames detected by `git diff --find-renames` are
  applied to the base paths before matching, so a moved file does not turn its findings into
  new-plus-resolved.
- Cost of this design: it analyzes the base snapshot as well as the head, and an unchanged finding
  inside an edited region stays baselined today (the strict preset plans to promote those; see
  `docs/typescript-strict-preset.md`).

## SonarQube new code

- New code is defined per project or branch as one of: previous version, number of days (default
  30, maximum 90), a specific analysis, or a reference branch. The built-in "Sonar way" quality
  gate applies its conditions to new code only; in pull request analysis, new code is the change
  against the target branch and only issues on it are reported. [web: SonarQube Server "About new
  code" docs, https://docs.sonarsource.com/sonarqube-server/user-guide/about-new-code]
- Enforceable versus report-only: the split is made by quality gate conditions, which are
  configurable per metric (for example, fail on new bugs, vulnerabilities, coverage on new code).
  Overall-code results are shown but are not gated by the default gate. The unit is a metric
  threshold, not a per-rule classification of a finding. [web for new-code-only gating, memory for
  the configurable conditions]
- Matching issues across analyses uses server-side issue tracking, which in my understanding matches
  by rule, file and line-content hashes, and handles moved code to a degree. [memory, not verified]
  Sonar is time- or branch-based: an issue is "new" because of when it appeared in code, so an
  untouched legacy issue in a rewritten file can count as new. Nitpicker instead compares two
  snapshots directly and needs no server.

## Qodana baselines

- A baseline is a snapshot of problems from one analysis of a branch, stored as
  `baseline.sarif.json` (default `.qodana/baseline.sarif.json`, or `--baseline <path>`). Results
  are grouped as unchanged, new, and absent (resolved; shown with `--baseline-include-absent`).
  New problems stay "new" until added to the baseline file and rerun. [web:
  https://www.jetbrains.com/help/qodana/baseline.html]
- The page does not say how matching works. Qodana results are SARIF, and I understand they carry
  fingerprints used for matching, but this was not verified. [memory]
- Enforceable versus report-only: Qodana has quality gates (failure thresholds on problem counts
  by severity) that can be applied to new problems; there is no per-finding classification as in
  nitpicker. [memory, not verified]
- Difference: the baseline is a committed file the team must refresh by hand. Nitpicker recomputes
  the base from git on every run, so there is nothing to keep in sync, at the cost of analyzing
  twice.

## SARIF baseline matching

- SARIF 2.1.0 defines `baselineState` on a result (`new`, `unchanged`, `updated`, `absent`) and
  `fingerprints` / `partialFingerprints`, described as stable values a result management system
  can use to identify a result over time; versioned partial fingerprint names such as
  `name/v1` are treated as newer than unversioned ones. [web for fingerprint definition and
  versioning: OASIS spec, https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html;
  memory for the `baselineState` value list, whose spec section was not reached]
- SARIF specifies the vocabulary and the fields, not the algorithm. How two runs are matched, and
  what is enforced, is left to the consuming system. Tools commonly compute a partial fingerprint
  from the source line text, which is stable under line shifts but not under edits to that line.
  [memory]
- Relation to nitpicker: this is the closest standard. Nitpicker's key plays the role of a partial
  fingerprint, with explicit rename remapping, and its `classification` has no SARIF equivalent
  (SARIF `level` is severity, not enforcement). Emitting SARIF from nitpicker with `baselineState`
  set from the comparison would be a natural export; it is not implemented.

## reviewdog

- Reviewdog filters any linter's output to the lines in a diff. Filter modes: `added` (default;
  added or modified lines), `diff_context` (lines near changes), `file` (any changed file), and
  `nofilter`. It exits 0 by default (`-fail-level=none`) and exits 1 when a result reaches the
  configured severity (`-fail-level`, `-fail-on-error`). [web: https://github.com/reviewdog/reviewdog]
- Enforceable versus report-only: governed by severity level and filter mode, per run. A finding on
  an untouched line is dropped before it can fail anything.
- Matching: purely positional, from the diff. There is no fingerprint, so there is no concept of
  an old finding moving: a finding is new if its line is in the diff. Moving or reformatting code
  makes its findings new; a rename with no content change shows no diff lines and so no findings.
- Difference: reviewdog needs no base analysis (cheap and linter-agnostic) but cannot gate
  graph-level or metric findings that have no line, such as cycles or duplication totals.
  Nitpicker's identity keys handle those. Reviewdog's line model is what the strict preset's
  planned touched-code promotion borrows (changed hunks decide what is held to strict rules).

## Summary

| Tool               | Enforceable vs report-only                      | Matching across runs                       | Rename stable         |
| ------------------ | ----------------------------------------------- | ------------------------------------------ | --------------------- |
| Nitpicker          | Per-finding classification; gate on enforceable | Identity key, no line; base re-analyzed    | Yes, git rename map   |
| SonarQube new code | Quality gate conditions on new-code metrics     | Server-side issue tracking [memory]        | Not verified [memory] |
| Qodana baseline    | Baseline file plus quality gate thresholds      | Baseline SARIF file; method not documented | Not verified [memory] |
| SARIF              | Not in scope (`level` is severity)              | `fingerprints` / `partialFingerprints`     | Producer-defined      |
| reviewdog          | Severity and filter mode                        | Diff lines only                            | No fingerprint at all |

The narrow gap nitpicker fills: a per-finding enforceable/report-only classification that is part of
the data model, combined with explicit, git-derived rename-stable identity and no baseline file to
maintain. The costs are twice-analysis and that identity quality depends on each analyzer providing
a good `identity`.
