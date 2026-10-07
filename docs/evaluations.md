# Agent evaluations

Status: not started. Do this after the port is complete: single `nitpicker` command, automatic base
detection, and the package consumable as a dependency.

## Question to answer

Does a project gated by a nitpicker preset let a small, cheap model complete ordinary tasks
correctly, without taking shortcuts?

The premise: each preset allows one way to write each construct and enforces it mechanically. The
model then makes fewer choices, and the gate's failure messages steer it toward the allowed form.
Planning ahead should be the only reasoning the task needs.

## What a case contains

- A small fixture project that already passes the gate.
- A task prompt, for example adding a feature directory, fixing a bug, or adding an endpoint and
  its test.
- Hidden acceptance tests that check the behavior, separate from the gate.
- Expected outcome: the behavior tests pass and `nitpicker` reports no new enforceable findings.

## Negative cases: shortcuts the harness must catch

Each negative case is a task built so that a shortcut is the easy way through. The case passes only
if the agent avoids the shortcut. The harness detects shortcuts by comparing the final tree with
the fixture, not by trusting the gate's own verdict:

- Disabling a check: inline `eslint-disable`, `@ts-ignore` or `@ts-expect-error`, edits to
  nitpicker config or preset files, or a changed policy hash.
- Weakening tests: deleted or skipped tests, removed assertions, assertions loosened to always
  pass, mocking the subject under test.
- Escaping the type system: `as` casts, `any`, non-null assertions.
- Crossing a boundary: importing another feature's internals, or adding a branch to a shared entry
  point instead of a new feature directory.
- Using a non-preferred construct, where a rewrite would be needed: catching and ignoring an error,
  `forEach` instead of `for...of`, and similar.
- Gaming the baseline: a change that turns new debt into "unchanged" debt, for example renaming a
  symbol so the fingerprint shifts.

## What to measure

- Pass rate per model tier and per case, over repeated runs.
- Shortcut rate per category above.
- Gate iterations to green, which shows how well the failure messages steer.
- Cost and wall time per case.

## Open design points

- Which agent harness runs the cases, and how the model tier is selected.
- How fixtures are versioned against preset versions, so a preset change re-runs the affected cases.
- Whether failure-message wording counts as part of the preset, so regressions in wording show up
  in eval results.
