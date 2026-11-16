import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli.mts';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mts';
import { finding, findingLine, policy } from '../diff/execution/test-support/analyzer-findings.mts';
import { readJson } from '../diff/git/test-support/fixture-files.mts';
import { LABELS } from './taxonomy.mts';
import {
  commitFiles,
  fakeAnalyzer,
  IN_PROCESS_TASKS,
  useQualityDiffRepositories,
} from '../diff/tests/policy/test-support/quality-diff-harness.mts';

const { createRepository } = useQualityDiffRepositories();

const HIDDEN =
  'Only findings labeled bug (1 finding with other labels hidden). ' +
  'Run nitpicker without --label before you finish.';

function repositoryWithNewFinding() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/main/stable.ts': 'export const stable = true;\n',
  });
  commitFiles(
    repository.root,
    { 'src/main/new.ts': findingLine(finding({ identity: 'introduced' })) },
    'introduce finding',
  );
  return repository;
}

function run(repository, arguments_, outputRoot = 'reports/quality/diff') {
  const output = captureOutput();
  const exitCode = runCli({
    ...IN_PROCESS_TASKS,
    arguments_: [...arguments_, '--output', outputRoot],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: repository.root,
    analyzers: [fakeAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, ...output };
}

describe('runs focused with --label', () => {
  it('hides the findings with other labels and says to finish without --label', () => {
    const repository = repositoryWithNewFinding();

    const focused = run(repository, ['--base', repository.baseRef, '--label', 'bug']);

    expect(focused.exitCode).toBe(0);
    expect(focused.stdoutText).toBe(
      [
        `Base: ${repository.baseRef} (argument)`,
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        HIDDEN,
        `Full diagnostics: ${path.join(repository.outputRoot, 'report.txt')}`,
        '',
      ].join('\n'),
    );
    expect(readJson(repository.outputRoot, 'summary.json').labels).toEqual({
      selected: ['bug'],
      hidden: 1,
      message: HIDDEN,
    });
    expect(readJson(repository.outputRoot, 'new-findings.json')).toEqual([]);
    expect(
      readFileSync(path.join(repository.outputRoot, 'report.txt'), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('Only findings')),
    ).toEqual([HIDDEN]);
  });

  it('lists the findings with the label, and their labels in the JSON output', () => {
    const repository = repositoryWithNewFinding();

    const focused = run(repository, [
      '--base',
      repository.baseRef,
      '--label',
      'maintainability',
      '--json',
    ]);
    const json = JSON.parse(focused.stdoutText);

    expect(focused.exitCode).toBe(1);
    expect(json.labels).toEqual({ selected: ['maintainability'], hidden: 0 });
    expect(json.counts.byLabel).toEqual({ maintainability: 1 });
    expect(json.findings.map(({ labels }) => labels)).toEqual([['maintainability']]);
  });

  it('marks a focused --all run the same way', () => {
    const repository = repositoryWithNewFinding();
    const outputRoot = 'reports/quality/snapshot';

    const focused = run(repository, ['--all', '--label', 'bug'], outputRoot);

    expect(focused.exitCode).toBe(0);
    expect(focused.stdoutText).toBe(
      [
        '',
        'Quality snapshot summary',
        '✓ No enforceable findings',
        'By analyzer:',
        '  1 analyzer ran clean',
        HIDDEN,
        `Full diagnostics: ${path.join(repository.root, outputRoot, 'report.txt')}`,
        '',
      ].join('\n'),
    );
    expect(readJson(path.join(repository.root, outputRoot), 'summary.json').labels.hidden).toBe(1);
  });

  it('counts the failing findings per label without --label', () => {
    const repository = repositoryWithNewFinding();

    const full = run(repository, ['--base', repository.baseRef, '--json']);
    const json = JSON.parse(full.stdoutText);

    expect(full.exitCode).toBe(1);
    expect(json).not.toHaveProperty('labels');
    expect(json.counts.byLabel).toEqual({ maintainability: 1 });
    expect(readJson(repository.outputRoot, 'summary.json').labelCounts).toEqual({
      maintainability: 1,
    });
  });

  it.each([
    [
      ['--label', 'perf'],
      `Unknown --label: perf. Did you mean performance? Known labels: ${LABELS.join(', ')}.`,
    ],
    [
      ['--label', 'bug', '--fix'],
      '--label cannot be combined with --fix: the fixers are chosen by --rule',
    ],
    [
      ['--label', 'bug', '--shard-count', '2', '--shard-index', '0'],
      '--label cannot be combined with --shard-count; shards always run every analyzer',
    ],
  ])('refuses %j', (arguments_, message) => {
    const repository = repositoryWithNewFinding();

    const refused = run(repository, arguments_);

    expect(refused.exitCode).toBe(2);
    expect(refused.stderrText).toBe(`nitpicker failed: ${message}\n`);
  });
});
