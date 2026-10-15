import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../cli.mjs';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../diff/fixtures/git-repository.mjs';
import { runTasksInProcess } from '../diff/fixtures/in-process-analyzers.mjs';

const fakeAnalyzerPath = path.resolve(import.meta.dirname, '../diff/fixtures/fake-analyzer.mjs');
const outputRoots = [];

afterEach(() => {
  removeGitRepositories();
  for (const root of outputRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fakeAnalyzer() {
  return {
    name: 'fake-quality-analyzer',
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

function runWithHeadConfig({ baseConfig, headConfig, extraArguments = [], environment = {} }) {
  const files = {
    'quality-policy.json': '{"marker":"QUALITY_FINDING"}\n',
    'src/a.ts': 'export {};\n',
  };
  const repository = createGitRepository(
    baseConfig === undefined
      ? files
      : { ...files, 'nitpicker.config.json': JSON.stringify(baseConfig) },
    { prefix: 'nitpicker-policy-changes-' },
  );
  writeFileSync(path.join(repository.root, 'nitpicker.config.json'), JSON.stringify(headConfig));
  fixtureGit(repository.root, ['branch', 'comparison-base', repository.baseSha]);
  const outputRoot = path.join(
    mkdtempSync(path.join(tmpdir(), 'nitpicker-policy-output-')),
    'reports',
  );
  outputRoots.push(path.dirname(outputRoot));
  let stdoutText = '';
  const exitCode = runCli({
    arguments_: ['--base', 'comparison-base', '--output', outputRoot, ...extraArguments],
    environment: { NO_COLOR: '1', ...environment },
    currentProjectRoot: repository.root,
    analyzers: [fakeAnalyzer()],
    stdout: { write: (value) => (stdoutText += value) },
    stderr: { write() {} },
    progress: { write() {} },
    runTasks: runTasksInProcess,
  });
  const summary = JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'));
  return {
    exitCode,
    stdoutText,
    summary,
    report: readFileSync(path.join(outputRoot, 'report.txt'), 'utf8'),
    newFindings: JSON.parse(readFileSync(path.join(outputRoot, 'new-findings.json'), 'utf8')),
  };
}

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; loosening accepted with --accept-policy-change):';
const ACCEPT_ROUTE =
  'A change that loosens nitpicker.config.json fails until a person accepts it: rerun with ' +
  '--accept-policy-change, or set NITPICKER_ACCEPT_POLICY_CHANGE=1.';

function policyBlock(text, heading = HEADING) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  return lines.slice(start, start + 4);
}

function policyFindings(newFindings) {
  return newFindings
    .filter(({ tool }) => tool === 'nitpicker-config')
    .map(({ rule, path: file, message }) => ({ rule, file, message }));
}

describe('a change that loosens nitpicker.config.json', () => {
  const loosened = {
    exclude: ['src/legacy/**', 'src/vendor/**'],
    thresholds: { crapLimit: 20 },
    react: { enabled: false },
  };
  const expected = [
    'exclude added: src/vendor/**',
    'threshold crapLimit raised from 9 to 20',
    'react.enabled: not set -> false',
  ];

  it('fails with one finding per loosening and lists them in the policy block', () => {
    const { exitCode, stdoutText, summary, report, newFindings } = runWithHeadConfig({
      baseConfig: { exclude: ['src/legacy/**'] },
      headConfig: loosened,
    });

    expect(exitCode).toBe(1);
    expect(summary.policyChanges).toEqual(expected);
    expect(summary.policyLoosenings).toEqual(expected);
    expect(summary.policyChangeAccepted).toBe(false);
    expect(policyFindings(newFindings)).toEqual(
      [...expected].sort().map((change) => ({
        rule: 'policy-loosened',
        file: 'nitpicker.config.json',
        message: `${change}. ${ACCEPT_ROUTE}`,
      })),
    );
    expect(policyBlock(stdoutText)).toEqual([HEADING, ...expected.map((change) => `  ${change}`)]);
    expect(policyBlock(report)).toEqual([HEADING, ...expected.map((change) => `  ${change}`)]);
  });

  it('passes when a person accepts it with the flag or the environment variable', () => {
    const flagged = runWithHeadConfig({
      baseConfig: { exclude: ['src/legacy/**'] },
      headConfig: loosened,
      extraArguments: ['--accept-policy-change'],
    });
    const fromEnvironment = runWithHeadConfig({
      baseConfig: { exclude: ['src/legacy/**'] },
      headConfig: loosened,
      environment: { NITPICKER_ACCEPT_POLICY_CHANGE: '1' },
    });

    for (const run of [flagged, fromEnvironment]) {
      expect(run.exitCode).toBe(0);
      expect(run.summary.policyChangeAccepted).toBe(true);
      expect(policyFindings(run.newFindings)).toEqual([]);
      expect(policyBlock(run.stdoutText, ACCEPTED_HEADING)).toEqual([
        ACCEPTED_HEADING,
        ...expected.map((change) => `  ${change}`),
      ]);
    }
  });

  it('counts the whole head config when the base has none', () => {
    const { summary } = runWithHeadConfig({ headConfig: loosened });

    expect(summary.policyLoosenings).toEqual([
      'exclude added: src/legacy/**',
      'exclude added: src/vendor/**',
      ...expected.slice(1),
    ]);
  });

  it('passes a tightening and lists a neutral change without failing', () => {
    const { exitCode, summary } = runWithHeadConfig({
      baseConfig: { exclude: ['src/legacy/**'], thresholds: { crapLimit: 20 } },
      headConfig: { base: 'comparison-base', thresholds: { crapLimit: 12 } },
    });

    expect(exitCode).toBe(0);
    expect(summary.policyLoosenings).toEqual([]);
    expect(summary.policyChanges).toEqual(['base: not set -> "comparison-base"']);
  });

  it('prints nothing when the config did not change', () => {
    const { exitCode, stdoutText, summary } = runWithHeadConfig({
      baseConfig: loosened,
      headConfig: loosened,
    });

    expect(exitCode).toBe(0);
    expect(summary.policyChanges).toEqual([]);
    expect(stdoutText.split('\n').filter((line) => line.startsWith('Policy changed'))).toEqual([]);
  });
});
