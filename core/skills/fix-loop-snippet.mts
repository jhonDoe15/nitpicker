import {
  HELD_NOTE,
  NARROWED_SENTENCE,
  NO_PIPE,
  numbered,
  QUICK_SENTENCE,
  REPORT_FILES,
  REPORT_FOLDER,
  TROUBLESHOOTING,
  wrap,
} from './fix-loop-text.mts';

const EXIT_ROWS: readonly (readonly [string, string])[] = [
  [
    '0',
    'Completed with no new enforceable findings. Done, unless the run was narrowed with ' +
      '`--analyzer` or `--quick`.',
  ],
  [
    '1',
    'At least one new enforceable finding or a failing head test, even if a tool also errored. ' +
      'Fix and rerun.',
  ],
  [
    '2',
    'A tool error and no new enforceable findings or failing head tests, invalid arguments, ' +
      'invalid config, or any other failure to decide.',
  ],
];

function table(): string {
  const rows: (readonly [string, string])[] = [['Code', 'Meaning'], ...EXIT_ROWS];
  const first = Math.max(...rows.map((row) => row[0].length));
  const second = Math.max(...rows.map((row) => row[1].length));
  function line(row: readonly [string, string]): string {
    return `| ${row[0].padEnd(first)} | ${row[1].padEnd(second)} |`;
  }
  const rule = `| ${'-'.repeat(first)} | ${'-'.repeat(second)} |`;
  return [line(rows[0] ?? ['', '']), rule, ...rows.slice(1).map(line)].join('\n');
}

function bullets(items: readonly string[]): string {
  return items.map((item) => wrap(item, '  ', '- ')).join('\n');
}

function runIt(fixers: string): string {
  return bullets([
    '`npx nitpicker` checks your changes (committed, staged, unstaged and untracked) against the ' +
      'merge base. Run it from anywhere inside the project, and run it before you finish a task. ' +
      `Run it ${NO_PIPE}. A full run takes minutes and prints a progress line to stderr for each ` +
      'slow analyzer. A second run in the same project exits 2 at once with `another run is in ' +
      'progress`.',
    'When nothing changed since the merge base, no analyzer runs: it prints `No changes since ' +
      '<base> (<sha>); nothing to check.` and exits 0.',
    `${QUICK_SENTENCE}\`--quick\` works with \`--fix\`, \`--base\`, \`--analyzer\` and \`--all\`. ` +
      NARROWED_SENTENCE,
    `\`npx nitpicker --fix\` first applies the preset's fixers to the changed files (${fixers}), ` +
      'then runs the comparison. Use it to clear formatting and auto-fixable lint findings, and ' +
      're-read the files it lists under "Fixed files:" before you edit them again. It cannot be ' +
      'combined with `--all`.',
    '`npx nitpicker --base <ref>` compares against a specific ref when the default base is ' +
      'wrong (for example `--base origin/develop`).',
    '`npx nitpicker --all` reports every finding in the checkout, with no baseline. It exits 1 ' +
      'on any violation, so use it to survey existing code, not as your pass/fail check. It ' +
      'cannot be combined with `--base`, `--fix`, sharding or `--defer-exit`.',
    '`--rule <substring>` lists the findings whose rule matches, after the summary.',
    '`npx nitpicker show` prints the summary of the last run again without running anything. ' +
      'Add `--rule <substring>`, `--path <file or folder>` or `--details` to read one rule, one ' +
      'folder or the full messages instead of running again. It names the run it shows and warns ' +
      'when the working tree changed since. It exits 0 when that run passed, 1 when it did not ' +
      'and 2 when there is no report.',
  ]);
}

function exitCodes(): string {
  const text =
    'Exit 2 is not a pass. Tool errors are listed and recorded even when the exit is 1. Read ' +
    'the tool errors, fix the cause (a missing peer such as `vitest` or `typescript`, a bad ' +
    '`nitpicker.config.json`, a wrong `--base`) and rerun. When the message links to ' +
    `${TROUBLESHOOTING}, the fix is there. \`npx nitpicker init\` lists the missing peers with ` +
    "the install command for the project's package manager; it never overwrites an existing file.";
  return `${table()}\n\n${wrap(text)}`;
}

function readReport(): string {
  const intro =
    'The console summary lists each new code violation as `<tool>/<rule> <path>:<line>` ' +
    'followed by its message. A change to `nitpicker.config.json` that checks less is not listed ' +
    'that way: it appears under "Policy changed in this change", followed by `Unapproved policy ' +
    'changes (nitpicker-config/policy-loosened): N`, and fails the run.';
  const folder =
    `${REPORT_FILES} Full reports are written to \`${REPORT_FOLDER}\` ` +
    '(`reports/quality/snapshot/` for `--all`):';
  const files = bullets([
    '`report.txt`: the readable report. Start here.',
    '`new-findings.json`: the new findings that count against you. Each has a tool, rule, path, ' +
      'location and message, and where the rule states them, `allowedForm` (what to write ' +
      'instead) and `exception` (the entry the message tells you to add to `exceptions`, with ' +
      '`exceptionList` naming the config list). Use `allowedForm` to fix the code. Never add ' +
      '`exception` yourself.',
    '`resolved-findings.json` and `changed-metrics.json`: informational.',
    '`tool-errors.json`: the tool errors, whatever the exit code.',
    '`notes.json`: notes such as a base whose tests fail, which the run reports but does not ' +
      'fail on.',
    '`held-findings.json`: findings that were already there and are no worse than before. ' +
      'Allowed, but any increase fails.',
    '`summary.json`, `report.junit.xml`, `report.sarif` and `codequality.json`: totals and CI ' +
      'output. `report.sarif` has the new findings only; `report-baseline.sarif` adds the held ones.',
  ]);
  const all =
    '`--all` has no baseline: it writes `findings.json` (every finding) in place of the four ' +
    'JSON files above that compare with the base, and no `report-baseline.sarif`.';
  const fails =
    'Only new enforceable findings fail the run. Resolved and unchanged findings, descriptive ' +
    `findings and metric changes are reported but never fail. ${HELD_NOTE}`;
  return [intro, folder]
    .map((text) => wrap(text))
    .concat(files, wrap(all), wrap(fails))
    .join('\n\n');
}

function handleFinding(): string {
  const never =
    '**Never suppress a finding.** Do not add `eslint-disable` comments, `@ts-ignore` or ' +
    '`@ts-expect-error`, edit the rule configuration, add to `exclude`, `disable` or ' +
    '`exceptions` in `nitpicker.config.json`, add to `nitpicker.legacy.json`, mark a file you ' +
    'wrote as generated (`@generated`, `DO NOT EDIT`), or delete or weaken tests to make the ' +
    'gate pass. Those overrides are listed in the report and change the policy hash, so they ' +
    'are visible in review. Never pass `--accept-policy-change`, set ' +
    '`NITPICKER_ACCEPT_POLICY_CHANGE` or add the `accept-policy-change` label: a ' +
    '`nitpicker-config/policy-loosened` finding means stop and ask a person to review the change.';
  const items = [
    'Read the message. It says what is wrong.',
    'Fix the code so the finding goes away, then rerun `npx nitpicker` until it exits 0. ' +
      'While you iterate, `--quick` and `--analyzer` are faster; finish with a full run.',
    never,
    'If a finding looks wrong, or fixing it needs a decision you cannot make, stop and ask the ' +
      'maintainer. Do not work around it.',
  ];
  return items.map((item, index) => wrap(item, '   ', numbered(index + 1))).join('\n');
}

export function snippetParts(fixers: string): string {
  return [
    '### Run it',
    runIt(fixers),
    '### Exit codes',
    exitCodes(),
    '### Read the report',
    readReport(),
    '### Handle a finding',
    handleFinding(),
  ].join('\n\n');
}
