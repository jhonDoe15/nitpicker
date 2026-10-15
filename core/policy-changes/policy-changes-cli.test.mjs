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

function runWithHeadConfig({ baseConfig, headConfig }) {
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
    arguments_: ['--base', 'comparison-base', '--output', outputRoot],
    environment: { NO_COLOR: '1' },
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
  };
}

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';

function policyBlock(text) {
  const lines = text.split('\n');
  const start = lines.indexOf(HEADING);
  return lines.slice(start, start + 4);
}

describe('the policy changed block', () => {
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

  it('lists what head loosens against the base config on the console and in summary.json', () => {
    const { exitCode, stdoutText, summary, report } = runWithHeadConfig({
      baseConfig: { exclude: ['src/legacy/**'] },
      headConfig: loosened,
    });

    expect(exitCode).toBe(0);
    expect(summary.policyChanges).toEqual(expected);
    expect(policyBlock(stdoutText)).toEqual([HEADING, ...expected.map((change) => `  ${change}`)]);
    expect(policyBlock(report)).toEqual([HEADING, ...expected.map((change) => `  ${change}`)]);
  });

  it('lists the whole head config when the base has none', () => {
    const { summary } = runWithHeadConfig({ headConfig: loosened });

    expect(summary.policyChanges).toEqual([
      'exclude added: src/legacy/**',
      'exclude added: src/vendor/**',
      ...expected.slice(1),
    ]);
  });

  it('prints nothing when the config did not change', () => {
    const { exitCode, stdoutText, summary } = runWithHeadConfig({
      baseConfig: loosened,
      headConfig: loosened,
    });

    expect(exitCode).toBe(0);
    expect(summary.policyChanges).toEqual([]);
    expect(stdoutText).not.toContain('Policy changed');
  });
});
