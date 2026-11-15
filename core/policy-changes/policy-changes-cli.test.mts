import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli.mts';
import { fixtureGit, useGitFixtures } from '../diff/git/test-support/git-repository.mts';
import { runTasksInProcess } from '../diff/execution/test-support/in-process-analyzers.mts';
import { writeFiles } from '../diff/git/test-support/fixture-files.mts';
import { policyFindings as findingsFor } from '../diff/reporting/review/policy-findings.mts';
import { checkoutModuleUrl } from '../../shared/paths/checkout-module.mjs';
import { parseJson, textOf, fieldOf, listOf } from '../../shared/values/readers.mts';
import type { Analyzer } from '../../shared/values/analyzers.mts';
import type { PolicyConfig } from './types/policy-types.mts';
import { linkSentence } from '../../shared/messages/test-support/link-sentence.mjs';

const fakeAnalyzerPath = fileURLToPath(
  checkoutModuleUrl(new URL('../diff/execution/test-support/fake-analyzer.mts', import.meta.url)),
);
const { createGitRepository, temporaryRoot } = useGitFixtures();

function fakeAnalyzer(name = 'fake-quality-analyzer'): Analyzer {
  return {
    name,
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
    createInvocation(context: unknown) {
      const projectRoot = textOf(fieldOf(context, 'projectRoot'));
      const policyRoot = textOf(fieldOf(context, 'policyRoot'));
      const toolRoot = textOf(fieldOf(context, 'toolRoot'));
      return {
        command: process.execPath,
        args: [
          fakeAnalyzerPath,
          '--root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          toolRoot,
        ],
        cwd: policyRoot,
      };
    },
  };
}

const TYPESCRIPT_FILES = {
  'src/a.ts': 'export {};\n',
  'src/legacy/old.ts': 'export {};\n',
  'src/vendor/lib.ts': 'export {};\n',
};

type RepositoryInput = {
  baseConfig: PolicyConfig;
  headConfig: PolicyConfig;
  headFiles?: Record<string, string>;
};

type Summary = {
  policyDigest: string;
  headSha: string;
  policyLoosenings: unknown;
  policyAcceptanceSource: unknown;
  policyChangeAccepted: unknown;
};

type NewFinding = { tool: string; message: string; policyKind: unknown };

function summaryOf(value: unknown): Summary {
  return {
    policyDigest: textOf(fieldOf(value, 'policyDigest')),
    headSha: textOf(fieldOf(value, 'headSha')),
    policyLoosenings: fieldOf(value, 'policyLoosenings'),
    policyAcceptanceSource: fieldOf(value, 'policyAcceptanceSource'),
    policyChangeAccepted: fieldOf(value, 'policyChangeAccepted'),
  };
}

function newFindingsOf(value: unknown): NewFinding[] {
  return listOf(value).map((finding) => ({
    tool: textOf(fieldOf(finding, 'tool')),
    message: textOf(fieldOf(finding, 'message')),
    policyKind: fieldOf(finding, 'policyKind'),
  }));
}

function prepareRepository({ baseConfig, headConfig, headFiles = {} }: RepositoryInput) {
  const files = { 'quality-policy.json': '{"marker":"QUALITY_FINDING"}\n', ...TYPESCRIPT_FILES };
  const repository = createGitRepository(
    { ...files, 'nitpicker.config.json': JSON.stringify(baseConfig) },
    { prefix: 'nitpicker-policy-changes-' },
  );
  writeFileSync(path.join(repository.root, 'nitpicker.config.json'), JSON.stringify(headConfig));
  writeFiles(repository.root, headFiles);
  fixtureGit(repository.root, ['branch', 'comparison-base', repository.baseSha]);
  return repository.root;
}

function readReports(outputRoot: string) {
  const read = (name: string) => readFileSync(path.join(outputRoot, name), 'utf8');
  return {
    summary: summaryOf(parseJson(read('summary.json'))),
    report: read('report.txt'),
    newFindings: newFindingsOf(parseJson(read('new-findings.json'))),
  };
}

function runWithHeadConfig({
  extraArguments = [],
  environment = {},
  ...repository
}: RepositoryInput & { extraArguments?: string[]; environment?: Record<string, string> }) {
  const outputRoot = path.join(temporaryRoot('nitpicker-policy-output-'), 'reports');
  let stdoutText = '';
  let stderrText = '';
  const exitCode = runCli({
    arguments_: ['--base', 'comparison-base', '--output', outputRoot, ...extraArguments],
    environment: { NO_COLOR: '1', ...environment },
    currentProjectRoot: prepareRepository(repository),
    analyzers: [fakeAnalyzer()],
    stdout: { write: (value) => (stdoutText += value) },
    stderr: { write: (value) => (stderrText += value) },
    progress: { write() {} },
    runTasks: runTasksInProcess,
  });
  return { exitCode, stdoutText, stderrText, ...readReports(outputRoot) };
}

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; loosening accepted):';

function policyBlock(text: string, heading = HEADING) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  return lines.slice(start, start + 4);
}

function policyMessages(newFindings: NewFinding[]) {
  return newFindings
    .filter(({ tool }) => tool === 'nitpicker-config')
    .map(({ message }) => message)
    .sort();
}

function policyFindings(newFindings: NewFinding[]) {
  return policyMessages(newFindings).map((message) => message.split('. ')[0]);
}

function stderrLines(run: { stderrText: string }, prefix: string) {
  return run.stderrText.split('\n').filter((line) => line.startsWith(prefix));
}

describe('a change that loosens nitpicker.config.json', () => {
  const baseConfig = { exclude: ['src/legacy/**'] };
  const headConfig = {
    exclude: ['src/legacy/**', 'src/vendor/**'],
    thresholds: { crapLimit: 20 },
    react: { enabled: false },
  };
  const expected = [
    'exclude added: src/vendor/**',
    'threshold crapLimit raised from 9 to 20',
    'react.enabled: not set -> false',
  ];

  const EXPECTED_KINDS = {
    'exclude added: src/vendor/**': 'exclusion',
    'threshold crapLimit raised from 9 to 20': 'threshold',
    'react.enabled: not set -> false': 'react-disabled',
  };

  it('fails with one finding per loosening and passes only once a person accepts its digest in CI', () => {
    const outsideCi = runWithHeadConfig({
      baseConfig,
      headConfig,
      environment: { NITPICKER_ACCEPT_POLICY_CHANGE: 'ffffffffffff' },
    });
    const accepted = runWithHeadConfig({
      baseConfig,
      headConfig,
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: outsideCi.summary.policyDigest },
    });

    expect(outsideCi.exitCode).toBe(1);
    expect(outsideCi.summary.policyLoosenings).toEqual(expected);
    expect(outsideCi.summary.policyAcceptanceSource).toBe('environment');
    expect(stderrLines(outsideCi, 'nitpicker: NITPICKER_ACCEPT_POLICY_CHANGE')).toEqual([
      'nitpicker: NITPICKER_ACCEPT_POLICY_CHANGE is honoured only in CI (CI set); at a terminal a person passes --accept-policy-change instead.',
    ]);
    expect(policyFindings(outsideCi.newFindings)).toEqual([...expected].sort());
    expect(policyMessages(outsideCi.newFindings)).toEqual(
      findingsFor(expected, outsideCi.summary.policyDigest, { kinds: EXPECTED_KINDS })
        .map(({ message }) => message)
        .sort(),
    );
    expect(policyBlock(outsideCi.report)).toEqual([
      HEADING,
      ...expected.map((change) => `  ${change}`),
    ]);
    expect(
      outsideCi.newFindings
        .filter(({ tool }) => tool === 'nitpicker-config')
        .map(({ policyKind }) => textOf(policyKind))
        .toSorted(),
    ).toEqual(['exclusion', 'react-disabled', 'threshold']);
    const { policyDigest } = outsideCi.summary;
    const consoleLines = outsideCi.stdoutText.split('\n');
    const acceptance =
      '  Only a person may accept exactly these changes, after reviewing them: ' +
      `--accept-policy-change=${policyDigest} at an interactive terminal, ` +
      `NITPICKER_ACCEPT_POLICY_CHANGE=${policyDigest} in CI, ` +
      `or the accept-policy-change label of a GitHub pull request, with the nitpicker approval workflow. ${linkSentence('policyLoosened') ?? ''}`;
    expect(consoleLines.filter((line) => line.includes('policy-loosened'))).toEqual([
      '  Unapproved policy changes (nitpicker-config/policy-loosened): 3; ' +
        'the gate fails until each is undone or a person accepts the digest.',
      acceptance,
    ]);
    expect(consoleLines.filter((line) => line.includes(policyDigest))).toEqual([acceptance]);
    expect(accepted.stdoutText.split('\n').filter((line) => line.includes('Unapproved'))).toEqual(
      [],
    );
    expect([accepted.exitCode, accepted.summary.policyChangeAccepted]).toEqual([0, true]);
    expect(policyBlock(accepted.stdoutText, ACCEPTED_HEADING)).toEqual([
      ACCEPTED_HEADING,
      ...expected.map((change) => `  ${change}`),
    ]);
  });
});

describe('a loosening accepted for a commit', () => {
  const baseConfig = { exclude: ['src/legacy/**'] };
  const headConfig = { exclude: ['src/legacy/**', 'src/vendor/**'] };

  function runAccepting(commitHead: boolean) {
    const repository = prepareRepository({ baseConfig, headConfig });
    if (commitHead) {
      fixtureGit(repository, ['add', '-A']);
      fixtureGit(repository, ['commit', '-q', '-m', 'loosen']);
    }
    const head = fixtureGit(repository, ['rev-parse', 'HEAD']).trim();
    const outputRoot = path.join(temporaryRoot('nitpicker-policy-output-'), 'reports');
    const exitCode = runCli({
      arguments_: ['--base', 'comparison-base', '--output', outputRoot],
      environment: { NO_COLOR: '1', CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: `commit:${head}` },
      currentProjectRoot: repository,
      analyzers: [fakeAnalyzer()],
      stdout: { write() {} },
      stderr: { write() {} },
      progress: { write() {} },
      runTasks: runTasksInProcess,
    });
    return { exitCode, head, ...readReports(outputRoot) };
  }

  it('passes when the commit is the gated head', () => {
    const run = runAccepting(true);

    expect([run.exitCode, run.summary.headSha, run.summary.policyChangeAccepted]).toEqual([
      0,
      run.head,
      true,
    ]);
  });

  it('accepts nothing when uncommitted changes make another head, and says so', () => {
    const run = runAccepting(false);
    const expected = findingsFor(['exclude added: src/vendor/**'], run.summary.policyDigest, {
      acceptedDigest: `commit:${run.head}`,
      headSha: run.summary.headSha,
      kinds: { 'exclude added: src/vendor/**': 'exclusion' },
    });

    expect([run.exitCode, run.summary.policyChangeAccepted]).toEqual([1, false]);
    expect(run.summary.headSha).not.toBe(run.head);
    expect(policyMessages(run.newFindings)).toEqual(expected.map(({ message }) => message));
  });
});

describe('a change that keeps the policy', () => {
  it('fails hidden code production reaches, passes vendored code it does not, and ignores an acceptance from an agent', () => {
    const vendor = { exclude: ['src/vendor/**'] };
    const run = runWithHeadConfig({
      baseConfig: vendor,
      headConfig: vendor,
      headFiles: {
        'src/a.ts': "export * from './vendor/lib';\n",
        'src/vendor/lib.ts': "export * from './feature';\n",
        'src/vendor/feature.ts': 'export const feature = 1;\n',
        'src/vendor/unused.ts': 'export {};\n',
      },
      extraArguments: ['--accept-policy-change=ffffffffffff'],
    });

    expect([run.exitCode, run.summary.policyLoosenings]).toEqual([
      1,
      [
        'exclude and layout.excludedGlobs hide code this change adds or moves that production code imports: src/vendor/feature.ts (imported by src/a.ts)',
      ],
    ]);
    expect(run.summary.policyAcceptanceSource).toBe('flag');
    expect(stderrLines(run, 'nitpicker: --accept-policy-change')).toEqual([
      'nitpicker: --accept-policy-change is honoured only at an interactive terminal, where a person reviews the change; in CI a person sets NITPICKER_ACCEPT_POLICY_CHANGE instead.',
    ]);
  });
});
