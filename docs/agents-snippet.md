# Agent guidance snippet

Optional. Copy the section below into your project's `AGENTS.md` (or `CLAUDE.md`) so a coding agent
runs nitpicker and handles its findings correctly. Every statement in it matches
[Using nitpicker](usage.md); keep the two in step.

---

## Quality gate (nitpicker)

This project uses nitpicker, a differential quality gate. It compares your checkout with the merge
base and fails only on **new enforceable findings**. Existing debt is baselined and never fails.

### Run it

- `npx nitpicker` checks your changes (committed, staged, unstaged and untracked) against the merge
  base. Run it from anywhere inside the project, and run it before you finish a task.
- `npx nitpicker --fix` first applies ESLint and Prettier fixes to the changed files, then runs the
  comparison. Use it to clear formatting and auto-fixable lint findings. It cannot be combined with
  `--all`.
- `npx nitpicker --base <ref>` compares against a specific ref when the default base is wrong (for
  example `--base origin/develop`).
- `npx nitpicker --all` reports every finding in the checkout, with no baseline. It exits 1 on any
  violation, so use it to survey existing code, not as your pass/fail check. It cannot be combined
  with `--base`, `--fix`, sharding or `--defer-exit`.
- `--rule <substring>` lists the findings whose rule matches, after the summary. `--analyzer <name>`
  runs one analyzer only, which is faster while iterating.

### Exit codes

| Code | Meaning                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 0    | Completed with no new enforceable findings. Done.                                                                |
| 1    | At least one new enforceable finding, even if a tool also errored. Fix and rerun.                                |
| 2    | A tool error and no new enforceable findings, invalid arguments, invalid config, or any other failure to decide. |

A full run takes minutes and prints a progress line to stderr for each slow, failed or skipped analyzer. Wait for it: do
not start a second run or kill it. A second run in the same project exits 2 at once with `another run is in progress`.

Exit 2 is not a pass. Tool errors are listed and recorded even when the exit is 1. Read the tool errors, fix the cause (a missing peer such as `vitest` or
`typescript`, a bad `nitpicker.config.json`, a wrong `--base`) and rerun.

### Read the report

The console summary lists each new code violation as `<tool>/<rule> <path>:<line>` followed
by its message. A change to `nitpicker.config.json` that checks less is not listed that way: it
appears under "Policy changed in this change", followed by `Unapproved policy changes
(nitpicker-config/policy-loosened): N`, and fails the run. Full reports are written to
`reports/quality/diff/` (`reports/quality/snapshot/`
for `--all`):

- `report.txt`: the readable report. Start here.
- `new-findings.json`: the new findings that count against you. Each has a tool, rule, path,
  location and message.
- `resolved-findings.json` and `changed-metrics.json`: informational.
- `tool-errors.json`: the tool errors, whatever the exit code.
- `summary.json` and `report.junit.xml`: totals and CI output.

Only new enforceable findings fail the run. Resolved and unchanged findings, descriptive findings
and metric changes are reported but never fail.

### Handle a finding

1. Read the message. It says what is wrong.
2. Fix the code so the finding goes away, then rerun `npx nitpicker` until it exits 0.
3. **Never suppress a finding.** Do not add `eslint-disable` comments, `@ts-ignore` or
   `@ts-expect-error`, edit the rule configuration, add to `exclude`, `disable` or `exceptions` in
   `nitpicker.config.json`, add to `nitpicker.legacy.json`, mark a file you wrote as generated
   (`@generated`, `DO NOT EDIT`), or delete or weaken tests to make the gate pass. Those overrides are listed in the report and change the policy hash, so they are
   visible in review. Never pass `--accept-policy-change` or set `NITPICKER_ACCEPT_POLICY_CHANGE`:
   a `nitpicker-config/policy-loosened` finding means stop and ask a person to review the change.
4. If a finding looks wrong, or fixing it needs a decision you cannot make, stop and ask the
   maintainer. Do not work around it.
