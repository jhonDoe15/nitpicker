import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../../core/cli.mts';
import { captureOutput } from '../../../core/diff/reporting/test-support/output-capture.mts';
import { fixtureGit } from '../../../core/diff/git/test-support/git-repository.mts';
import { createHistoryAnalyzers } from '../analyzers.mts';
import { CO_CHANGE_ADVICE } from './findings.mts';
import { runQualityDiff } from '../../../core/diff/comparison/run-diff.mts';
import { resolveHeadPolicy } from '../../head-policy.mts';
import {
  edit,
  importHistory,
  type HistoryStep,
  SOURCE_FILES,
  useHistoryRepositories,
} from '../../../core/diff/git/test-support/history-repository.mts';
import type { InvocationContext } from '../../hygiene/check-types.mts';
import { fieldOf, optionalText, textOf } from '../../values/readers.mts';
import type { ProfiledAnalyzer } from '../../values/analyzers.mts';
import { checkoutModuleUrl } from '../../paths/checkout-module.mts';

const { historyRepository } = useHistoryRepositories();
const BASE_REF = 'comparison-base';
const ENABLED = { history: { coChange: true } };
const PARTNER_NOTICE =
  'Files you changed in src/billing usually change together with src/invoicing (8 of 12 commits, 67%), ' +
  'which this change leaves alone. Check that they need no matching edit; ' +
  'if they usually do, see the co-change finding for the knowledge both share.';
const ENTRY = fileURLToPath(checkoutModuleUrl(new URL('../../../core/bin.mjs', import.meta.url)));
const repositories = { alone: '', both: '', deleting: '', notOptedIn: '' };

function repositoryWithChange(config: object, change: HistoryStep): string {
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

type Publishing = Pick<ProfiledAnalyzer, 'name' | 'configurationHash'> & {
  readonly exclusions: readonly unknown[];
  readonly createInvocation: (context: InvocationContext) => { readonly args: readonly string[] };
};

function importsPublisher(moduleImports: readonly object[]) {
  const report = JSON.stringify({ findings: [], moduleImports });
  return {
    name: 'coupling',
    version: '1',
    configurationHash: 'fixture',
    exclusions: [],
    createInvocation: (context: unknown) => ({
      command: process.execPath,
      args: ['-e', `process.stdout.write(${JSON.stringify(report)})`],
      cwd: textOf(fieldOf(context, 'projectRoot')),
    }),
  };
}

function profiled(analyzers: readonly Publishing[]): ProfiledAnalyzer[] {
  return analyzers.map((analyzer) => ({
    ...analyzer,
    createInvocation: (context: unknown) => {
      const snapshot = optionalText(fieldOf(context, 'snapshot'));
      const baselineRoot = optionalText(fieldOf(context, 'baselineRoot'));
      return analyzer.createInvocation({
        projectRoot: textOf(fieldOf(context, 'projectRoot')),
        toolRoot: textOf(fieldOf(context, 'toolRoot')),
        ...(snapshot === undefined ? {} : { snapshot }),
        ...(baselineRoot === undefined ? {} : { baselineRoot }),
      });
    },
  }));
}

function runGate(root: string) {
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

function summary(root: string, notices: string[] = []) {
  const noticeLines =
    notices.length === 0
      ? ''
      : `Notices (not failing):\n${notices.map((notice) => `  ${notice}\n`).join('')}`;
  return `Base: ${BASE_REF} (argument)

Quality gate summary
✓ No new enforceable violations
${noticeLines}Full diagnostics: ${path.join(root, 'reports/quality/diff')}/report.txt
`;
}

function reportLines(root: string) {
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
  ] as const)('stays quiet when %s', (_, name) => {
    const root = repositories[name];

    expect(runGate(root)).toEqual({ exitCode: 0, stdout: summary(root) });
  });
});

describe('co-change dependencies in a gate run', () => {
  function dependencySentence(root: string, analyzers: readonly Publishing[]) {
    const report = runQualityDiff({
      repositoryRoot: root,
      projectRelativePath: '.',
      requestedBaseRef: BASE_REF,
      outputRoot: path.join(root, 'reports/dependencies'),
      analyzers: profiled(analyzers),
      headPolicy: resolveHeadPolicy(ENABLED),
    });
    const found = report.unchangedFindings.find(({ tool }) => tool === 'change-history');
    return found?.message.split(CO_CHANGE_ADVICE)[0]?.split('). ').at(-1)?.trim();
  }

  it('names the import an analyzer published between the two modules', () => {
    const publisher = importsPublisher([{ from: 'src/billing/invoice.ts', to: 'src/invoicing' }]);

    expect(
      dependencySentence(repositories.alone, [...createHistoryAnalyzers(ENTRY), publisher]),
    ).toBe('src/billing imports src/invoicing in 1 file.');
  });

  it('says the dependency is unknown when no analyzer published imports', () => {
    expect(dependencySentence(repositories.alone, createHistoryAnalyzers(ENTRY))).toBe(
      'Imports between them are unknown: no analyzer reported any for this run.',
    );
  });
});
