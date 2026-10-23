import { describe, expect, it } from 'vitest';
import { finding, report } from '../test-support/report-builders.mjs';
import { renderDiffSummary } from './diff-summary.mjs';
import { LISTED_FINDINGS, LISTED_NOTES } from './markdown.mjs';
import { renderSnapshotSummary } from './snapshot-summary.mjs';

const context = {
  linkBase: 'https://github.com/acme/shop/blob/0123abc',
  projectPrefix: '',
};

const HEADER = [
  'Base `main` (merge base `abc`), head `def`.',
  '0 new findings, 0 resolved, 0 changed metrics.',
];

function route(entry) {
  return (
    `- A finding that flags code that is right: ${entry}, with the rule, the paths and a reason. ` +
    'The message of each finding in `report.txt` ends with its own entry. ' +
    'Reviewers see the entry and every report lists it.'
  );
}

const ROUTE = route('add an entry to `exceptions` in `nitpicker.config.json`');

const ROUTE_WITH_EXAMPLE = route(
  'add an entry like the example below to `exceptions` in `nitpicker.config.json`',
);

const TABLE_HEAD = ['| Tool | Rule | Enforceable | Descriptive |', '| --- | --- | ---: | ---: |'];

function lines(markdown) {
  return markdown.split('\n');
}

function findingLines(markdown) {
  const all = lines(markdown);
  const start = all.indexOf('### New enforceable findings') + 2;
  return all.slice(start, all.indexOf('', start));
}

describe('renderDiffSummary', () => {
  it('counts the new findings by tool and rule and links each listed finding', () => {
    const markdown = renderDiffSummary(
      report({
        newFindings: [
          finding(),
          finding({ identity: 'b', location: { line: 40 } }),
          finding({
            tool: 'knip',
            rule: 'unused-file',
            path: 'src/my file.js',
            location: undefined,
            message: 'Unused file',
          }),
          finding({ rule: 'max-lines', classification: 'descriptive', identity: 'c' }),
        ],
      }),
      context,
    );

    expect(lines(markdown)).toEqual([
      '## nitpicker',
      '',
      '**✖ 3 new enforceable findings**',
      '',
      'Base `main` (merge base `abc`), head `def`.',
      '4 new findings, 0 resolved, 0 changed metrics.',
      '',
      '### New findings by tool and rule',
      '',
      ...TABLE_HEAD,
      '| `eslint` | `no-console` | 2 | 0 |',
      '| `knip` | `unused-file` | 1 | 0 |',
      '| `eslint` | `max-lines` | 0 | 1 |',
      '',
      '### New enforceable findings',
      '',
      '- [`src/a.js:12`](https://github.com/acme/shop/blob/0123abc/src/a.js#L12) ' +
        '`eslint/no-console`: Unexpected console statement',
      '- [`src/a.js:40`](https://github.com/acme/shop/blob/0123abc/src/a.js#L40) ' +
        '`eslint/no-console`: Unexpected console statement',
      '- [`src/my file.js`](https://github.com/acme/shop/blob/0123abc/src/my%20file.js) ' +
        '`knip/unused-file`: Unused file',
      '',
      '### Disagree with a finding?',
      '',
      ROUTE,
      '',
    ]);
  });

  it.each(['exceptions', 'python.exceptions'])(
    'keeps the %s route out of the list and shows one entry once',
    (key) => {
      const entry = '{"rule":"no-console","paths":["src/a.js"],"reason":"..."}';
      const sentence = `If this is intended, add ${entry} to "${key}" in nitpicker.config.json.`;
      const markdown = renderDiffSummary(
        report({
          newFindings: [
            finding({
              message: `Unexpected console statement. ${sentence}`,
            }),
          ],
        }),
        context,
      );

      expect(lines(markdown).slice(-12)).toEqual([
        '### New enforceable findings',
        '',
        '- [`src/a.js:12`](https://github.com/acme/shop/blob/0123abc/src/a.js#L12) ' +
          '`eslint/no-console`: Unexpected console statement.',
        '',
        '### Disagree with a finding?',
        '',
        ROUTE_WITH_EXAMPLE,
        '',
        '```json',
        entry,
        '```',
        '',
      ]);
    },
  );

  it('names the project folder and prefixes links with it', () => {
    const markdown = renderDiffSummary(report({ newFindings: [finding()] }), {
      ...context,
      projectPrefix: 'services/api/',
    });

    expect(lines(markdown)[0]).toBe('## nitpicker `services/api/`');
    expect(findingLines(markdown)).toEqual([
      '- [`src/a.js:12`](https://github.com/acme/shop/blob/0123abc/services/api/src/a.js#L12) ' +
        '`eslint/no-console`: Unexpected console statement',
    ]);
  });

  it('encodes the characters of a path that would end the link', () => {
    const markdown = renderDiffSummary(
      report({ newFindings: [finding({ path: 'src/(group)/a b.js' })] }),
      context,
    );

    expect(findingLines(markdown)).toEqual([
      '- [`src/(group)/a b.js:12`](https://github.com/acme/shop/blob/0123abc/src/%28group%29/a%20b.js#L12) ' +
        '`eslint/no-console`: Unexpected console statement',
    ]);
  });

  it('does not break the markdown with finding text', () => {
    const markdown = renderDiffSummary(
      report({
        newFindings: [finding({ message: 'Use <b>x</b> | not `y`\n* [z](http://e.test)' })],
      }),
      context,
    );

    expect(findingLines(markdown)).toEqual([
      '- [`src/a.js:12`](https://github.com/acme/shop/blob/0123abc/src/a.js#L12) ' +
        '`eslint/no-console`: Use \\<b\\>x\\</b\\> \\| not \\`y\\` \\* \\[z\\]\\(http://e.test\\)',
    ]);
  });

  it('lists the first findings only and points to the report for the rest', () => {
    const many = Array.from({ length: LISTED_FINDINGS + 5 }, (_, index) =>
      finding({ identity: `i${String(index)}`, location: { line: index + 1 } }),
    );

    const listed = lines(renderDiffSummary(report({ newFindings: many }), context));

    expect(listed.filter((line) => line.startsWith('- ['))).toHaveLength(LISTED_FINDINGS);
    expect(listed.filter((line) => line.endsWith('`report.txt`.'))).toEqual([
      '5 more in `report.txt`.',
    ]);
  });

  it('works without links when the run is not on GitHub', () => {
    const markdown = renderDiffSummary(report({ newFindings: [finding()] }), {
      linkBase: undefined,
      projectPrefix: '',
    });

    expect(findingLines(markdown)).toEqual([
      '- `src/a.js:12` `eslint/no-console`: Unexpected console statement',
    ]);
  });

  it('reports a clean run without the exception route', () => {
    expect(lines(renderDiffSummary(report(), context))).toEqual([
      '## nitpicker',
      '',
      '**✓ No new enforceable findings**',
      '',
      ...HEADER,
      '',
    ]);
  });

  it('says a run with a tool error is incomplete and lists the error', () => {
    const markdown = renderDiffSummary(
      report({
        toolErrors: [{ tool: 'knip', snapshot: 'head', message: 'Cannot find\nmodule x' }],
      }),
      context,
    );

    expect(lines(markdown)).toEqual([
      '## nitpicker',
      '',
      '**✖ Incomplete: no new enforceable findings, but a tool failed**',
      '',
      ...HEADER,
      '',
      '### 1 tool error',
      '',
      'A tool error is never a pass: the run is incomplete.',
      '',
      '- `knip (head)`: Cannot find module x',
      '',
    ]);
  });

  it('lists the policy changes and names the digest to accept for a loosening', () => {
    const base = report();
    base.summary.policyChanges = ['exceptions: added mutant-survived for src/**'];
    base.summary.policyLoosenings = ['exceptions: added mutant-survived for src/**'];
    base.summary.policyDigest = 'abc123def456';
    base.summary.notices = ['3 changed files are outside the checked roots'];

    expect(lines(renderDiffSummary(base, context))).toEqual([
      '## nitpicker',
      '',
      '**✓ No new enforceable findings**',
      '',
      ...HEADER,
      '',
      '### Policy changed in this change',
      '',
      '- exceptions: added mutant-survived for src/\\*\\*',
      '',
      '### Notices (not failing)',
      '',
      '- 3 changed files are outside the checked roots',
      '',
      '### Disagree with a finding?',
      '',
      '- A loosening of `nitpicker.config.json` fails until a repository admin has reviewed it and ' +
        'set the repository variable `NITPICKER_ACCEPT_POLICY_CHANGE` to `abc123def456`, ' +
        'then re-run the job. The digest covers exactly the loosenings listed above.',
      '',
    ]);
  });

  it('lists the first policy changes and notices only', () => {
    const base = report();
    const many = (label) =>
      Array.from({ length: LISTED_NOTES + 2 }, (_, index) => `${label} ${String(index)}`);
    base.summary.policyChanges = many('change');
    base.summary.notices = many('notice');
    const listed = lines(renderDiffSummary(base, context));

    expect([
      listed.filter((line) => line.startsWith('- change ')).length,
      listed.filter((line) => line.startsWith('- notice ')).length,
      listed.filter((line) => line === '2 more in `report.txt`.').length,
    ]).toEqual([LISTED_NOTES, LISTED_NOTES, 2]);
  });

  it('escapes a pipe in a rule name so that the table keeps its columns', () => {
    const markdown = renderDiffSummary(
      report({
        newFindings: [finding({ tool: 'semgrep', rule: 'a|b', classification: 'descriptive' })],
      }),
      context,
    );

    expect(lines(markdown).filter((line) => line.startsWith('| `'))).toEqual([
      '| `semgrep` | `a\\|b` | 0 | 1 |',
    ]);
  });

  it('does not ask for the digest once the loosening is accepted', () => {
    const base = report();
    base.summary.policyChanges = ['exclude: added dist/**'];
    base.summary.policyLoosenings = ['exclude: added dist/**'];
    base.summary.policyDigest = 'abc123def456';
    base.summary.policyChangeAccepted = true;

    expect(lines(renderDiffSummary(base, context)).slice(7)).toEqual([
      '### Policy changed in this change (loosening accepted)',
      '',
      '- exclude: added dist/\\*\\*',
      '',
    ]);
  });

  it('mentions findings held at the base', () => {
    const markdown = renderDiffSummary(
      report({ unchangedFindings: [finding({ heldAtBase: 3, ratchet: { value: 3 } })] }),
      context,
    );

    expect(lines(markdown).slice(7)).toEqual([
      '1 finding in touched code is still over a limit or lint rule',
      'but no worse than at the base (not failing; listed in `report.txt`).',
      '',
    ]);
  });
});

describe('renderSnapshotSummary', () => {
  function snapshot(findings, toolErrors = []) {
    return {
      summary: { overallStatus: 'violations', enforceableFindings: findings.length, tools: [] },
      findings,
      toolErrors,
    };
  }

  it('counts the findings of a full run and lists the enforceable ones', () => {
    const markdown = renderSnapshotSummary(
      snapshot([finding(), finding({ rule: 'max-lines', classification: 'descriptive' })]),
      context,
    );

    expect(lines(markdown)).toEqual([
      '## nitpicker full run',
      '',
      '**✖ 1 enforceable finding in the checkout**',
      '',
      '2 findings in all, 1 descriptive.',
      '',
      '### Findings by tool and rule',
      '',
      ...TABLE_HEAD,
      '| `eslint` | `no-console` | 1 | 0 |',
      '| `eslint` | `max-lines` | 0 | 1 |',
      '',
      '### Enforceable findings',
      '',
      '- [`src/a.js:12`](https://github.com/acme/shop/blob/0123abc/src/a.js#L12) ' +
        '`eslint/no-console`: Unexpected console statement',
      '',
      '### Disagree with a finding?',
      '',
      ROUTE,
      '',
    ]);
  });

  it('reports a clean full run', () => {
    expect(lines(renderSnapshotSummary(snapshot([]), context))).toEqual([
      '## nitpicker full run',
      '',
      '**✓ No enforceable findings**',
      '',
      '0 findings in all, 0 descriptive.',
      '',
    ]);
  });
});
