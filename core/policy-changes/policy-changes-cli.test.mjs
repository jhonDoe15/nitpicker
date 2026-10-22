import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli.mjs';
import { fixtureGit, useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { runTasksInProcess } from '../diff/execution/test-support/in-process-analyzers.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { policyFindings as findingsFor } from '../diff/reporting/review/policy-findings.mjs';

const fakeAnalyzerPath = path.resolve(
  import.meta.dirname,
  '../diff/execution/test-support/fake-analyzer.mjs',
);
const { createGitRepository, temporaryRoot } = useGitFixtures();

function fakeAnalyzer(name = 'fake-quality-analyzer') {
  return {
    name,
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
    createInvocation({ projectRoot, policyRoot, toolRoot }) {
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

function prepareRepository({ baseConfig, headConfig, headFiles = {} }) {
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

function readReports(outputRoot) {
  const read = (name) => readFileSync(path.join(outputRoot, name), 'utf8');
  return {
    summary: JSON.parse(read('summary.json')),
    report: read('report.txt'),
    newFindings: JSON.parse(read('new-findings.json')),
  };
}

function runWithHeadConfig({ extraArguments = [], environment = {}, ...repository }) {
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
  'Policy changed in this change (nitpicker.config.json, head against base; loosening accepted by exact digest):';

function policyBlock(text, heading = HEADING) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  return lines.slice(start, start + 4);
}

function policyMessages(newFindings) {
  return newFindings
    .filter(({ tool }) => tool === 'nitpicker-config')
    .map(({ message }) => message)
    .sort();
}

function policyFindings(newFindings) {
  return policyMessages(newFindings).map((message) => message.split('. ')[0]);
}

function stderrLines(run, prefix) {
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
      findingsFor(expected, outsideCi.summary.policyDigest, undefined, EXPECTED_KINDS)
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
        .map(({ policyKind }) => policyKind)
        .toSorted(),
    ).toEqual(['exclusion', 'react-disabled', 'threshold']);
    const { policyDigest } = outsideCi.summary;
    expect(outsideCi.stdoutText).toContain('(nitpicker-config/policy-loosened): 3;');
    expect(outsideCi.stdoutText).toContain(
      `--accept-policy-change=${policyDigest} at an interactive`,
    );
    expect(outsideCi.stdoutText).toContain(`NITPICKER_ACCEPT_POLICY_CHANGE=${policyDigest} in CI.`);
    expect(accepted.stdoutText).not.toContain('Unapproved policy changes');
    expect([accepted.exitCode, accepted.summary.policyChangeAccepted]).toEqual([0, true]);
    expect(policyBlock(accepted.stdoutText, ACCEPTED_HEADING)).toEqual([
      ACCEPTED_HEADING,
      ...expected.map((change) => `  ${change}`),
    ]);
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
