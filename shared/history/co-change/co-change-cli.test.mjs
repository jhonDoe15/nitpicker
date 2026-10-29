import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../../core/cli.mjs';
import { captureOutput } from '../../../core/diff/reporting/test-support/output-capture.mjs';
import { fixtureGit } from '../../../core/diff/git/test-support/git-repository.mjs';
import { createHistoryAnalyzers } from '../analyzers.mjs';
import {
  edit,
  importHistory,
  SOURCE_FILES,
  useHistoryRepositories,
} from '../../../core/diff/git/test-support/history-repository.mjs';

const { historyRepository } = useHistoryRepositories();
const BASE_REF = 'comparison-base';
const ENABLED = { history: { coChange: true } };
const PARTNER_NOTICE =
  'Files you changed in src/billing usually change together with src/invoicing (8 of 12 commits, 67%), ' +
  'which this change leaves alone. Check that they need no matching edit; ' +
  'if they usually do, see the co-change finding for the knowledge both share.';
const ENTRY = fileURLToPath(new URL('../../../core/cli.mjs', import.meta.url));
const repositories = {};

function repositoryWithChange(config, change) {
  const root = historyRepository({
    files: { ...SOURCE_FILES, 'nitpicker.config.json': `${JSON.stringify(config)}\n` },
  });
  fixtureGit(root, ['branch', BASE_REF, 'HEAD']);
  importHistory(root, [{ message: 'the change', ...change }]);
  return root;
}

beforeAll(() => {
  repositories.alone = repositoryWithChange(ENABLED, {
    files: edit(['src/billing/invoice.ts'], 900),
  });
  repositories.both = repositoryWithChange(ENABLED, {
    files: edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], 901),
  });
  repositories.deleting = repositoryWithChange(ENABLED, {
    files: edit(['src/billing/invoice.ts'], 902),
    deletes: ['src/invoicing/ledger.ts'],
  });
  repositories.notOptedIn = repositoryWithChange(
    {},
    {
      files: edit(['src/billing/invoice.ts'], 903),
    },
  );
});

function runGate(root) {
  const output = captureOutput();
  const exitCode = runCli({
    arguments_: ['--base', BASE_REF, '--output', 'reports/quality/diff'],
    environment: {},
    currentProjectRoot: root,
    analyzers: createHistoryAnalyzers(ENTRY),
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, stdout: output.stdoutText };
}

function summary(root, notices = []) {
  const noticeLines =
    notices.length === 0
      ? ''
      : `\u001b[1m\u001b[33mNotices (not failing):\u001b[0m\n${notices.map((notice) => `  ${notice}\n`).join('')}`;
  return `Base: ${BASE_REF} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
${noticeLines}\u001b[2mFull diagnostics: ${path.join(root, 'reports/quality/diff')}/report.txt\u001b[0m
`;
}

function reportLines(root) {
  const report = readFileSync(path.join(root, 'reports/quality/diff/report.txt'), 'utf8');
  const lines = report.split('\n');
  return [
    lines
      .find((line) => line.startsWith('change-history:'))
      ?.replace(/elapsed=[\d.]+s/u, 'elapsed'),
    lines.find((line) => line.startsWith('Tool errors:')),
  ];
}

describe('co-change in a base and head run', () => {
  it('keeps the finding unchanged and tells the author which partner the change leaves alone', () => {
    const root = repositories.alone;

    expect({ ...runGate(root), report: reportLines(root) }).toEqual({
      exitCode: 0,
      stdout: summary(root, [PARTNER_NOTICE]),
      report: [
        'change-history: base=1 head=1 new=0 resolved=0 unchanged=1 changed-metrics=0 elapsed',
        'Tool errors: 0',
      ],
    });
  });

  it.each([
    ['the change touches both modules', 'both'],
    ['the change deletes the partner', 'deleting'],
    ['the project has not opted in', 'notOptedIn'],
  ])('stays quiet when %s', (_, name) => {
    const root = repositories[name];

    expect(runGate(root)).toEqual({ exitCode: 0, stdout: summary(root) });
  });
});
