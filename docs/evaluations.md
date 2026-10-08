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

## Decisions

Status: Proposed, pending owner review. Each answer is a recommendation to accept or change in
review. These replace the open design points above once accepted.

### Agent harness and model-tier selection

Recommendation: drive the Claude Agent SDK (the same loop as Claude Code) from a small runner, with
a fixed tool set (read, edit, shell) and the fixture's `nitpicker` command as the only gate.

- One harness for every tier keeps results comparable; only the model identifier changes.
- The tier is a runner parameter, not part of a case: `--model <id>` selects it, and a run record
  stores the exact model id, harness version, and nitpicker and preset versions.
- Start with the smallest and the middle tier, so the question ("does a small, cheap model finish
  correctly") has a direct answer and a reference point. Add the largest tier only as a ceiling
  when a case fails on both.
- Fix temperature and turn and token budgets per run; repeat each case a set number of times (start
  at 5) because single runs are noisy.
- The agent works in a throwaway copy of the fixture with no network beyond the model API. Hidden
  acceptance tests and the shortcut detectors live outside that copy.

### Fixture versioning against preset versions

Recommendation: each fixture pins the preset version it was built against, and a preset release
re-runs only the cases whose pin is behind it.

- Fixtures are plain directories with a `fixture.json` holding `presetVersion` and the policy hash
  of a passing tree. CI verifies a fixture still passes the gate with its pinned preset (no agent,
  cheap) on every preset change.
- A preset change that alters a rule, its message, or the layout bumps the version. The eval runner
  selects cases by comparing the pin with the current version, runs them, and then updates the pin
  only after the fixture passes the new gate.
- Never edit a fixture to hide a regression: a fixture changes in a commit separate from the preset
  change that forced it, so the review shows both.

### Is failure-message wording part of the preset

Recommendation: yes. The messages are the steering mechanism the evaluation tests.

- Treat the message text of each rule as part of the preset's public surface. A wording change is a
  preset version bump and re-runs the affected cases.
- Record in each run which messages the agent saw and how many gate iterations it needed, so a
  wording regression appears as more iterations or a lower pass rate rather than going unnoticed.
- Keep a snapshot test of rule messages in the preset so an unintended wording change fails CI
  before any eval runs.

### Where cases live

Recommendation: start in this repository under `evals/`, and move to a separate repository only if
cases outgrow it.

- Cases need the unreleased preset to test changes, which is easiest in the same repo and one PR.
- Fixtures install nitpicker like a consumer (from the built package, not from source paths), so the
  suite also checks that the package is consumable as a dependency.
- Agent runs cost money and are slow, so they never run in the normal CI test job: they run on
  demand and on a schedule, while the fixture-passes-the-gate check runs on every push.
- Reason to split later: a consumer-owned repo adds realism and keeps cost and secrets out of this
  one. The case format above is directory-based and does not depend on the repo, so the move is a
  copy.
