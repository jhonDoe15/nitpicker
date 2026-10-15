import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli.mjs';
import { fixtureGit, useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { runTasksInProcess } from '../diff/execution/test-support/in-process-analyzers.mjs';

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

function prepareRepository({ baseConfig, headConfig, headMoves = [], commitHead = false }) {
  const files = {
    'quality-policy.json': '{"marker":"QUALITY_FINDING"}\n',
    'src/a.ts': 'export {};\n',
    'src/legacy/old.ts': 'export {};\n',
    'src/vendor/lib.ts': 'export {};\n',
    'src/view.jsx': 'export {};\n',
  };
  const repository = createGitRepository(
    baseConfig === undefined
      ? files
      : { ...files, 'nitpicker.config.json': JSON.stringify(baseConfig) },
    { prefix: 'nitpicker-policy-changes-' },
  );
  writeFileSync(path.join(repository.root, 'nitpicker.config.json'), JSON.stringify(headConfig));
  for (const [from, to] of headMoves) {
    fixtureGit(repository.root, ['mv', from, to]);
  }
  if (commitHead) {
    fixtureGit(repository.root, ['commit', '--quiet', '--all', '--message', 'head']);
  }
  fixtureGit(repository.root, ['branch', 'comparison-base', repository.baseSha]);
  return repository.root;
}

function temporaryOutput() {
  return path.join(temporaryRoot('nitpicker-policy-output-'), 'reports');
}

function readReports(outputRoot) {
  const read = (name) => readFileSync(path.join(outputRoot, name), 'utf8');
  return {
    summary: JSON.parse(read('summary.json')),
    report: read('report.txt'),
    newFindings: JSON.parse(read('new-findings.json')),
  };
}

function runIn(root, { arguments_, environment = {}, analyzers = [fakeAnalyzer()] }) {
  let stdoutText = '';
  const exitCode = runCli({
    arguments_,
    environment: { NO_COLOR: '1', ...environment },
    currentProjectRoot: root,
    analyzers,
    stdout: { write: (value) => (stdoutText += value) },
    stderr: { write() {} },
    progress: { write() {} },
    runTasks: runTasksInProcess,
  });
  return { exitCode, stdoutText };
}

function runWithHeadConfig({ extraArguments = [], environment = {}, ...repository }) {
  const outputRoot = temporaryOutput();
  const run = runIn(prepareRepository(repository), {
    arguments_: ['--base', 'comparison-base', '--output', outputRoot, ...extraArguments],
    environment,
  });
  return { ...run, ...readReports(outputRoot) };
}

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; loosening accepted with --accept-policy-change):';
const ACCEPT_ROUTE =
  'Stop and ask a person to review this change; they accept it with --accept-policy-change ' +
  '(or NITPICKER_ACCEPT_POLICY_CHANGE=1 in CI).';

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

  it('reports the loosening once when the run is sharded', () => {
    const root = prepareRepository({
      baseConfig: { exclude: ['src/legacy/**'] },
      headConfig: loosened,
      commitHead: true,
    });
    const analyzers = [fakeAnalyzer('fake-first'), fakeAnalyzer('fake-second')];
    const outputRoot = temporaryOutput();
    const shards = [0, 1].map((index) => {
      const shardOutput = path.join(outputRoot, 'shards', String(index));
      runIn(root, {
        arguments_: [
          '--base',
          'comparison-base',
          '--output',
          shardOutput,
          '--shard-count',
          '2',
          '--shard-index',
          String(index),
        ],
        analyzers,
      });
      return readReports(shardOutput);
    });
    const combined = path.join(outputRoot, 'combined');
    const aggregate = runIn(root, {
      arguments_: [
        'aggregate',
        '--input-root',
        path.join(outputRoot, 'shards'),
        '--shard-count',
        '2',
        '--output',
        combined,
      ],
      analyzers,
    });
    const { summary, newFindings } = readReports(combined);

    expect(shards.map((shard) => policyFindings(shard.newFindings).length)).toEqual([3, 0]);
    expect(aggregate.exitCode).toBe(1);
    expect(policyFindings(newFindings).map(({ message }) => message.split('. ')[0])).toEqual(
      [...expected].sort(),
    );
    expect([summary.policyLoosenings, summary.policyChangeAccepted]).toEqual([expected, false]);
  });
});

describe('a change that adopts or keeps the policy', () => {
  it('passes when a first config declares the preset that the project needs', () => {
    for (const headConfig of [{ preset: 'java' }, { preset: 'typescript' }]) {
      const { exitCode, summary } = runWithHeadConfig({ headConfig });

      expect([exitCode, summary.policyLoosenings]).toEqual([0, []]);
    }
  });

  it('passes when the config drops a preset that is the default anyway', () => {
    const { exitCode, summary } = runWithHeadConfig({
      baseConfig: { preset: 'typescript' },
      headConfig: {},
    });

    expect([exitCode, summary.policyLoosenings]).toEqual([0, []]);
  });

  it('still compares a base config that only the new project checks reject', () => {
    const { exitCode, summary } = runWithHeadConfig({
      baseConfig: { preset: 'javascript' },
      headConfig: { preset: 'javascript', exclude: ['src/view.jsx', 'src/legacy/**'] },
    });

    expect([exitCode, summary.policyLoosenings]).toEqual([1, ['exclude added: src/legacy/**']]);
  });

  it('notices a file the change moves under an exclude', () => {
    const config = { exclude: ['src/vendor/**'] };
    const { exitCode, summary } = runWithHeadConfig({
      baseConfig: config,
      headConfig: config,
      headMoves: [['src/a.ts', 'src/vendor/a.ts']],
    });

    expect(exitCode).toBe(0);
    expect(summary.notices).toEqual([
      '1 file this change adds or moves under "exclude" in nitpicker.config.json, so nothing checks it: src/vendor/a.ts. Keep project code out of excluded folders.',
    ]);
  });
});
